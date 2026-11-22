import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { Block } from '../../shared/schema';
import { normalizeBlockTree, shiftSubtree } from '../../shared/block-tree';
import { subtreeStep } from '../../client/src/lib/block-order';
import { editBlocks, moveBlockRange } from '../../client/src/lib/yjs-block-ops';

// WP11: the shared block list carries `indent` and `parentId`, so two editors see the same
// structure, and concurrent nesting and text edits on different blocks converge.

const block = (id: string, indent = 0, content = id): Block =>
  ({
    id,
    type: id.startsWith('t') ? 'toggle' : 'paragraph',
    content,
    properties: {},
    order: 0,
    children: [],
    ...(indent ? { indent } : {}),
  }) as Block;

function pair(initial: Block[]) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.getArray<Block>('blocks').push(normalizeBlockTree(initial));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const sync = () => {
    const toB = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
    const toA = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
    Y.applyUpdate(b, toB);
    Y.applyUpdate(a, toA);
  };
  return { a, b, ya: a.getArray<Block>('blocks'), yb: b.getArray<Block>('blocks'), sync };
}

/** The same edit the editor makes for a text change: replace the block with a patched copy. */
function setText(doc: Y.Doc, yblocks: Y.Array<Block>, id: string, content: string) {
  doc.transact(() => {
    const index = yblocks.toArray().findIndex((b) => b.id === id);
    const current = yblocks.get(index);
    yblocks.delete(index, 1);
    yblocks.insert(index, [{ ...current, content }]);
  });
}

const shape = (blocks: Block[]) =>
  blocks.map((b) => `${b.id}:${b.indent ?? 0}${b.parentId ? `>${b.parentId}` : ''}:${b.content}`);

describe('nesting in the shared block list', () => {
  const start = [block('t1'), block('a', 1), block('b', 1), block('c'), block('d')];

  it('carries indent and parentId to the other editor', () => {
    const { a, ya, yb, sync } = pair(start);
    editBlocks(a, ya, (blocks) => shiftSubtree(blocks, 3, 1));
    sync();
    expect(shape(yb.toArray())).toEqual(['t1:0:t1', 'a:1>t1:a', 'b:1>t1:b', 'c:1>t1:c', 'd:0:d']);
    expect(yb.toArray()).toEqual(ya.toArray());
  });

  it('converges when one editor nests a block while another edits the text of a different one', () => {
    const { a, b, ya, yb, sync } = pair(start);
    editBlocks(a, ya, (blocks) => shiftSubtree(blocks, 4, 1));
    setText(b, yb, 'a', 'a edited');
    sync();
    expect(ya.toArray()).toEqual(yb.toArray());
    expect(shape(ya.toArray())).toEqual([
      't1:0:t1',
      'a:1>t1:a edited',
      'b:1>t1:b',
      'c:0:c',
      'd:1>c:d',
    ]);
  });

  it('converges when two editors nest different blocks at the same time', () => {
    const { a, b, ya, yb, sync } = pair([block('x'), block('y'), block('z'), block('w')]);
    editBlocks(a, ya, (blocks) => shiftSubtree(blocks, 1, 1));
    editBlocks(b, yb, (blocks) => shiftSubtree(blocks, 3, 1));
    sync();
    expect(ya.toArray()).toEqual(yb.toArray());
    expect(shape(ya.toArray())).toEqual(['x:0:x', 'y:1>x:y', 'z:0:z', 'w:1>z:w']);
  });

  it('moves a block with the blocks nested under it in one update, and both editors agree', () => {
    const { a, b, ya, yb, sync } = pair(start);
    const move = subtreeStep(ya.toArray(), 0, 1)!;
    expect(move).toEqual({ from: 0, count: 3, to: 1 });
    moveBlockRange(a, ya, move);
    setText(b, yb, 'd', 'd edited');
    sync();
    expect(ya.toArray()).toEqual(yb.toArray());
    const merged = shape(ya.toArray());
    // Every block exactly once, the text edit kept, and the moved blocks still together, in
    // order, at their depth (where the two concurrent inserts land relative to each other is
    // decided by the CRDT, not by the editors).
    expect([...merged].sort()).toEqual(
      ['a:1>t1:a', 'b:1>t1:b', 'c:0:c', 'd:0:d edited', 't1:0:t1'].sort()
    );
    const first = merged.indexOf('t1:0:t1');
    expect(merged.slice(first, first + 3)).toEqual(['t1:0:t1', 'a:1>t1:a', 'b:1>t1:b']);
  });

  it('keeps the tree consistent when a collaborator deletes the parent while another nests under it', () => {
    const { a, b, ya, yb, sync } = pair([block('p'), block('q'), block('r')]);
    a.transact(() => ya.delete(0, 1));
    editBlocks(b, yb, (blocks) => shiftSubtree(blocks, 2, 1));
    sync();
    expect(ya.toArray()).toEqual(yb.toArray());
    // Whatever the merge produced, what both editors show is a consistent tree.
    const shown = normalizeBlockTree(ya.toArray());
    expect(shown.length).toBe(2);
    expect(shown[0].indent).toBeUndefined();
    expect(shown[0].parentId).toBeUndefined();
  });
});
