import { describe, expect, it } from 'vitest';
import {
  buildPageTree,
  checkParent,
  compareSiblings,
  orderWithMove,
  subtreeForTrash,
  type PageTreeNode,
  type PageTreeRow,
  type PageTreeStore,
  type TreePage,
} from '../../server/services/page-tree';

const row = (
  id: number,
  parentId: number | null,
  extra: Partial<PageTreeRow> = {}
): PageTreeRow => ({
  id,
  title: `P${id}`,
  slug: `p${id}`,
  icon: null,
  parentId,
  position: null,
  folder: 'docs',
  teamId: null,
  updatedAt: new Date(0),
  createdAt: new Date(id * 1000),
  ...extra,
});

const shape = (nodes: PageTreeNode[]): unknown =>
  nodes.map((n) => (n.children.length ? [n.id, shape(n.children)] : n.id));

describe('compareSiblings', () => {
  it('orders by position (nulls last), then creation time, then id', () => {
    const rows = [
      row(1, null),
      row(2, null, { position: 1 }),
      row(3, null, { position: 0 }),
      row(4, null, { createdAt: new Date(500) }),
    ];
    expect(rows.sort(compareSiblings).map((r) => r.id)).toEqual([3, 2, 4, 1]);
  });
});

describe('buildPageTree', () => {
  it('nests children under their parents in sibling order', () => {
    const tree = buildPageTree([
      row(1, null),
      row(2, 1, { position: 1 }),
      row(3, 1, { position: 0 }),
      row(4, 3),
      row(5, null),
    ]);
    expect(shape(tree)).toEqual([[1, [[3, [4]], 2]], 5]);
    expect(tree[0].children[0].parentId).toBe(1);
  });

  it('shows a readable child of a hidden parent at the root, without the parent id', () => {
    // Page 10 is not in the rows (the viewer cannot read it).
    const tree = buildPageTree([row(1, null), row(2, 10), row(3, 2)]);
    expect(shape(tree)).toEqual([1, [2, [3]]]);
    expect(tree[1].parentId).toBeNull();
    expect(JSON.stringify(tree)).not.toContain('"parentId":10');
  });

  it('never drops rows caught in a parent cycle (old data)', () => {
    const tree = buildPageTree([row(1, 2), row(2, 1), row(3, 3)]);
    const ids = JSON.stringify(shape(tree));
    for (const id of [1, 2, 3]) expect(ids).toContain(String(id));
    expect(tree.every((n) => n.parentId === null)).toBe(true);
  });
});

describe('orderWithMove', () => {
  it('places the moved page after the given sibling, or first', () => {
    expect(orderWithMove([1, 2, 3], 3, 1)).toEqual([1, 3, 2]);
    expect(orderWithMove([1, 2, 3], 1, 3)).toEqual([2, 3, 1]);
    expect(orderWithMove([1, 2, 3], 2, null)).toEqual([2, 1, 3]);
    expect(orderWithMove([1, 2], 9, 2)).toEqual([1, 2, 9]);
  });
});

function fakeStore(pages: TreePage[], rights: { edit?: number[]; own?: number[] } = {}) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const store: PageTreeStore = {
    getPage: async (id) => byId.get(id),
    canEdit: async (_u, id) => (rights.edit ?? pages.map((p) => p.id)).includes(id),
    canRead: async (_u, id) => byId.has(id),
    canOwn: async (_u, id) => (rights.own ?? pages.map((p) => p.id)).includes(id),
    getAllDescendantIds: async (id) => {
      const out: number[] = [];
      const walk = (parent: number) => {
        for (const p of pages) {
          if (p.parentId === parent && !out.includes(p.id)) {
            out.push(p.id);
            walk(p.id);
          }
        }
      };
      walk(id);
      return out;
    },
    getLiveDescendantIds: async (id) => {
      const out: number[] = [];
      const walk = (parent: number) => {
        for (const p of pages) {
          if (p.parentId === parent && !p.deletedAt && !out.includes(p.id)) {
            out.push(p.id);
            walk(p.id);
          }
        }
      };
      walk(id);
      return out;
    },
  };
  return store;
}

describe('checkParent', () => {
  const pages: TreePage[] = [
    { id: 1, teamId: 7, parentId: null },
    { id: 2, teamId: 7, parentId: 1 },
    { id: 3, teamId: 7, parentId: 2 },
    { id: 4, teamId: 8, parentId: null },
    { id: 5, teamId: null, parentId: null },
    { id: 6, teamId: 7, parentId: null, deletedAt: new Date() },
  ];

  it('accepts an editable parent in the same team', async () => {
    expect(await checkParent(fakeStore(pages), 1, 1, { id: 9, teamId: 7 })).toBeNull();
    expect(await checkParent(fakeStore(pages), 1, 2, { teamId: 7 })).toBeNull();
  });

  it('refuses moving a page under another team or between team and personal (403)', async () => {
    expect((await checkParent(fakeStore(pages), 1, 4, { id: 2, teamId: 7 }))?.status).toBe(403);
    expect((await checkParent(fakeStore(pages), 1, 5, { id: 2, teamId: 7 }))?.status).toBe(403);
    expect((await checkParent(fakeStore(pages), 1, 1, { teamId: null }))?.status).toBe(403);
  });

  it('refuses cycles: the page itself or one of its descendants (400)', async () => {
    expect((await checkParent(fakeStore(pages), 1, 1, { id: 1, teamId: 7 }))?.status).toBe(400);
    expect((await checkParent(fakeStore(pages), 1, 3, { id: 1, teamId: 7 }))?.status).toBe(400);
  });

  it('sees cycles through a trashed page (restoring it would close the loop)', async () => {
    // A > B (trashed) > C, with C restored on its own: C may not become A's parent.
    const withTrash: TreePage[] = [
      { id: 11, teamId: 7, parentId: null },
      { id: 12, teamId: 7, parentId: 11, deletedAt: new Date() },
      { id: 13, teamId: 7, parentId: 12 },
    ];
    expect((await checkParent(fakeStore(withTrash), 1, 13, { id: 11, teamId: 7 }))?.status).toBe(
      400
    );
  });

  it('answers a missing, trashed or non-editable parent the same way (403)', async () => {
    const missing = await checkParent(fakeStore(pages), 1, 99, { teamId: 7 });
    const trashed = await checkParent(fakeStore(pages), 1, 6, { teamId: 7 });
    const readOnly = await checkParent(fakeStore(pages, { edit: [2, 3] }), 1, 1, { teamId: 7 });
    expect(missing).toEqual(trashed);
    expect(trashed).toEqual(readOnly);
    expect(readOnly?.status).toBe(403);
  });
});

describe('subtreeForTrash', () => {
  const pages: TreePage[] = [
    { id: 1, teamId: 7, parentId: null },
    { id: 2, teamId: 7, parentId: 1 },
    { id: 3, teamId: 7, parentId: 2 },
    { id: 4, teamId: 7, parentId: 1, deletedAt: new Date() },
  ];

  it('returns the page and its live descendants when every one may be deleted', async () => {
    expect(await subtreeForTrash(fakeStore(pages), 1, 1)).toEqual({ ids: [1, 2, 3] });
  });

  it('refuses when any descendant may not be deleted', async () => {
    const result = await subtreeForTrash(fakeStore(pages, { own: [1, 2] }), 1, 1);
    expect('error' in result && result.error.status).toBe(403);
  });
});
