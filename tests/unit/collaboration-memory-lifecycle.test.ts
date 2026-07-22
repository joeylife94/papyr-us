import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CollaborationManager,
  type LegacyCollabConfig,
} from '../../server/services/socket';
import {
  YjsCollaborationManager,
  type CollabConfig,
} from '../../server/services/yjs-collaboration';

const legacyConfig: LegacyCollabConfig = {
  requireAuth: false,
  saveDebounceMs: 1000,
  snapshotIntervalMs: 5000,
  docTtlMs: 1000,
  maxDocs: 10,
  maxClientsPerDoc: 10,
  rateLimitDocChangesPerSec: 50,
  rateLimitCursorPerSec: 30,
  rateLimitTypingPerSec: 20,
  rateLimitSavesPerMin: 6,
  maxPayloadBytes: 1024,
  maxRetainedChanges: 2,
};

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

afterEach(() => {
  vi.useRealTimers();
});

describe('collaboration memory lifecycle', () => {
  it('moves a legacy socket between pages without retaining the old session membership', () => {
    vi.useFakeTimers();
    const manager = new CollaborationManager({ updateWikiPage: vi.fn() } as any, legacyConfig);
    const user = { id: '42', name: 'User' };

    manager.joinSession(1, 'socket-1', user);
    manager.joinSession(2, 'socket-1', user);

    expect(manager.getUserCount(1)).toBe(0);
    expect(manager.getUserCount(2)).toBe(1);
  });

  it('retains only bounded metadata while keeping one latest block snapshot', () => {
    const manager = new CollaborationManager({ updateWikiPage: vi.fn() } as any, legacyConfig);
    manager.joinSession(1, 'socket-1', { id: '42', name: 'User' });
    const blocks = Array.from({ length: 100 }, (_, id) => ({ id, text: 'x'.repeat(100) }));

    for (let index = 0; index < 4; index += 1) {
      manager.addChange(1, {
        pageId: 1,
        blockId: String(index),
        type: 'update',
        data: { blocks },
        timestamp: index,
        userId: '42',
      });
    }

    const session = manager.getSession(1)!;
    expect(session.latestBlocks).toBe(blocks);
    expect(session.changes).toHaveLength(2);
    expect(session.changes.every((change) => !change.data?.blocks)).toBe(true);
    expect(session.changes[0].data).toEqual({ blockCount: 100 });
  });

  it('moves a Yjs socket between documents and releases the previous membership', async () => {
    vi.useFakeTimers();
    const namespace = {
      to: vi.fn(() => ({
        except: vi.fn(() => ({ emit: vi.fn() })),
        emit: vi.fn(),
      })),
    } as any;
    const storage = {
      getWikiPage: vi.fn().mockResolvedValue({ blocks: [] }),
      updateWikiPage: vi.fn(),
    } as any;
    const socket = {
      id: 'socket-1',
      data: { canEdit: true, userPermission: 'editor' },
      join: vi.fn(),
      leave: vi.fn(),
    } as any;
    const manager = new YjsCollaborationManager(namespace, storage, yjsConfig);

    await manager.joinDocument(socket, 'page-1', 1);
    await manager.joinDocument(socket, 'page-2', 2);

    expect(manager.getUserCount('page-1')).toBe(0);
    expect(manager.getUserCount('page-2')).toBe(1);
    expect(socket.leave).toHaveBeenCalledWith('page-1');

    manager.leaveDocument(socket);
    expect(manager.getUserCount('page-2')).toBe(0);
  });
});
