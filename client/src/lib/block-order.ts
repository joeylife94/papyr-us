import type { Block } from '@shared/schema';

/**
 * The block list with the block at `from` moved to `to` (issue #103 E3). Indices follow
 * `Array.splice`: `to` is the block's index in the resulting list, which is also what a drag's
 * destination index and the Yjs move (delete, then insert) mean. `order` is renumbered to match.
 * A no-op or out-of-range move returns the list unchanged.
 */
export function moveBlock(blocks: Block[], from: number, to: number): Block[] {
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) {
    return blocks;
  }
  const next = blocks.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((block, index) => (block.order === index ? block : { ...block, order: index }));
}

/**
 * The move for a finished drag, resolved against the blocks as they are now. A collaborator may
 * have reordered or deleted blocks while the drag was in progress, so the drag's start index can
 * point at a different block: the dragged block is found by id instead. Returns null when that
 * block no longer exists or nothing moves. The destination is clamped to the current list.
 */
export function resolveDrop(
  blocks: Block[],
  draggedId: string,
  destinationIndex: number
): { from: number; to: number } | null {
  const from = blocks.findIndex((block) => block.id === draggedId);
  if (from === -1) return null;
  const to = Math.min(Math.max(destinationIndex, 0), blocks.length - 1);
  return from === to ? null : { from, to };
}
