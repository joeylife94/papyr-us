import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollaborationManager, type LegacyCollabConfig } from '../../server/services/socket';
import {
  YjsCollaborationManager,
  type CollabConfig,
} from '../../server/services/yjs-collaboration';
import { resetEditSessions } from '../../server/services/page-save';

// Issue #103 E1/E6: both realtime save paths write through the page save pipeline, so stored
// `content` follows the blocks and the page's link index (`page_links`) follows its tokens.
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

const blocks = [
  { id: 'b1', type: 'paragraph', content: 'See [[page:12]]' },
  { id: 'b2', type: 'paragraph', content: 'and [[page:7]] [[page:12]]' },
];

function fakeStorage() {
  const page = {
    id: 7,
    title: 'Page',
    slug: 'page',
    content: 'old',
    blocks: [],
    tags: [],
    author: 'a',
  };
  return {
    getWikiPage: vi.fn().mockResolvedValue(page),
    updateWikiPage: vi.fn(async (_id: number, data: any) => ({ ...page, ...data })),
    replacePageLinks: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(() => {
  resetEditSessions();
  vi.useRealTimers();
});

describe('realtime saves go through the page save pipeline', () => {
  it('legacy Socket.IO saves derive content and re-index links', async () => {
    const storage = fakeStorage();
    const manager = new CollaborationManager(storage as any, legacyConfig);
    manager.joinSession(7, 'socket-1', { id: '42', name: 'User' });
    manager.addChange(7, {
      pageId: 7,
      blockId: 'b1',
      type: 'update',
      data: { blocks },
      timestamp: 1,
      userId: '42',
    });

    await manager.saveSession(7, 'debounce');

    expect(storage.updateWikiPage).toHaveBeenCalledWith(7, {
      blocks,
      content: 'See [[page:12]]\n\nand [[page:7]] [[page:12]]',
    });
    // Self-links (page 7) and duplicates are dropped before the index is written.
    expect(storage.replacePageLinks).toHaveBeenCalledWith(7, [12], {
      expectedContent: expect.any(String),
    });
    manager.leaveSession('socket-1');
  });

  it('Yjs saves re-index links from the shared document', async () => {
    const storage = fakeStorage();
    const namespace = {
      to: vi.fn(() => ({ except: vi.fn(() => ({ emit: vi.fn() })), emit: vi.fn() })),
    } as any;
    const manager = new YjsCollaborationManager(namespace, storage as any, yjsConfig);
    const doc = await manager.getOrCreate('page-7', 7);
    doc.ydoc.getArray('blocks').push(blocks);
    manager.markDirty('page-7');

    await manager.saveDoc('page-7', 'manual');

    expect(storage.replacePageLinks).toHaveBeenCalledWith(7, [12], {
      expectedContent: expect.any(String),
    });
  });
});
