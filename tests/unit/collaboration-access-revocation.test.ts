import { describe, expect, it, vi } from 'vitest';
import {
  notifyPageAccessChanged,
  onPageAccessChanged,
} from '../../server/services/page-access-events';
import { revalidateCollabUserAccess } from '../../server/services/socket';
import {
  YjsCollaborationManager,
  type CollabConfig,
} from '../../server/services/yjs-collaboration';

// Realtime sessions check page access once at join. When a user's access shrinks (for example,
// they leave the page's team), open sessions are checked again: a session that lost read access
// stops sending and receiving, and one that lost edit access can no longer write.

const yjsConfig: CollabConfig = {
  requireAuth: false,
  saveDebounceMs: 1000,
  snapshotIntervalMs: 5000,
  docTtlMs: 1000,
  maxDocs: 10,
  maxClientsPerDoc: 10,
  rateLimitUpdatesPerSec: 50,
  rateLimitAwarenessPerSec: 30,
  rateLimitSavesPerMin: 6,
  maxUpdateBytes: 1024,
};

const REMOVED_USER = 7;
const OTHER_USER = 8;

/** Read access per user and page, and the user grant getUserPagePermission reports. */
function createStorage(
  canRead: Record<string, boolean>,
  grants: Record<string, 'viewer' | 'editor' | 'owner' | null>
) {
  return {
    getWikiPage: vi.fn().mockResolvedValue({ blocks: [] }),
    updateWikiPage: vi.fn(),
    checkPagePermission: vi.fn(
      async (userId: number, pageId: number) => canRead[`${userId}:${pageId}`] ?? false
    ),
    getUserPagePermission: vi.fn(
      async (userId: number, pageId: number) => grants[`${userId}:${pageId}`] ?? null
    ),
  };
}

function fakeSocket(id: string, data: Record<string, unknown>) {
  const roomEmit = vi.fn();
  return {
    id,
    data,
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    to: vi.fn(() => ({ emit: roomEmit })),
    roomEmit,
  };
}

describe('page access change notices', () => {
  it('reaches every subscriber, survives a failing one, and stops after unsubscribe', async () => {
    const seen: number[] = [];
    const unsubscribeOk = onPageAccessChanged(async (userId) => {
      seen.push(userId);
    });
    const unsubscribeFailing = onPageAccessChanged(async () => {
      throw new Error('subscriber failed');
    });

    await expect(notifyPageAccessChanged(REMOVED_USER)).resolves.toBeUndefined();
    expect(seen).toEqual([REMOVED_USER]);

    unsubscribeOk();
    unsubscribeFailing();
    await notifyPageAccessChanged(OTHER_USER);
    expect(seen).toEqual([REMOVED_USER]);
  });
});

