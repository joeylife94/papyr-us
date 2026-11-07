import { afterEach, describe, expect, it } from 'vitest';
import type { UpdateWikiPage, WikiPage } from '../../shared/schema';
import {
  resetEditSessions,
  savePage,
  withoutSyncedCopies,
  type PageSaveStore,
} from '../../server/services/page-save';

// Synced block references (#135): a reference shows its original live, with each viewer's own
// access, and stores only `originalBlockId`. The save pipeline (REST, autosave, Yjs) drops a copy
// of the original's content from a reference, so readers of the referencing page never get
// content they may not read at the source. Originals keep their own content.

const SECRET = [{ id: 'o1', type: 'paragraph', content: 'secret original text' }];

const reference = (extra: Record<string, unknown> = {}) => ({
  id: 'ref',
  type: 'synced_block',
  content: '',
  properties: { originalBlockId: 'synced_x', isOriginal: false, ...extra },
  order: 0,
});

describe('withoutSyncedCopies', () => {
  it('drops a reference copy and keeps everything else', () => {
    const original = {
      id: 'orig',
      type: 'synced_block',
      content: '',
      properties: { originalBlockId: 'synced_y', isOriginal: true, syncedContent: SECRET },
      order: 1,
    };
    const paragraph = { id: 'p', type: 'paragraph', content: 'mine', order: 2 };
    expect(
      withoutSyncedCopies([reference({ syncedContent: SECRET }), original, paragraph])
    ).toEqual([reference(), original, paragraph]);
    // A block in the create state (no original yet) keeps no copy either.
    expect(
      withoutSyncedCopies([
        { id: 'n', type: 'synced_block', properties: { syncedContent: SECRET }, order: 0 },
      ])
    ).toEqual([{ id: 'n', type: 'synced_block', properties: {}, order: 0 }]);
  });

  it('returns the same list when nothing carries a copy, and leaves non-lists alone', () => {
    const blocks = [reference(), { id: 'p', type: 'paragraph', content: 'x', order: 1 }];
    expect(withoutSyncedCopies(blocks)).toBe(blocks);
    expect(withoutSyncedCopies(undefined)).toBeUndefined();
    expect(withoutSyncedCopies('x')).toBe('x');
    expect(withoutSyncedCopies([null, 3])).toEqual([null, 3]);
  });
});

describe('savePage with a synced block reference', () => {
  afterEach(() => resetEditSessions());

  it('never stores the copy, whoever sends it, in the page or its content', async () => {
    let page = {
      id: 1,
      title: 'Ref page',
      content: '',
      blocks: [reference()],
      tags: [],
    } as unknown as WikiPage;
    const updates: UpdateWikiPage[] = [];
    const store: PageSaveStore = {
      getPage: async () => page,
      updatePage: async (_id, data) => {
        updates.push(data);
        page = { ...page, ...(data as Partial<WikiPage>) };
        return page;
      },
      snapshotVersion: async () => {},
    };
    for (const mode of ['autosave', 'manual'] as const) {
      await savePage(
        store,
        1,
        {
          blocks: [
            reference({ syncedContent: SECRET }),
            { id: 'p', type: 'paragraph', content: mode, order: 1 },
          ],
        } as UpdateWikiPage,
        mode
      );
    }
    expect(updates).toHaveLength(2);
    expect(JSON.stringify(updates)).not.toContain('secret original text');
    expect(JSON.stringify(page)).not.toContain('secret original text');
    expect((page.blocks as any[])[0]).toEqual(reference());
  });
});
