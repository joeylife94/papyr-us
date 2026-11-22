import type { Block } from '@shared/schema';
import { MAX_BLOCK_INDENT, blockIndent, subtreeEnd } from '@shared/block-tree';

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

/**
 * Moving a block takes the blocks nested under it along (WP11, shared/block-tree.ts): they stay
 * together, in order, and keep their depth relative to it. `from`..`from + count` are those
 * blocks; `to` is the index of the first of them in the resulting list.
 */
export interface SubtreeMove {
  from: number;
  count: number;
  to: number;
}

/**
 * The move for Alt+↑ / Alt+↓ on the block at `index`: up goes above the previous block that is
 * not nested deeper than it (with that block's nested blocks left in place below), down goes
 * below the next one together with the blocks nested under that one. Null at either end. Without
 * nesting this is the one-step move of `moveBlock`.
 */
export function subtreeStep(
  blocks: readonly unknown[],
  index: number,
  direction: -1 | 1
): SubtreeMove | null {
  if (index < 0 || index >= blocks.length) return null;
  const count = subtreeEnd(blocks, index) - index;
  if (direction < 0) {
    if (index === 0) return null;
    const indent = blockIndent(blocks[index]);
    let target = index - 1;
    while (target > 0 && blockIndent(blocks[target]) > indent) target--;
    return { from: index, count, to: target };
  }
  const end = index + count;
  if (end >= blocks.length) return null;
  return { from: index, count, to: subtreeEnd(blocks, end) - count };
}

/**
 * The move for a finished drag. `visible` holds the indices (into `blocks`) of the blocks that
 * are shown, in order (blocks inside a collapsed toggle are not); `destination` is the dragged
 * block's index among the shown blocks once it is lifted out, as the drag library reports it.
 * The block lands before the shown block now at `destination` (or last), keeping the blocks nested
 * under it. The dragged block is found by id. Null when it is gone, when nothing moves, or when it
 * would land inside its own nested blocks.
 */
export function resolveSubtreeDrop(
  blocks: readonly { id: string }[],
  visible: readonly number[],
  draggedId: string,
  destination: number
): SubtreeMove | null {
  const from = blocks.findIndex((block) => block.id === draggedId);
  if (from === -1) return null;
  const count = subtreeEnd(blocks, from) - from;
  const others = visible.filter((index) => index !== from);
  const clamped = Math.min(Math.max(destination, 0), others.length);
  // Where the block is inserted, as an index in the list it is lifted out of.
  const before = clamped < others.length ? others[clamped] : blocks.length;
  if (before > from && before < from + count) return null;
  const to = before > from ? before - count : before;
  return to === from ? null : { from, count, to };
}

/**
 * The blocks of a move as they land: a moved block never takes over the blocks next to where it
 * lands. Dropped between a parent and its first child, it takes the child's level (it becomes the
 * child's sibling, the parent keeps its children); it is never deeper than one level under the
 * block above it. The moved blocks keep their depth relative to the first of them.
 */
export function movedSubtree<T extends { indent?: number }>(
  blocks: readonly T[],
  move: SubtreeMove
): T[] {
  const { from, count, to } = move;
  const moved = blocks.slice(from, from + count);
  if (moved.length === 0) return moved;
  const rest = [...blocks.slice(0, from), ...blocks.slice(from + count)];
  const above = to > 0 ? rest[to - 1] : undefined;
  const below = rest[to];
  const original = blockIndent(moved[0]);
  let level = Math.min(original, above ? blockIndent(above) + 1 : 0);
  if (below) level = Math.max(level, blockIndent(below));
  const delta = level - original;
  if (delta === 0) return moved;
  return moved.map((block) => {
    const next = Math.min(Math.max(blockIndent(block) + delta, 0), MAX_BLOCK_INDENT);
    const { indent: _indent, ...others } = block;
    return (next > 0 ? { ...others, indent: next } : others) as T;
  });
}

/** The blocks with the range of a move relocated; `order` is renumbered to match. */
export function moveSubtree<T extends { order: number; indent?: number }>(
  blocks: T[],
  move: SubtreeMove
): T[] {
  const { from, count, to } = move;
  if (count < 1 || from === to || from < 0 || from + count > blocks.length) return blocks;
  const moved = movedSubtree(blocks, move);
  const next = blocks.slice();
  next.splice(from, count);
  next.splice(to, 0, ...moved);
  return next.map((block, index) => (block.order === index ? block : { ...block, order: index }));
}
