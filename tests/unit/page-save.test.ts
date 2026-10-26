import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, UpdateWikiPage, WikiPage } from '../../shared/schema';
import { blocksToContent } from '../../client/src/lib/page-content';
import {
  checkpointPage,
  derivePageContent,
  hasOpenEditSession,
  indexNewPageLinks,
  pageLinkTargets,
  resetEditSessions,
  savePage,
  setAutosaveIdleMs,
  setSessionClosedHandler,
  snapshotBeforeRestore,
  writeRestoredPage,
  type PageSaveStore,
  type SessionClosedEvent,
} from '../../server/services/page-save';

const IDLE = 1000;

function makePage(overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    id: 1,
    title: 'Handbook',
    slug: 'handbook',
    content: 'v0',
    blocks: [{ id: 'b0', type: 'paragraph', content: 'v0' }],
    folder: 'docs',
    tags: ['ops'],
    author: 'alice',
    parentId: null,
    teamId: 7,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    isPublished: true,
    metadata: {},
    deletedAt: null,
    ...overrides,
  } as WikiPage;
}

function makeStore(initial: WikiPage) {
  let page = initial;
  const snapshots: Array<{ content: string; description: string }> = [];
  const updates: UpdateWikiPage[] = [];
  const linkSyncs: Array<{ pageId: number; targetIds: number[] }> = [];
  const store: PageSaveStore = {
    getPage: async (id) => (id === page.id ? page : undefined),
    updatePage: async (id, data) => {
      if (id !== page.id) return undefined;
      updates.push(data);
      page = { ...page, ...(data as Partial<WikiPage>) };
      return page;
    },
    snapshotVersion: async (p, description) => {
      snapshots.push({ content: p.content, description });
    },
    syncLinks: async (pageId, targetIds) => {
      linkSyncs.push({ pageId, targetIds });
    },
  };
  return { store, snapshots, updates, linkSyncs, current: () => page };
}

describe('derivePageContent', () => {
  it('joins block contents with blank lines, as the editor did', () => {
    expect(
      derivePageContent([
        { type: 'heading', content: '# Title' },
        { type: 'paragraph', content: 'Body' },
      ])
    ).toBe('# Title\n\nBody');
  });

  it('treats blocks without string content as empty and non-arrays as no content', () => {
    expect(derivePageContent([{ type: 'image' }, { content: 'x' }])).toBe('\n\nx');
    expect(derivePageContent(undefined)).toBe('');
    expect(derivePageContent({})).toBe('');
  });

  it('writes structural blocks as Markdown, the same string the editor derives (#113 §1)', () => {
    const blocks = [
      { id: 'h', type: 'heading2', content: 'Plan', properties: {}, order: 0, children: [] },
      { id: 'a', type: 'bulleted_list', content: 'a', properties: {}, order: 1, children: [] },
      { id: 'b', type: 'bulleted_list', content: 'b', properties: {}, order: 2, children: [] },
      {
        id: 't',
        type: 'checkbox',
        content: 'ship',
        properties: { checked: true },
        order: 3,
        children: [],
      },
      { id: 'd', type: 'divider', content: '', properties: {}, order: 4, children: [] },
    ] as Block[];
    const content = '## Plan\n\n- a\n- b\n\n* [x] ship\n\n---';
    expect(derivePageContent(blocks)).toBe(content);
    expect(blocksToContent(blocks)).toBe(content);
  });
});

