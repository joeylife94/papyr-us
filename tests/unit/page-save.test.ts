import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, UpdateWikiPage, WikiPage } from '../../shared/schema';
import { blocksToContent } from '../../client/src/lib/page-content';
import {
  checkpointPage,
  derivePageContent,
  hasOpenEditSession,
  resetEditSessions,
  savePage,
  setAutosaveIdleMs,
  setSessionClosedHandler,
  snapshotBeforeRestore,
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
  };
  return { store, snapshots, updates, current: () => page };
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
    const content = '## Plan\n\n- a\n- b\n\n- [x] ship\n\n---';
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
