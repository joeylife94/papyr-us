import { describe, expect, it } from 'vitest';
import { buildPageTree, planSiblingOrder, type PageTreeRow } from '../../server/services/page-tree';
import {
  applyMove,
  describeMove,
  dropTarget,
  indexTree,
  keyboardMoveTarget,
  nestTarget,
  visibleRows,
  type TreePage,
} from '../../client/src/lib/page-tree';

// Issue #103 E5: the tree a viewer sees (D4) and where moves land.

const row = (
  id: number,
  parentId: number | null,
  position: number | null,
  created = id
): PageTreeRow => ({
  id,
  title: `P${id}`,
  slug: `p${id}`,
  icon: null,
  parentId,
  position,
  createdAt: new Date(created * 1000),
  updatedAt: new Date(0),
});

const shape = (rows: PageTreeRow[]) =>
  buildPageTree(rows).map((node) => [node.id, node.parentId, node.position]);

describe('buildPageTree', () => {
  it('lists pages depth first, siblings by position, unpositioned last by creation', () => {
    expect(
      shape([
        row(1, null, 1),
        row(2, null, 0),
        row(3, 1, null, 9),
        row(4, 1, null, 5),
        row(5, 1, 0),
      ])
    ).toEqual([
      [2, null, 0],
      [1, null, 1],
      [5, 1, 0],
      [4, 1, 1],
      [3, 1, 2],
    ]);
  });

  it('puts a page whose parent is not readable at the root, with no trace of the parent (D4)', () => {
    // 7's parent 99 is not in the readable rows; its stored position (0) relates to hidden
    // siblings, so it sorts like an unpositioned root page and gets a dense root position.
    const nodes = buildPageTree([row(1, null, 0), row(2, null, 1), row(7, 99, 0)]);
    expect(nodes.map((node) => [node.id, node.parentId, node.position])).toEqual([
      [1, null, 0],
      [2, null, 1],
      [7, null, 2],
    ]);
    expect(JSON.stringify(nodes)).not.toContain('99');
  });

  it('renumbers positions densely, so gaps from hidden siblings do not show', () => {
    expect(shape([row(1, null, 0), row(2, 1, 3), row(3, 1, 7)])).toEqual([
      [1, null, 0],
      [2, 1, 0],
      [3, 1, 1],
    ]);
  });

  it('shows every page of a parent loop once, cutting the loop', () => {
    const nodes = shape([row(1, 2, 0), row(2, 1, 0), row(3, null, 0)]);
    expect(nodes.map(([id]) => id).sort()).toEqual([1, 2, 3]);
    expect(nodes.filter(([, parentId]) => parentId === null).length).toBe(2);
  });

  it('treats a self-parented page as a root page', () => {
    expect(shape([row(1, 1, 0)])).toEqual([[1, null, 0]]);
  });
});

describe('planSiblingOrder', () => {
  it('inserts before the sibling the viewer saw at the index', () => {
    expect(planSiblingOrder([1, 2, 3], [1, 2, 3], 1, 9)).toEqual([1, 9, 2, 3]);
  });

  it('keeps hidden siblings in place around the visible ones', () => {
    // 5 is a sibling the viewer cannot see.
    expect(planSiblingOrder([1, 5, 2, 3], [1, 2, 3], 1, 9)).toEqual([1, 5, 9, 2, 3]);
    expect(planSiblingOrder([1, 5, 2], [1, 2], 2, 9)).toEqual([1, 5, 2, 9]);
  });

  it('ignores the moved page itself when counting', () => {
    expect(planSiblingOrder([1, 2, 3], [1, 2, 3], 2, 1)).toEqual([2, 3, 1]);
    expect(planSiblingOrder([1, 2, 3], [1, 2, 3], 0, 3)).toEqual([3, 1, 2]);
  });

  it('skips visible pages that are not stored siblings (root pages with a hidden parent)', () => {
    expect(planSiblingOrder([1, 2], [1, 8, 2], 1, 9)).toEqual([1, 9, 2]);
    expect(planSiblingOrder([1, 2], [1, 2, 8], 2, 9)).toEqual([1, 2, 9]);
  });
});

