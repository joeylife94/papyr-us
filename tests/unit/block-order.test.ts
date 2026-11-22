import { describe, expect, it } from 'vitest';
import type { Block } from '../../shared/schema';
import {
  moveBlock,
  moveSubtree,
  resolveDrop,
  resolveSubtreeDrop,
  subtreeStep,
} from '../../client/src/lib/block-order';
import { normalizeBlockTree, visibleBlockIndices } from '../../shared/block-tree';

const block = (id: string, order: number): Block =>
  ({ id, type: 'paragraph', content: id, properties: {}, order, children: [] }) as Block;

const ids = (blocks: Block[]) => blocks.map((b) => b.id);

describe('moveBlock', () => {
  const list = [block('a', 0), block('b', 1), block('c', 2), block('d', 3)];

  it('moves a block down to its index in the resulting list', () => {
    expect(ids(moveBlock(list, 0, 2))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a block up', () => {
    expect(ids(moveBlock(list, 3, 1))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves to either end', () => {
    expect(ids(moveBlock(list, 2, 0))).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(moveBlock(list, 1, 3))).toEqual(['a', 'c', 'd', 'b']);
  });

  it('renumbers order and leaves the input untouched', () => {
    const moved = moveBlock(list, 0, 3);
    expect(moved.map((b) => b.order)).toEqual([0, 1, 2, 3]);
    expect(ids(list)).toEqual(['a', 'b', 'c', 'd']);
    expect(list.map((b) => b.order)).toEqual([0, 1, 2, 3]);
  });

  it('matches splice semantics, like a Yjs delete-then-insert', () => {
    for (let from = 0; from < list.length; from++) {
      for (let to = 0; to < list.length; to++) {
        const expected = ids(list);
        const [m] = expected.splice(from, 1);
        expected.splice(to, 0, m);
        expect(ids(moveBlock(list, from, to))).toEqual(expected);
      }
    }
  });

  it('returns the same list for a no-op or out-of-range move', () => {
    expect(moveBlock(list, 1, 1)).toBe(list);
    expect(moveBlock(list, -1, 0)).toBe(list);
    expect(moveBlock(list, 0, 4)).toBe(list);
    expect(moveBlock([], 0, 0)).toEqual([]);
  });
});

describe('resolveDrop', () => {
  const list = [block('a', 0), block('b', 1), block('c', 2)];

  it('moves the dragged block found by id', () => {
    expect(resolveDrop(list, 'b', 0)).toEqual({ from: 1, to: 0 });
  });

  it('follows the dragged block when a collaborator reordered during the drag', () => {
    // The drag of B started on [A, B, C] (source index 1); meanwhile A moved to the end.
    const reordered = [block('b', 0), block('c', 1), block('a', 2)];
    const move = resolveDrop(reordered, 'b', 2);
    expect(move).toEqual({ from: 0, to: 2 });
    expect(ids(moveBlock(reordered, move!.from, move!.to))).toEqual(['c', 'a', 'b']);
  });

  it('cancels when the dragged block was deleted, or nothing moves', () => {
    expect(resolveDrop([block('a', 0), block('c', 1)], 'b', 0)).toBeNull();
    expect(resolveDrop(list, 'c', 2)).toBeNull();
  });

  it('clamps a destination beyond a list that shrank', () => {
    expect(resolveDrop([block('a', 0), block('b', 1)], 'a', 2)).toEqual({ from: 0, to: 1 });
  });
});

// WP11: a block moves together with the blocks nested under it.
describe('moving blocks with their nested blocks', () => {
  const nested = (id: string, indent = 0, type = 'paragraph'): Block =>
    ({ ...block(id, 0), type, ...(indent ? { indent } : {}) }) as Block;
  // a, (b, c under b), d, e
  const list = normalizeBlockTree([
    nested('a'),
    nested('b'),
    nested('c', 1),
    nested('d'),
    nested('e'),
  ]);
  const apply = (move: ReturnType<typeof subtreeStep>) =>
    ids(normalizeBlockTree(moveSubtree(list, move!)));

  it('Alt+Down takes the block and its nested blocks below the next block and its nested blocks', () => {
    expect(apply(subtreeStep(list, 1, 1))).toEqual(['a', 'd', 'b', 'c', 'e']);
    expect(apply(subtreeStep(list, 0, 1))).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('Alt+Up takes the block and its nested blocks above the previous block with its nested blocks', () => {
    expect(apply(subtreeStep(list, 3, -1))).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('does not move past either end', () => {
    expect(subtreeStep(list, 0, -1)).toBeNull();
    expect(subtreeStep(list, 4, 1)).toBeNull();
    expect(subtreeStep(list, 1, 1)).not.toBeNull();
  });

  it('is the one-step move of a flat page when nothing is nested', () => {
    const flat = [block('a', 0), block('b', 1), block('c', 2)];
    expect(subtreeStep(flat, 1, -1)).toEqual({ from: 1, count: 1, to: 0 });
    expect(subtreeStep(flat, 1, 1)).toEqual({ from: 1, count: 1, to: 2 });
    expect(ids(moveSubtree(flat, subtreeStep(flat, 1, 1)!))).toEqual(ids(moveBlock(flat, 1, 2)));
  });

  it('a drag lands before the shown block at the destination and takes nested blocks along', () => {
    const visible = visibleBlockIndices(list, () => false);
    // Dragging b (with c) to the end: destination = number of the other shown blocks (a, c, d, e).
    const move = resolveSubtreeDrop(list, visible, 'b', 4)!;
    expect(ids(moveSubtree(list, move))).toEqual(['a', 'd', 'e', 'b', 'c']);
  });

  it('a drag over a collapsed toggle lands after its hidden blocks, not inside them', () => {
    const toggles = normalizeBlockTree([
      nested('t', 0, 'toggle'),
      nested('h1', 1),
      nested('h2', 1),
      nested('x'),
      nested('y'),
    ]);
    const visible = visibleBlockIndices(toggles, (b) => b.id === 't');
    expect(visible).toEqual([0, 3, 4]);
    // y dragged to between t and x: it lands before x, i.e. after the toggle's hidden blocks.
    const move = resolveSubtreeDrop(toggles, visible, 'y', 1)!;
    expect(ids(moveSubtree(toggles, move))).toEqual(['t', 'h1', 'h2', 'y', 'x']);
    // t dragged below x takes its hidden blocks along.
    const down = resolveSubtreeDrop(toggles, visible, 't', 1)!;
    expect(ids(moveSubtree(toggles, down))).toEqual(['x', 't', 'h1', 'h2', 'y']);
  });

  it("a drop inside the dragged block's own nested blocks, or on its own place, moves nothing", () => {
    const visible = visibleBlockIndices(list, () => false);
    expect(resolveSubtreeDrop(list, visible, 'b', 1)).toBeNull();
    expect(resolveSubtreeDrop(list, visible, 'zzz', 1)).toBeNull();
  });

  it("a block dropped between a parent and its first child becomes that child's sibling and does not adopt the children", () => {
    const tree = normalizeBlockTree([
      nested('t', 0, 'toggle'),
      nested('c1', 1),
      nested('c2', 1),
      nested('x'),
    ]);
    const visible = visibleBlockIndices(tree, () => false);
    // x lifted out: the shown blocks are t, c1, c2; destination 1 is before c1.
    const move = resolveSubtreeDrop(tree, visible, 'x', 1)!;
    const result = normalizeBlockTree(moveSubtree(tree, move));
    expect(result.map((b) => `${b.id}:${b.indent ?? 0}>${b.parentId ?? ''}`)).toEqual([
      't:0>',
      'x:1>t',
      'c1:1>t',
      'c2:1>t',
    ]);
  });

  it('a moved block keeps the depth of its nested blocks relative to it when it takes another level', () => {
    const tree = normalizeBlockTree([
      nested('t', 0, 'toggle'),
      nested('c1', 1),
      nested('x'),
      nested('y', 1),
    ]);
    const move = { from: 2, count: 2, to: 1 };
    const result = normalizeBlockTree(moveSubtree(tree, move));
    expect(result.map((b) => `${b.id}:${b.indent ?? 0}`)).toEqual(['t:0', 'x:1', 'y:2', 'c1:1']);
  });

  it('a move to the top level of a flat page, or below the last block, changes no level', () => {
    const flat = [block('a', 0), block('b', 1), block('c', 2)];
    expect(
      moveSubtree(flat, { from: 0, count: 1, to: 2 }).every((b: any) => b.indent === undefined)
    ).toBe(true);
  });
});
