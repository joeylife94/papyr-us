import { describe, expect, it } from 'vitest';
import {
  ancestorIds,
  applyMove,
  dropToMove,
  flattenVisible,
  keyboardToMove,
  searchTree,
  type PageTreeNode,
} from '../../client/src/lib/page-tree';

const n = (id: number, children: PageTreeNode[] = [], parentId: number | null = null) =>
  ({
    id,
    title: `Page ${id}`,
    slug: `p${id}`,
    icon: null,
    parentId,
    position: null,
    folder: 'docs',
    updatedAt: '',
    children,
  }) as PageTreeNode;

// 1 > (2 > 3), 4 ; 5
const tree = () => [n(1, [n(2, [n(3, [], 2)], 1), n(4, [], 1)]), n(5)];
const ids = (nodes: PageTreeNode[]): unknown =>
  nodes.map((x) => (x.children.length ? [x.id, ids(x.children)] : x.id));

describe('flattenVisible', () => {
  it('lists roots and the children of expanded pages with ARIA positions', () => {
    const rows = flattenVisible(tree(), new Set([1]));
    expect(rows.map((r) => [r.node.id, r.depth, r.index, r.siblingCount])).toEqual([
      [1, 0, 0, 2],
      [2, 1, 0, 2],
      [4, 1, 1, 2],
      [5, 0, 1, 2],
    ]);
    expect(rows[0].expanded).toBe(true);
    expect(rows[1].hasChildren && !rows[1].expanded).toBe(true);
  });

  it('hides the subtree of the page being dragged', () => {
    const rows = flattenVisible(tree(), new Set([1, 2]), 1);
    expect(rows.map((r) => r.node.id)).toEqual([1, 5]);
  });
});

describe('dropToMove', () => {
  const visible = (dragged: number) => flattenVisible(tree(), new Set([1, 2]), dragged);

  it('drops before the row below, at that row level', () => {
    // Rendered while dragging 5: [1, 2, 3, 4, 5]. Index 1 = before 2, under 1, first.
    expect(dropToMove(tree(), visible(5), 5, 1, null)).toEqual({ parentId: 1, afterId: null });
    // Index 3 = before 4: after 2 under 1.
    expect(dropToMove(tree(), visible(5), 5, 3, null)).toEqual({ parentId: 1, afterId: 2 });
    // Before 3 (child of 2).
    expect(dropToMove(tree(), visible(5), 5, 2, null)).toEqual({ parentId: 2, afterId: null });
  });

  it('dropping last goes to the end of the root level', () => {
    expect(dropToMove(tree(), visible(3), 3, 4, null)).toEqual({ parentId: null, afterId: 5 });
  });

  it('dropping onto a page makes it the last child', () => {
    expect(dropToMove(tree(), visible(5), 5, null, 1)).toEqual({ parentId: 1, afterId: 4 });
    expect(dropToMove(tree(), visible(5), 5, null, 4)).toEqual({ parentId: 4, afterId: null });
  });

  it('ignores drops that change nothing or would nest a page below itself', () => {
    expect(dropToMove(tree(), visible(5), 5, 4, null)).toBeNull(); // already last root
    expect(dropToMove(tree(), visible(1), 1, null, 3)).toBeNull();
  });
});

describe('keyboardToMove', () => {
  it('moves up and down among siblings', () => {
    expect(keyboardToMove(tree(), 4, 'up')).toEqual({ parentId: 1, afterId: null });
    expect(keyboardToMove(tree(), 2, 'down')).toEqual({ parentId: 1, afterId: 4 });
    expect(keyboardToMove(tree(), 2, 'up')).toBeNull();
    expect(keyboardToMove(tree(), 5, 'down')).toBeNull();
  });

  it('indents under the previous sibling and outdents to after the parent', () => {
    expect(keyboardToMove(tree(), 4, 'indent')).toEqual({ parentId: 2, afterId: 3 });
    expect(keyboardToMove(tree(), 5, 'indent')).toEqual({ parentId: 1, afterId: 4 });
    expect(keyboardToMove(tree(), 3, 'outdent')).toEqual({ parentId: 1, afterId: 2 });
    expect(keyboardToMove(tree(), 2, 'outdent')).toEqual({ parentId: null, afterId: 1 });
    expect(keyboardToMove(tree(), 1, 'outdent')).toBeNull();
    expect(keyboardToMove(tree(), 1, 'indent')).toBeNull();
  });
});

describe('applyMove', () => {
  it('moves the page with its subtree, leaving the input untouched', () => {
    const before = tree();
    const after = applyMove(before, 2, { parentId: null, afterId: 5 });
    expect(ids(after)).toEqual([[1, [4]], 5, [2, [3]]]);
    expect(ids(before)).toEqual([[1, [[2, [3]], 4]], 5]);
  });
});

describe('ancestorIds and searchTree', () => {
  it('finds the path to reveal a page and title matches in tree order', () => {
    expect(ancestorIds(tree(), 3)).toEqual([1, 2]);
    expect(ancestorIds(tree(), 5)).toEqual([]);
    expect(searchTree(tree(), 'page 3').map((x) => x.id)).toEqual([3]);
    expect(searchTree(tree(), ' ')).toEqual([]);
  });
});
