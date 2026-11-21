import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UpdateWikiPage, WikiPage } from '../../shared/schema';
import {
  PageRevisionConflictError,
  pageFieldRevisions,
  pageRevision,
} from '../../server/services/page-revision';
import {
  hasOpenEditSession,
  resetEditSessions,
  savePage,
  setAutosaveIdleMs,
  setSessionClosedHandler,
  type PageSaveStore,
} from '../../server/services/page-save';

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
    icon: null,
    deletedAt: null,
    ...overrides,
  } as WikiPage;
}

const block = (content: string) => [{ id: 'b0', type: 'paragraph', content }];

/** A store like the production one: it also refuses a write whose revision is no longer current. */
function makeStore(initial: WikiPage) {
  let page = initial;
  const snapshots: Array<{ title: string; content: string; description: string }> = [];
  const updates: UpdateWikiPage[] = [];
  const ifRevisions: Array<string | undefined> = [];
  const store: PageSaveStore = {
    getPage: async (id) => (id === page.id ? page : undefined),
    updatePage: async (id, data, options) => {
      if (id !== page.id) return undefined;
      ifRevisions.push(options?.ifRevision);
      if (options?.ifRevision !== undefined && options.ifRevision !== pageRevision(page)) {
        throw new PageRevisionConflictError(page);
      }
      updates.push(data);
      page = { ...page, ...(data as Partial<WikiPage>) };
      return page;
    },
    snapshotVersion: async (p, description) => {
      snapshots.push({ title: p.title, content: p.content, description });
    },
  };
  return {
    store,
    snapshots,
    updates,
    ifRevisions,
    current: () => page,
    /** Someone else saves in between (the stored page moves on without going through savePage). */
    changeBehindTheBack: (patch: Partial<WikiPage>) => {
      page = { ...page, ...patch };
    },
  };
}

beforeEach(() => {
  setAutosaveIdleMs(1000);
});
afterEach(() => {
  resetEditSessions();
});

describe('pageRevision', () => {
  it('is the same for the same page however the stored JSON is ordered', () => {
    const a = makePage({ blocks: [{ id: 'b0', type: 'paragraph', content: 'x' }] });
    const b = makePage({ blocks: [{ content: 'x', type: 'paragraph', id: 'b0' }] });
    expect(pageRevision(a)).toBe(pageRevision(b));
  });

  it.each([
    ['title', { title: 'Other' }],
    ['content', { content: 'v1' }],
    ['blocks', { blocks: block('v1') }],
    ['tags', { tags: ['ops', 'new'] }],
    ['folder', { folder: 'ideas' }],
    ['icon', { icon: '🔥' }],
    ['cover', { metadata: { cover: { type: 'preset', id: 'ocean' } } }],
  ] as Array<[string, Partial<WikiPage>]>)('changes when the %s changes', (_name, patch) => {
    expect(pageRevision(makePage(patch))).not.toBe(pageRevision(makePage()));
  });

  it('does not change with fields no save of the editor writes', () => {
    const base = pageRevision(makePage());
    expect(pageRevision(makePage({ updatedAt: new Date(99999) }))).toBe(base);
    expect(pageRevision(makePage({ parentId: 4, position: 2 }))).toBe(base);
  });
});

describe('the autosave session report of a manual save', () => {
  async function run(withBase: boolean) {
    resetEditSessions();
    const { store, current } = makeStore(makePage());
    const reports: Array<{ reason: string; tagsAtStart: string[]; tagsNow: string[] }> = [];
    setSessionClosedHandler((event) =>
      reports.push({
        reason: event.reason,
        tagsAtStart: event.tagsAtStart,
        tagsNow: event.page.tags,
      })
    );
    await savePage(store, 1, { content: 'edited', blocks: block('edited') }, 'autosave');
    await savePage(store, 1, { tags: ['ops', 'manual-tag'] }, 'manual', {
      baseRevision: withBase ? pageRevision(current()) : undefined,
    });
    return reports;
  }
  afterEach(() => setSessionClosedHandler(null));

  it.each([
    ['without', false],
    ['with', true],
  ])(
    '%s a base reports the page as it was before the save, so a tag added by it is reported once',
    async (_n, withBase) => {
      const reports = await run(withBase);
      expect(reports).toEqual([{ reason: 'manual-save', tagsAtStart: ['ops'], tagsNow: ['ops'] }]);
    }
  );

  it('a manual save refused at the lock closes no session and fires nothing', async () => {
    const { store, changeBehindTheBack } = makeStore(makePage());
    const reports: string[] = [];
    setSessionClosedHandler((event) => reports.push(event.reason));
    await savePage(store, 1, { blocks: block('edited') }, 'autosave');
    const base = pageRevision(makePage({ content: 'edited', blocks: block('edited') }));
    const getPage = store.getPage;
    store.getPage = async (id) => {
      const page = await getPage(id);
      changeBehindTheBack({ tags: ['raced'] });
      return page;
    };
    await expect(
      savePage(store, 1, { tags: ['mine'] }, 'manual', { baseRevision: base })
    ).rejects.toBeInstanceOf(PageRevisionConflictError);
    expect(reports).toEqual([]);
    expect(hasOpenEditSession(1)).toBe(true);
  });
});