describe('Yjs sessions are re-checked when access shrinks', () => {
  it('detaches a socket that lost read access and downgrades one that lost edit access', async () => {
    const lostRead = fakeSocket('lost-read', { userId: REMOVED_USER, canEdit: true });
    const lostEdit = fakeSocket('lost-edit', { userId: REMOVED_USER, canEdit: true });
    const otherUser = fakeSocket('other-user', { userId: OTHER_USER, canEdit: true });
    const namespace = {
      sockets: new Map([lostRead, lostEdit, otherUser].map((socket) => [socket.id, socket])),
      to: vi.fn(() => ({ except: vi.fn(() => ({ emit: vi.fn() })), emit: vi.fn() })),
    } as any;
    const storage = createStorage(
      { [`${REMOVED_USER}:1`]: false, [`${REMOVED_USER}:2`]: true },
      { [`${REMOVED_USER}:2`]: null }
    );
    const manager = new YjsCollaborationManager(namespace, storage as any, yjsConfig);

    for (const [socket, documentId, pageId] of [
      [lostRead, 'page-1', 1],
      [otherUser, 'page-1', 1],
      [lostEdit, 'page-2', 2],
    ] as const) {
      await manager.joinDocument(socket as any, documentId, pageId);
      socket.data.documentId = documentId;
    }

    await manager.revalidateUserAccess(REMOVED_USER);

    // Lost read: out of the document and its room, so updates neither reach nor leave it.
    expect(lostRead.leave).toHaveBeenCalledWith('page-1');
    expect(lostRead.data).toMatchObject({ documentId: undefined, canEdit: false });
    expect(lostRead.emit).toHaveBeenCalledWith(
      'yjs:error',
      expect.objectContaining({ code: 'ACCESS_REVOKED' })
    );
    expect(manager.getUserCount('page-1')).toBe(1);

    // Lost edit only: still joined, but writes are refused from now on.
    expect(lostEdit.leave).not.toHaveBeenCalled();
    expect(lostEdit.data).toMatchObject({ documentId: 'page-2', canEdit: false });
    expect(manager.getUserCount('page-2')).toBe(1);

    // Other users' sessions are not touched.
    expect(otherUser.data.canEdit).toBe(true);
    expect(storage.checkPagePermission).not.toHaveBeenCalledWith(OTHER_USER, 1, 'viewer');

    manager.leaveDocument(otherUser as any);
    manager.leaveDocument(lostEdit as any);
  });

  it('keeps a session whose access is unchanged', async () => {
    const socket = fakeSocket('kept', { userId: REMOVED_USER, canEdit: true });
    const namespace = {
      sockets: new Map([[socket.id, socket]]),
      to: vi.fn(() => ({ except: vi.fn(() => ({ emit: vi.fn() })), emit: vi.fn() })),
    } as any;
    const storage = createStorage(
      { [`${REMOVED_USER}:3`]: true },
      { [`${REMOVED_USER}:3`]: 'editor' }
    );
    const manager = new YjsCollaborationManager(namespace, storage as any, yjsConfig);
    await manager.joinDocument(socket as any, 'page-3', 3);
    socket.data.documentId = 'page-3';

    await manager.revalidateUserAccess(REMOVED_USER);

    expect(socket.leave).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.data).toMatchObject({ documentId: 'page-3', canEdit: true });
    manager.leaveDocument(socket as any);
  });
});

describe('legacy /collab sessions are re-checked when access shrinks', () => {
  it('removes a socket that lost read access from its page and downgrades lost edit access', async () => {
    const lostRead = fakeSocket('lost-read', { userIdNum: REMOVED_USER, pageId: 1, canEdit: true });
    const lostEdit = fakeSocket('lost-edit', { userIdNum: REMOVED_USER, pageId: 2, canEdit: true });
    const otherUser = fakeSocket('other-user', { userIdNum: OTHER_USER, pageId: 1, canEdit: true });
    const namespace = {
      sockets: new Map([lostRead, lostEdit, otherUser].map((socket) => [socket.id, socket])),
    } as any;
    const storage = createStorage(
      { [`${REMOVED_USER}:1`]: false, [`${REMOVED_USER}:2`]: true },
      { [`${REMOVED_USER}:2`]: 'viewer' }
    );
    const collaborationManager = { leaveSession: vi.fn() };

    await revalidateCollabUserAccess(
      namespace,
      storage as any,
      collaborationManager as any,
      REMOVED_USER
    );

    expect(collaborationManager.leaveSession).toHaveBeenCalledTimes(1);
    expect(collaborationManager.leaveSession).toHaveBeenCalledWith('lost-read');
    expect(lostRead.leave).toHaveBeenCalledWith('page:1');
    expect(lostRead.data).toMatchObject({ pageId: undefined, canEdit: false });
    expect(lostRead.roomEmit).toHaveBeenCalledWith(
      'user-left',
      expect.objectContaining({ userId: String(REMOVED_USER) })
    );
    expect(lostRead.emit).toHaveBeenCalledWith(
      'collab:error',
      expect.objectContaining({ code: 'ACCESS_REVOKED' })
    );

    expect(lostEdit.leave).not.toHaveBeenCalled();
    expect(lostEdit.data).toMatchObject({ pageId: 2, canEdit: false, userPermission: 'viewer' });

    expect(otherUser.data).toMatchObject({ pageId: 1, canEdit: true });
  });
});