const page = (id: number, parentId: number | null, position: number): TreePage => ({
  id,
  title: `P${id}`,
  slug: `p${id}`,
  icon: null,
  parentId,
  position,
  updatedAt: '',
});

// 1
//   2
//   3
//     4
// 5
const pages = [page(1, null, 0), page(2, 1, 0), page(3, 1, 1), page(4, 3, 0), page(5, null, 1)];
const tree = indexTree(pages);

describe('visibleRows', () => {
  it('shows expanded pages with levels, set sizes and positions', () => {
    const rows = visibleRows(tree, new Set([1]));
    expect(rows.map((r) => [r.page.id, r.level, r.setSize, r.posInSet, r.expanded])).toEqual([
      [1, 1, 2, 1, true],
      [2, 2, 2, 1, false],
      [3, 2, 2, 2, false],
      [5, 1, 2, 2, false],
    ]);
    expect(rows[2].hasChildren).toBe(true);
  });

  it('leaves out hidden pages (the dragged page’s sub-pages)', () => {
    const rows = visibleRows(tree, new Set([1, 3]), { hidden: new Set([2, 3, 4]) });
    expect(rows.map((r) => r.page.id)).toEqual([1, 5]);
  });

  it('filters by title, keeping ancestors and expanding them', () => {
    const rows = visibleRows(tree, new Set(), { filter: 'p4' });
    expect(rows.map((r) => r.page.id)).toEqual([1, 3, 4]);
  });
});

describe('moves', () => {
  it('maps a drop between rows to the sibling list of the row below', () => {
    const during = visibleRows(tree, new Set([1])).filter((r) => r.page.id !== 5);
    // Drop 5 between 1 and 2: first child of 1.
    expect(dropTarget(tree, during, 1, 5)).toEqual({ parentId: 1, index: 0 });
    // Drop 5 at the very top.
    expect(dropTarget(tree, during, 0, 5)).toEqual({ parentId: null, index: 0 });
    // Drop 2 after the last row: after 3 among 1's children (2 itself not counted).
    const without2 = visibleRows(tree, new Set([1])).filter((r) => r.page.id !== 2);
    expect(dropTarget(tree, without2, 3, 2)).toEqual({ parentId: null, index: 2 });
  });

  it('nests a page dropped onto a row as its last sub-page', () => {
    expect(nestTarget(tree, 3, 5)).toEqual({ parentId: 3, index: 1 });
    expect(nestTarget(tree, 1, 2)).toEqual({ parentId: 1, index: 1 });
  });

  it('computes the keyboard moves', () => {
    expect(keyboardMoveTarget(tree, 3, 'up')).toEqual({ parentId: 1, index: 0 });
    expect(keyboardMoveTarget(tree, 2, 'up')).toBeNull();
    expect(keyboardMoveTarget(tree, 2, 'down')).toEqual({ parentId: 1, index: 1 });
    expect(keyboardMoveTarget(tree, 3, 'down')).toBeNull();
    expect(keyboardMoveTarget(tree, 3, 'in')).toEqual({ parentId: 2, index: 0 });
    expect(keyboardMoveTarget(tree, 2, 'in')).toBeNull();
    expect(keyboardMoveTarget(tree, 4, 'out')).toEqual({ parentId: 1, index: 2 });
    expect(keyboardMoveTarget(tree, 1, 'out')).toBeNull();
  });

  it('applies a move optimistically, renumbering both sibling lists', () => {
    const next = indexTree(applyMove(pages, 2, { parentId: null, index: 1 }));
    expect(next.children.get(null)!.map((p) => p.id)).toEqual([1, 2, 5]);
    expect(next.children.get(1)!.map((p) => [p.id, p.position])).toEqual([[3, 0]]);
  });

  it('describes a move in Korean', () => {
    expect(describeMove(tree, 5, { parentId: 3, index: 1 })).toBe(
      '"P5" 문서를 "P3" 안 2번째 위치로 옮겼습니다'
    );
    expect(describeMove(tree, 2, { parentId: null, index: 0 })).toBe(
      '"P2" 문서를 최상위 1번째 위치로 옮겼습니다'
    );
  });
});
