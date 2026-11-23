import { beforeEach, describe, expect, it } from 'vitest';
import {
  RECENT_LIMIT,
  clearAllRecent,
  readRecent,
  recentKey,
  recordRecent,
} from '../../client/src/lib/recent-pages';

/** A Storage stand-in that keeps entries in a Map. */
function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe('recentKey: the list belongs to one account in one organization', () => {
  it('names both ids', () => {
    expect(recentKey(7, 3)).toBe('papyrus.recent:7:3');
    expect(recentKey(7, 3)).not.toBe(recentKey(8, 3));
    expect(recentKey(7, 3)).not.toBe(recentKey(7, 4));
  });

  it('has no key, so nothing is read or written, without a valid account and organization', () => {
    for (const [user, org] of [
      [undefined, 3],
      [7, undefined],
      [null, null],
      [0, 3],
      [7, -1],
      [1.5, 3],
      ['7', 3],
      [Number.NaN, 3],
    ] as const) {
      expect(recentKey(user as any, org as any), `${user}/${org}`).toBeNull();
    }
  });
});

describe('the recent list', () => {
  let store: ReturnType<typeof memoryStore>;
  const key = 'papyrus.recent:7:3';
  beforeEach(() => {
    store = memoryStore();
  });

  it('is empty when nothing is stored', () => {
    expect(readRecent(store, key)).toEqual([]);
  });

  it('keeps a page in the list until newer pages push it out (nothing else deletes an entry)', () => {
    for (let id = 1; id <= 3; id++) recordRecent(store, key, { id, title: `P${id}` });
    expect(readRecent(store, key).map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it('puts the newest page first, once per page, and keeps only id and title', () => {
    recordRecent(store, key, { id: 1, title: 'One', slug: 'secret-slug', body: 'x' } as any);
    recordRecent(store, key, { id: 2, title: 'Two' });
    const list = recordRecent(store, key, { id: 1, title: 'One renamed' });
    expect(list).toEqual([
      { id: 1, title: 'One renamed' },
      { id: 2, title: 'Two' },
    ]);
    expect(JSON.parse(store.getItem(key)!)).toEqual(list);
  });

  it(`keeps the last ${RECENT_LIMIT} pages`, () => {
    for (let id = 1; id <= RECENT_LIMIT + 5; id++)
      recordRecent(store, key, { id, title: `P${id}` });
    const list = readRecent(store, key);
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0].id).toBe(RECENT_LIMIT + 5);
    expect(list[RECENT_LIMIT - 1].id).toBe(6);
  });

  it('never reads another key: another account or organization sees nothing of this list', () => {
    recordRecent(store, key, { id: 1, title: 'One' });
    expect(readRecent(store, 'papyrus.recent:8:3')).toEqual([]);
    expect(readRecent(store, 'papyrus.recent:7:4')).toEqual([]);
  });

  it('ignores stored text that is not a list of id and title, entry by entry', () => {
    store.setItem(key, 'not json');
    expect(readRecent(store, key)).toEqual([]);
    store.setItem(key, JSON.stringify({ id: 1 }));
    expect(readRecent(store, key)).toEqual([]);
    store.setItem(
      key,
      JSON.stringify([
        { id: 1, title: 'Good' },
        { id: 'x', title: 'Bad id' },
        { id: 2 },
        null,
        { id: 1, title: 'Duplicate' },
        { id: -3, title: 'Negative' },
        { id: 4, title: 'Also good', extra: 'dropped' },
      ])
    );
    expect(readRecent(store, key)).toEqual([
      { id: 1, title: 'Good' },
      { id: 4, title: 'Also good' },
    ]);
  });

  it('is empty, and does not throw, when storage refuses reads and writes', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      key: () => {
        throw new Error('blocked');
      },
      length: 1,
    };
    expect(readRecent(broken, key)).toEqual([]);
    expect(recordRecent(broken, key, { id: 1, title: 'One' })).toEqual([{ id: 1, title: 'One' }]);
    expect(() => clearAllRecent(broken)).not.toThrow();
  });

  it('clearAllRecent removes every account and organization list and nothing else', () => {
    recordRecent(store, 'papyrus.recent:7:3', { id: 1, title: 'One' });
    recordRecent(store, 'papyrus.recent:8:3', { id: 2, title: 'Two' });
    store.setItem('papyrus.tree.expanded:x', '[1]');
    clearAllRecent(store);
    expect([...store.map.keys()]).toEqual(['papyrus.tree.expanded:x']);
  });
});
