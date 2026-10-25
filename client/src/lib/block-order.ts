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
