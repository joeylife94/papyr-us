import { describe, expect, it } from 'vitest';
import type { Block } from '../../shared/schema';
import { moveBlock } from '../../client/src/lib/block-order';

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
