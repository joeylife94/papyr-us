import { describe, expect, it } from 'vitest';
import {
  MAX_BLOCK_INDENT,
  listNumbers,
  normalizeBlockTree,
  shiftSubtree,
  subtreeEnd,
  visibleBlockIndices,
} from '../../shared/block-tree';
import { blockSchema } from '../../shared/schema';

// WP11 (owner decision O5): nesting in a flat block list is `indent` plus a `parentId` the server
// recomputes, so a client cannot store an inconsistent tree.

const block = (id: string, indent?: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'paragraph',
  content: id,
  properties: {},
  order: 0,
  children: [],
  ...(indent === undefined ? {} : { indent }),
  ...extra,
});

const shape = (blocks: any[]) =>
  blocks.map((b) => `${b.id}:${b.indent ?? 0}${b.parentId ? `>${b.parentId}` : ''}`);

describe('normalizeBlockTree', () => {
  it('returns a page without nesting as the very same array and objects, byte for byte', () => {
    const blocks = [
      block('a'),
      { id: 'b', type: 'heading1', content: 'x', properties: { k: 1 }, order: 1, children: [] },
    ];
    const before = JSON.stringify(blocks);
    const result = normalizeBlockTree(blocks);
    expect(result).toBe(blocks);
    expect(result[0]).toBe(blocks[0]);
    expect(JSON.stringify(result)).toBe(before);
  });

  it('sets parentId to the nearest preceding block one level up', () => {
    const result = normalizeBlockTree([
      block('a'),
      block('b', 1),
      block('c', 2),
      block('d', 1),
      block('e'),
      block('f', 1),
    ]);
    expect(shape(result)).toEqual(['a:0', 'b:1>a', 'c:2>b', 'd:1>a', 'e:0', 'f:1>e']);
  });

  it('clamps a block to at most one level deeper than the block before it', () => {
    expect(shape(normalizeBlockTree([block('a', 3), block('b', 5), block('c', 1)]))).toEqual([
      'a:0',
      'b:1>a',
      'c:1>a',
    ]);
  });

  it('clamps to the maximum depth', () => {
    const chain = Array.from({ length: 12 }, (_, i) => block(`n${i}`, i));
    const result = normalizeBlockTree(chain) as any[];
    expect(Math.max(...result.map((b) => b.indent ?? 0))).toBe(MAX_BLOCK_INDENT);
    expect(result[11].parentId).toBe('n7');
  });

  it('reads an indent that is not a whole non-negative number as 0 and drops indent 0', () => {
    const result = normalizeBlockTree([
      block('a', 0),
      block('b', -2),
      block('c', 1.5),
      block('d', '2' as any),
      block('e', NaN),
    ]);
    expect(result.every((b: any) => !('indent' in b) && !('parentId' in b))).toBe(true);
  });

  it('recomputes a parentId the client sent: stale, foreign or on a top-level block', () => {
    const result = normalizeBlockTree([
      block('a', undefined, { parentId: 'ghost' }),
      block('b', 1, { parentId: 'zzz' }),
      block('c', 1, { parentId: 'b' }),
    ]);
    expect(shape(result)).toEqual(['a:0', 'b:1>a', 'c:1>a']);
  });

  it('keeps every other field of a changed block and leaves consistent blocks untouched', () => {
    const consistent = block('a');
    const result = normalizeBlockTree([
      consistent,
      block('b', 4, { properties: { checked: true }, content: 'text' }),
    ]) as any[];
    expect(result[0]).toBe(consistent);
    expect(result[1]).toEqual({
      id: 'b',
      type: 'paragraph',
      content: 'text',
      properties: { checked: true },
      order: 0,
      children: [],
      indent: 1,
      parentId: 'a',
    });
  });

  it('leaves entries that are not objects, and input that is not a list, alone', () => {
    expect(normalizeBlockTree(undefined)).toBeUndefined();
    expect(normalizeBlockTree('x')).toBe('x');
    const odd = [null, 7, block('a'), block('b', 1)];
    expect(shape(normalizeBlockTree(odd).slice(2) as any[])).toEqual(['a:0', 'b:1>a']);
  });

  it('is idempotent', () => {
    const once = normalizeBlockTree([block('a', 2), block('b', 4), block('c', 1), block('d', 2)]);
    expect(normalizeBlockTree(once)).toBe(once);
  });

  it('is accepted by the block schema, which bounds indent', () => {
    expect(blockSchema.safeParse({ ...block('a'), indent: 3, parentId: 'x' }).success).toBe(true);
    expect(blockSchema.safeParse({ ...block('a'), indent: 9 }).success).toBe(false);
    expect(blockSchema.safeParse({ ...block('a'), indent: 1.5 }).success).toBe(false);
    expect(blockSchema.safeParse(block('a')).success).toBe(true);
  });
});