describe('savePage', () => {
  let closed: SessionClosedEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    resetEditSessions();
    setAutosaveIdleMs(IDLE);
    closed = [];
    setSessionClosedHandler((event) => closed.push(event));
  });

  afterEach(() => {
    resetEditSessions();
    setSessionClosedHandler(null);
    vi.useRealTimers();
  });

  it('manual save keeps one pre-save version per save and the content the client sent', async () => {
    const { store, snapshots, current } = makeStore(makePage());
    await savePage(store, 1, { content: 'typed', blocks: [{ content: 'other' }] }, 'manual');
    await savePage(store, 1, { content: 'typed 2' }, 'manual');
    expect(snapshots.map((s) => s.content)).toEqual(['v0', 'typed']);
    expect(current().content).toBe('typed 2');
  });

  it('manual save derives content when only blocks are sent', async () => {
    const { store, current } = makeStore(makePage());
    await savePage(store, 1, { blocks: [{ content: 'a' }, { content: 'b' }] }, 'manual');
    expect(current().content).toBe('a\n\nb');
  });

  it('manual save without body changes records no version', async () => {
    const { store, snapshots } = makeStore(makePage());
    await savePage(store, 1, { tags: ['ops', 'new'] }, 'manual');
    expect(snapshots).toHaveLength(0);
  });

  it('autosave records one version per editing session and always derives content', async () => {
    const { store, snapshots, current } = makeStore(makePage());
    await savePage(store, 1, { blocks: [{ content: 'one' }], content: 'ignored' }, 'autosave');
    await savePage(store, 1, { blocks: [{ content: 'two' }] }, 'autosave');
    await savePage(store, 1, { blocks: [{ content: 'three' }] }, 'autosave');

    expect(snapshots).toEqual([{ content: 'v0', description: 'Before editing session' }]);
    expect(current().content).toBe('three');
    expect(hasOpenEditSession(1)).toBe(true);
  });

  it('closes the session after the idle window and starts a new version afterwards', async () => {
    const { store, snapshots } = makeStore(makePage());
    await savePage(store, 1, { blocks: [{ content: 'one' }], tags: ['ops', 'x'] }, 'autosave');
    await vi.advanceTimersByTimeAsync(IDLE + 10);

    expect(hasOpenEditSession(1)).toBe(false);
    expect(closed).toHaveLength(1);
    expect(closed[0].reason).toBe('idle');
    expect(closed[0].tagsAtStart).toEqual(['ops']);
    expect(closed[0].page.tags).toEqual(['ops', 'x']);

    await savePage(store, 1, { blocks: [{ content: 'two' }] }, 'autosave');
    expect(snapshots.map((s) => s.content)).toEqual(['v0', 'one']);
  });

  it('a title-only autosave keeps the pre-session version (versions record the title)', async () => {
    const { store, snapshots } = makeStore(makePage({ title: 'Original' }));
    await savePage(store, 1, { title: 'Renamed' }, 'autosave');
    await savePage(store, 1, { title: 'Renamed again' }, 'autosave');
    expect(snapshots).toEqual([{ content: 'v0', description: 'Before editing session' }]);
  });

  it('a session that starts with tags only keeps a version at its first title/body change', async () => {
    const { store, snapshots } = makeStore(makePage());
    await savePage(store, 1, { tags: ['ops', 'later'] }, 'autosave');
    expect(snapshots).toHaveLength(0);
    await savePage(store, 1, { blocks: [{ content: 'edited' }] }, 'autosave');
    await savePage(store, 1, { blocks: [{ content: 'edited more' }] }, 'autosave');
    expect(snapshots).toEqual([{ content: 'v0', description: 'Before editing session' }]);
  });

  it('each autosave pushes the idle deadline back', async () => {
    const { store } = makeStore(makePage());
    await savePage(store, 1, { blocks: [{ content: 'one' }] }, 'autosave');
    await vi.advanceTimersByTimeAsync(IDLE - 100);
    await savePage(store, 1, { blocks: [{ content: 'two' }] }, 'autosave');
    await vi.advanceTimersByTimeAsync(IDLE - 100);
    expect(hasOpenEditSession(1)).toBe(true);
    expect(closed).toHaveLength(0);
  });

  it('a checkpoint closes the session and reports it once', async () => {
    const { store } = makeStore(makePage());
    expect(await checkpointPage(1)).toBe(false);
    await savePage(store, 1, { blocks: [{ content: 'one' }] }, 'autosave');
    expect(await checkpointPage(1)).toBe(true);
    expect(closed.map((e) => e.reason)).toEqual(['checkpoint']);
    await vi.advanceTimersByTimeAsync(IDLE * 2);
    expect(closed).toHaveLength(1);
  });

  it('a manual save closes an open autosave session before its own snapshot', async () => {
    const { store, snapshots } = makeStore(makePage());
    await savePage(store, 1, { blocks: [{ content: 'auto' }] }, 'autosave');
    await savePage(store, 1, { content: 'manual' }, 'manual');
    expect(closed.map((e) => e.reason)).toEqual(['manual-save']);
    expect(snapshots.map((s) => s.content)).toEqual(['v0', 'auto']);
  });

  it('a restore snapshots the current state first and closes the session', async () => {
    const { store, snapshots } = makeStore(makePage());
    await savePage(store, 1, { blocks: [{ content: 'latest' }] }, 'autosave');
    await snapshotBeforeRestore(store, 1);
    expect(closed.map((e) => e.reason)).toEqual(['restore']);
    expect(snapshots).toEqual([
      { content: 'v0', description: 'Before editing session' },
      { content: 'latest', description: 'Before restore' },
    ]);
  });

  it('a failed snapshot does not block the save', async () => {
    const { store, current } = makeStore(makePage());
    store.snapshotVersion = async () => {
      throw new Error('db down');
    };
    await savePage(store, 1, { content: 'still saved' }, 'manual');
    expect(current().content).toBe('still saved');
  });

  it('returns undefined for a missing page without touching sessions', async () => {
    const { store } = makeStore(makePage());
    expect(await savePage(store, 99, { content: 'x' }, 'autosave')).toBeUndefined();
    expect(hasOpenEditSession(99)).toBe(false);
  });
});

