import type * as Y from 'yjs';
import type { Block } from '@shared/schema';
import { normalizeBlockTree } from '@shared/block-tree';
import type { SubtreeMove } from './block-order';

/**
 * Edits of the shared block list that keep nesting consistent (WP11, shared/block-tree.ts).
 * Each is one Yjs transaction, so collaborators apply it as one update and converge on it. The
 * blocks are whole JSON objects in the shared array: `indent` and `parentId` travel with them.
 */

/**
 * Inside a transaction: rewrite the blocks whose `indent` or `parentId` is not what
 * `normalizeBlockTree` derives for the list as it now stands. Touches nothing when the tree is
 * already consistent, so ordinary text edits write no extra blocks.
 */
export function reconcileTree(yblocks: Y.Array<Block>): void {
  const current = yblocks.toArray();
  const normalized = normalizeBlockTree(current);
  if (normalized === current) return;
  normalized.forEach((block, index) => {
    if (block !== current[index]) {
      yblocks.delete(index, 1);
      yblocks.insert(index, [block]);
    }
  });
}

/**
 * Replace the shared list by `change(blocks)`, a list of the same length (an indent or outdent of
 * a block and the blocks under it): only the blocks that differ are rewritten, in one
 * transaction, and the tree is made consistent. Nothing is written when nothing changes.
 */
export function editBlocks(
  ydoc: Y.Doc,
  yblocks: Y.Array<Block>,
  change: (blocks: Block[]) => Block[]
): void {
  const current = yblocks.toArray();
  const next = change(current);
  if (next === current || next.length !== current.length) return;
  ydoc.transact(() => {
    next.forEach((block, index) => {
      if (block === current[index]) return;
      yblocks.delete(index, 1);
      yblocks.insert(index, [block]);
    });
    reconcileTree(yblocks);
  });
}

/** Move a block and the blocks nested under it (see `SubtreeMove`) in one transaction. */
export function moveBlockRange(ydoc: Y.Doc, yblocks: Y.Array<Block>, move: SubtreeMove): void {
  const { from, count, to } = move;
  if (count < 1 || from === to || from < 0 || from + count > yblocks.length) return;
  ydoc.transact(() => {
    const moved = yblocks.slice(from, from + count);
    yblocks.delete(from, count);
    yblocks.insert(Math.min(to, yblocks.length), moved);
    reconcileTree(yblocks);
  });
}