describe('subtreeEnd and shiftSubtree', () => {
  const list = [block('a'), block('b', 1), block('c', 2), block('d', 1), block('e'), block('f', 1)];

  it('ends a block and its nested blocks at the next block of its level or shallower', () => {
    expect(subtreeEnd(list, 0)).toBe(4);
    expect(subtreeEnd(list, 1)).toBe(3);
    expect(subtreeEnd(list, 2)).toBe(3);
    expect(subtreeEnd(list, 4)).toBe(6);
    expect(subtreeEnd(list, 5)).toBe(6);
  });

  it('indents a block one level together with the blocks under it, keeping their depth', () => {
    const blocks = normalizeBlockTree([block('a'), block('b'), block('c', 1), block('d', 2)]);
    expect(shape(shiftSubtree(blocks, 1, 1))).toEqual(['a:0', 'b:1>a', 'c:2>b', 'd:3>c']);
  });

  it('refuses to indent the first block or one already a level below the block before it', () => {
    const blocks = normalizeBlockTree([block('a'), block('b', 1)]);
    expect(shiftSubtree(blocks, 0, 1)).toBe(blocks);
    expect(shiftSubtree(blocks, 1, 1)).toBe(blocks);
  });

  it('outdents a block together with the blocks under it, and refuses level 0', () => {
    const blocks = normalizeBlockTree([block('a'), block('b', 1), block('c', 2), block('d', 1)]);
    expect(shape(shiftSubtree(blocks, 1, -1))).toEqual(['a:0', 'b:0', 'c:1>b', 'd:1>b']);
    expect(shiftSubtree(blocks, 0, -1)).toBe(blocks);
  });

  it('refuses to push a nested block past the maximum depth', () => {
    const chain = normalizeBlockTree([
      block('x'),
      block('y'),
      ...Array.from({ length: MAX_BLOCK_INDENT }, (_, i) => block(`n${i}`, i + 1)),
    ]);
    // y has the deepest chain (depth 8) under it after n0..n7 hang below it.
    expect(shiftSubtree(chain, 1, 1)).toBe(chain);
  });
});

describe('listNumbers', () => {
  const numbered = (id: string, indent = 0) => ({
    ...block(id, indent || undefined),
    type: 'numbered_list',
  });

  it('counts a run per level and lets nested blocks sit inside the run', () => {
    expect(
      listNumbers([
        numbered('a'),
        numbered('b', 1),
        numbered('c', 1),
        numbered('d'),
        numbered('e', 1),
        block('p'),
        numbered('f'),
      ])
    ).toEqual([1, 1, 2, 2, 1, 0, 1]);
  });

  it('restarts a run after another block at its level', () => {
    expect(listNumbers([numbered('a'), numbered('b'), block('p'), numbered('c')])).toEqual([
      1, 2, 0, 1,
    ]);
  });
});

describe('visibleBlockIndices', () => {
  const toggle = (id: string, indent = 0) => ({
    ...block(id, indent || undefined),
    type: 'toggle',
  });

  it('hides the blocks under a collapsed toggle and shows the next block at its level', () => {
    const blocks = [toggle('t'), block('a', 1), toggle('u', 1), block('b', 2), block('c')];
    expect(visibleBlockIndices(blocks, () => false)).toEqual([0, 1, 2, 3, 4]);
    expect(visibleBlockIndices(blocks, (b) => b.id === 't')).toEqual([0, 4]);
    expect(visibleBlockIndices(blocks, (b) => b.id === 'u')).toEqual([0, 1, 2, 4]);
  });
});
