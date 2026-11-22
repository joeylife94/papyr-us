import type * as Y from 'yjs';
import type { Block } from '@shared/schema';
import { blockIndent, normalizeBlockTree } from '@shared/block-tree';
import { movedSubtree, type SubtreeMove } from './block-order';

/**
 * Edits of the shared block list that carry nesting (WP11, shared/block-tree.ts). Each is one Yjs
 * transaction, so collaborators apply it as one update. The blocks are whole JSON objects in the
 * shared array: `indent` (and a `parentId` as last written) travel with them. A consistent tree is
 * never written back: `parentId` is recomputed wherever the list is shown (the editor) or saved
 * (the server), because rewriting blocks nobody edited makes concurrent edits duplicate them.
 */

/**
 * Apply `change` (an indent or outdent of a block and the blocks under it, same length) to the
 * list as every view shows it (`normalizeBlockTree` of the stored list), and write only the blocks
 * whose level the change itself moved, in one transaction. A stored block whose level differs from
 * the view only because the view normalises it (for example a child whose parent was deleted) is
 * never rewritten by an edit of another block. Nothing is written when nothing changes.
 */
export function editBlocks(
  ydoc: Y.Doc,
  yblocks: Y.Array<Block>,
  change: (blocks: Block[]) => Block[]
): void {
  const stored = yblocks.toArray();
  const view = normalizeBlockTree(stored);
  const next = change(view);
  if (next === view || next.length !== stored.length) return;
  ydoc.transact(() => {
    next.forEach((block, index) => {
      // Only the indent is written; `parentId` is derived wherever the list is shown or saved.
      if (blockIndent(block) === blockIndent(view[index])) return;
      const { indent: _indent, ...rest } = stored[index];
      const level = blockIndent(block);
      yblocks.delete(index, 1);
      yblocks.insert(index, [(level > 0 ? { ...rest, indent: level } : rest) as Block]);
    });
  });
}

/** Move a block and the blocks nested under it (see `SubtreeMove`) in one transaction. */
export function moveBlockRange(ydoc: Y.Doc, yblocks: Y.Array<Block>, move: SubtreeMove): void {
  const { from, count, to } = move;
  if (count < 1 || from === to || from < 0 || from + count > yblocks.length) return;
  ydoc.transact(() => {
    const moved = movedSubtree(yblocks.toArray(), move);
    yblocks.delete(from, count);
    yblocks.insert(Math.min(to, yblocks.length), moved);
  });
}

/** Insert a block at `index` in one transaction. */
export function insertBlockAt(ydoc: Y.Doc, yblocks: Y.Array<Block>, index: number, block: Block) {
  ydoc.transact(() => {
    yblocks.insert(index, [block]);
  });
}

/** Change fields of the block at `index` in one transaction. */
export function patchBlockAt(
  ydoc: Y.Doc,
  yblocks: Y.Array<Block>,
  index: number,
  patch: Partial<Block>
) {
  if (index < 0 || index >= yblocks.length) return;
  ydoc.transact(() => {
    const current = yblocks.get(index);
    yblocks.delete(index, 1);
    yblocks.insert(index, [{ ...current, ...patch }]);
  });
}

/** Delete the block at `index` in one transaction. */
export function deleteBlockAt(ydoc: Y.Doc, yblocks: Y.Array<Block>, index: number) {
  if (index < 0 || index >= yblocks.length) return;
  ydoc.transact(() => {
    yblocks.delete(index, 1);
  });
}