describe('page link index (#103 E6)', () => {
  const paragraph = (content: string) => ({ id: content, type: 'paragraph', content });

  beforeEach(() => {
    vi.useFakeTimers();
    resetEditSessions();
    setAutosaveIdleMs(IDLE);
  });

  afterEach(() => {
    resetEditSessions();
    vi.useRealTimers();
  });

  it('takes distinct targets from blocks, else from content, without self-links', () => {
    expect(
      pageLinkTargets(1, {
        blocks: [paragraph('[[page:3]] [[page:1]]'), paragraph('[[page:3]] then [[page:2]]')],
        content: '[[page:9]]',
      })
    ).toEqual([3, 2]);
    expect(pageLinkTargets(1, { blocks: [], content: 'see [[page:4]] and [[page:4]]' })).toEqual([
      4,
    ]);
    expect(pageLinkTargets(1, { content: 'no links [[page:x]] [[Page:2]]' })).toEqual([]);
  });

  it('manual save replaces the links from the saved blocks', async () => {
    const { store, linkSyncs } = makeStore(makePage());
    await savePage(
      store,
      1,
      { blocks: [paragraph('to [[page:5]] and [[page:6]] and [[page:5]]')] },
      'manual'
    );
    expect(linkSyncs).toEqual([{ pageId: 1, targetIds: [5, 6] }]);
  });

  it('autosave (REST) and a blocks-only Yjs-style save replace the links on every body change', async () => {
    const { store, linkSyncs } = makeStore(makePage());
    await savePage(store, 1, { blocks: [paragraph('[[page:5]]')] }, 'autosave');
    // What the Yjs server sends: blocks only, through the same autosave pipeline.
    await savePage(store, 1, { blocks: [paragraph('[[page:7]] [[page:1]]')] }, 'autosave');
    await savePage(store, 1, { blocks: [paragraph('no links left')] }, 'autosave');
    expect(linkSyncs).toEqual([
      { pageId: 1, targetIds: [5] },
      { pageId: 1, targetIds: [7] },
      { pageId: 1, targetIds: [] },
    ]);
  });

  it('a content-only write indexes its content, not the stored blocks', async () => {
    const { store, linkSyncs } = makeStore(
      makePage({ blocks: [paragraph('[[page:8]]')] as WikiPage['blocks'] })
    );
    await savePage(store, 1, { content: 'now [[page:9]]' }, 'manual');
    expect(linkSyncs).toEqual([{ pageId: 1, targetIds: [9] }]);
  });

  it('leaves the links alone when the body did not change or was not written', async () => {
    const page = makePage();
    const { store, linkSyncs } = makeStore(page);
    await savePage(store, 1, { tags: ['ops', 'more'] }, 'autosave');
    await savePage(store, 1, { title: 'Renamed' }, 'manual');
    await savePage(store, 1, { blocks: page.blocks as any[] }, 'autosave');
    expect(linkSyncs).toEqual([]);
  });

  it('a failed link sync does not fail the save', async () => {
    const { store, current } = makeStore(makePage());
    store.syncLinks = async () => {
      throw new Error('db down');
    };
    const saved = await savePage(store, 1, { blocks: [paragraph('[[page:5]]')] }, 'autosave');
    expect(saved?.after.content).toBe('[[page:5]]');
    expect(current().content).toBe('[[page:5]]');
  });

  it('indexes a created page only when it links somewhere', async () => {
    const { store, linkSyncs } = makeStore(makePage());
    await indexNewPageLinks(store, { id: 4, blocks: [], content: 'plain' });
    await indexNewPageLinks(store, {
      id: 4,
      blocks: [paragraph('[[page:2]] [[page:4]]')],
      content: '',
    });
    expect(linkSyncs).toEqual([{ pageId: 4, targetIds: [2] }]);
  });

  it('a restore writes the version and re-indexes its links', async () => {
    const { store, linkSyncs, current } = makeStore(makePage());
    await writeRestoredPage(store, 1, {
      title: 'Restored',
      content: 'old [[page:3]]',
      blocks: [paragraph('old [[page:3]]')],
    });
    expect(current().title).toBe('Restored');
    expect(linkSyncs).toEqual([{ pageId: 1, targetIds: [3] }]);
  });
});