describe('pageFieldRevisions', () => {
  it.each([
    ['title', { title: 'Other' }],
    ['blocks', { blocks: block('v1'), content: 'v1' }],
    ['tags', { tags: ['ops', 'new'] }],
    ['folder', { folder: 'ideas' }],
    ['icon', { icon: '📘' }],
    ['cover', { metadata: { cover: { type: 'preset', id: 'dawn' } } }],
  ] as const)('a change to %s changes that field only', (field, change) => {
    const before = pageFieldRevisions(makePage());
    const after = pageFieldRevisions(makePage(change as Partial<WikiPage>));
    for (const name of Object.keys(before) as Array<keyof typeof before>) {
      if (name === field) expect(after[name]).not.toBe(before[name]);
      else expect(after[name]).toBe(before[name]);
    }
  });

  it('does not change with metadata other than the cover, or with the order of stored keys', () => {
    const before = pageFieldRevisions(makePage());
    expect(pageFieldRevisions(makePage({ metadata: { other: 1 } }))).toEqual(before);
    expect(
      pageFieldRevisions(
        makePage({ blocks: [{ content: 'v0', type: 'paragraph', id: 'b0' }] as WikiPage['blocks'] })
      )
    ).toEqual(before);
  });
});

describe('savePage with a base revision', () => {
  it('refuses a stale base: the page is not written and no editing session opens', async () => {
    const stale = pageRevision(makePage());
    const stored = makePage({ content: 'by someone else', blocks: block('by someone else') });
    const { store, updates, current } = makeStore(stored);

    await expect(
      savePage(store, 1, { blocks: block('mine') }, 'autosave', { baseRevision: stale })
    ).rejects.toMatchObject({ name: 'PageRevisionConflictError', current: stored });
    expect(updates).toEqual([]);
    expect(current()).toEqual(stored);
    expect(hasOpenEditSession(1)).toBe(false);
  });

  it('refuses a stale manual save the same way', async () => {
    const stored = makePage({ title: 'Renamed by someone else' });
    const { store, updates } = makeStore(stored);
    await expect(
      savePage(store, 1, { title: 'Mine' }, 'manual', { baseRevision: pageRevision(makePage()) })
    ).rejects.toBeInstanceOf(PageRevisionConflictError);
    expect(updates).toEqual([]);
  });

  it('keeps the refused text and the page as it is now in the version history', async () => {
    const stored = makePage({ content: 'theirs', blocks: block('theirs') });
    const { store, snapshots } = makeStore(stored);
    await expect(
      savePage(store, 1, { title: 'My title', blocks: block('mine') }, 'autosave', {
        baseRevision: pageRevision(makePage()),
      })
    ).rejects.toBeInstanceOf(PageRevisionConflictError);
    expect(snapshots).toEqual([
      { title: 'Handbook', content: 'theirs', description: 'Latest when a save was refused' },
      { title: 'My title', content: 'mine', description: 'Not saved: based on an older revision' },
    ]);
  });

  it('records no version for a refused save that changes no title or body', async () => {
    const stored = makePage({ content: 'theirs', blocks: block('theirs') });
    const { store, snapshots } = makeStore(stored);
    await expect(
      savePage(store, 1, { tags: ['mine'] }, 'autosave', { baseRevision: pageRevision(makePage()) })
    ).rejects.toBeInstanceOf(PageRevisionConflictError);
    expect(snapshots.map((s) => s.content)).toEqual(['theirs']);
  });

  it('succeeds with the current revision and advances it', async () => {
    const { store, updates, current, ifRevisions } = makeStore(makePage());
    const base = pageRevision(current());
    const result = await savePage(store, 1, { blocks: block('v1') }, 'autosave', {
      baseRevision: base,
    });
    expect(updates).toHaveLength(1);
    expect(ifRevisions).toEqual([base]);
    expect(pageRevision(result!.after)).not.toBe(base);
    expect(pageRevision(current())).toBe(pageRevision(result!.after));
  });

  it('does not advance the revision for a save that changes nothing', async () => {
    const { store, updates, current } = makeStore(makePage());
    const base = pageRevision(current());
    const result = await savePage(store, 1, { blocks: block('v0') }, 'autosave', {
      baseRevision: base,
    });
    expect(updates).toEqual([]);
    expect(pageRevision(result!.after)).toBe(base);
  });

  it('keeps today’s behaviour without a base', async () => {
    const { store, updates, ifRevisions, current } = makeStore(
      makePage({ content: 'changed', blocks: block('changed') })
    );
    await savePage(store, 1, { blocks: block('mine') }, 'autosave');
    expect(updates).toHaveLength(1);
    expect(ifRevisions).toEqual([undefined]);
    expect(current().content).toBe('mine');
  });

  it('a 200 to a save that named a base means the base was current: a stale base is refused even when nothing would change', async () => {
    const stored = makePage({ content: 'same', blocks: block('same') });
    const { store, updates, snapshots } = makeStore(stored);
    await expect(
      savePage(store, 1, { blocks: block('same') }, 'autosave', {
        baseRevision: pageRevision(makePage()),
      })
    ).rejects.toMatchObject({ name: 'PageRevisionConflictError', current: stored });
    expect(updates).toEqual([]);
    // There is no text to keep from a refused save that carries no change.
    expect(snapshots).toEqual([]);
    expect(hasOpenEditSession(1)).toBe(false);
  });

  it.each([
    ['tags', { tags: ['ops'] }],
    ['title', { title: 'Handbook' }],
    ['properties and a body equal to the stored one', { folder: 'docs', blocks: block('same') }],
  ])(
    'a stale %s save that changes nothing is refused and records no version',
    async (_n, patch) => {
      const stored = makePage({ content: 'same', blocks: block('same') });
      const { store, snapshots } = makeStore(stored);
      await expect(
        savePage(store, 1, patch as any, 'autosave', { baseRevision: pageRevision(makePage()) })
      ).rejects.toBeInstanceOf(PageRevisionConflictError);
      expect(snapshots).toEqual([]);
    }
  );

  it('a save without a base that changes nothing is answered with the stored page, as before', async () => {
    const stored = makePage();
    const { store, updates, snapshots } = makeStore(stored);
    const result = await savePage(store, 1, { blocks: block('v0') }, 'autosave');
    expect(result).toEqual({ before: stored, after: stored });
    expect(updates).toEqual([]);
    expect(snapshots).toEqual([]);
  });

  it('a manual save that loses at the write opens no session and records no version of its own', async () => {
    const { store, changeBehindTheBack, snapshots, updates } = makeStore(makePage());
    const base = pageRevision(makePage());
    const getPage = store.getPage;
    store.getPage = async (id) => {
      const page = await getPage(id);
      changeBehindTheBack({ content: 'raced', blocks: block('raced') });
      return page;
    };
    await expect(
      savePage(store, 1, { title: 'Mine', blocks: block('mine') }, 'manual', { baseRevision: base })
    ).rejects.toBeInstanceOf(PageRevisionConflictError);
    expect(updates).toEqual([]);
    expect(hasOpenEditSession(1)).toBe(false);
    expect(snapshots.map((s) => s.description)).toEqual([
      'Latest when a save was refused',
      'Not saved: based on an older revision',
    ]);
  });

  it('an autosave that loses at the write does not open or extend an editing session', async () => {
    const { store, changeBehindTheBack, snapshots } = makeStore(makePage());
    const base = pageRevision(makePage());
    const getPage = store.getPage;
    store.getPage = async (id) => {
      const page = await getPage(id);
      changeBehindTheBack({ content: 'raced', blocks: block('raced') });
      return page;
    };
    await expect(
      savePage(store, 1, { blocks: block('mine') }, 'autosave', { baseRevision: base })
    ).rejects.toBeInstanceOf(PageRevisionConflictError);
    expect(hasOpenEditSession(1)).toBe(false);
    expect(snapshots.some((s) => s.description === 'Before editing session')).toBe(false);
  });

  it('a guarded save that is written opens the session and keeps the state before it', async () => {
    const { store, snapshots, current } = makeStore(makePage());
    await savePage(store, 1, { blocks: block('v1') }, 'autosave', {
      baseRevision: pageRevision(current()),
    });
    expect(hasOpenEditSession(1)).toBe(true);
    expect(snapshots).toEqual([
      { title: 'Handbook', content: 'v0', description: 'Before editing session' },
    ]);
  });

  it('turns a refusal at write time (someone saved after the check) into the same conflict', async () => {
    const { store, updates, changeBehindTheBack, snapshots } = makeStore(makePage());
    const base = pageRevision(makePage());
    // The page is current at the check, then moves on before the guarded write runs.
    const getPage = store.getPage;
    store.getPage = async (id) => {
      const page = await getPage(id);
      changeBehindTheBack({ content: 'raced', blocks: block('raced') });
      return page;
    };
    await expect(
      savePage(store, 1, { blocks: block('mine') }, 'autosave', { baseRevision: base })
    ).rejects.toMatchObject({ name: 'PageRevisionConflictError' });
    expect(updates).toEqual([]);
    expect(snapshots.some((s) => s.content === 'mine')).toBe(true);
  });
});
