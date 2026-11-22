/**
 * Nesting in a flat block list (owner decision O5): pages stay a flat array of blocks, and a
 * block's depth is its integer `indent` (absent means 0). `parentId` is the id of the nearest
 * preceding block one level up (absent at indent 0). The blocks under a block are the ones after
 * it with a deeper indent, up to the next block at its level or shallower. `children` is not used.
 *
 * `normalizeBlockTree` is the one place that makes a list consistent: it clamps `indent` to
 * 0..MAX_BLOCK_INDENT and to at most one level deeper than the block before it, and recomputes
 * `parentId` from `indent`. The server applies it on every write of blocks, so a client cannot
 * store an inconsistent tree; the editor and the Yjs binding apply it to what they show.
 *
 * Pure: no DOM and no Node-only APIs (imported by the server and the client).
 */

/** The deepest indent a block can have. */
export const MAX_BLOCK_INDENT = 8;

type BlockRecord = Record<string, unknown>;

function isRecord(value: unknown): value is BlockRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A block's indent as stored: a whole number from 0 to MAX_BLOCK_INDENT, else 0. */
export function blockIndent(block: unknown): number {
  const raw = isRecord(block) ? block.indent : undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) return 0;
  return Math.min(raw, MAX_BLOCK_INDENT);
}

/**
 * The block list with every block's `indent` and `parentId` made consistent (see the module
 * comment). Blocks that already are consistent are returned as the same objects and the list as
 * the same array, so a page without nesting is returned untouched. Entries that are not objects
 * are left as they are. Input that is not an array is returned as it is.
 */
export function normalizeBlockTree<T>(blocks: T): T {
  if (!Array.isArray(blocks)) return blocks;
  let changed = false;
  // The id of the latest block at each level, for the blocks above the current one.
  const ids: Array<string | undefined> = [];
  let previous = -1;
  const result = blocks.map((block) => {
    if (!isRecord(block)) return block;
    const indent = Math.min(blockIndent(block), previous + 1);
    previous = indent;
    ids.length = indent;
    const parentId = indent > 0 ? ids[indent - 1] : undefined;
    ids[indent] = typeof block.id === 'string' ? block.id : undefined;

    const sameIndent = indent === 0 ? !('indent' in block) : block.indent === indent;
    const sameParent =
      parentId === undefined ? !('parentId' in block) : block.parentId === parentId;
    if (sameIndent && sameParent) return block;

    changed = true;
    const { indent: _indent, parentId: _parent, ...rest } = block;
    return {
      ...rest,
      ...(indent > 0 ? { indent } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    };
  });
  return (changed ? result : blocks) as T;
}

/**
 * Where the blocks under the block at `index` end: the index after the last block that is
 * deeper than it (so `index + 1` for a block with nothing under it). The block and its nested
 * blocks are `blocks.slice(index, subtreeEnd(blocks, index))`.
 */
export function subtreeEnd(blocks: readonly unknown[], index: number): number {
  const indent = blockIndent(blocks[index]);
  let end = index + 1;
  while (end < blocks.length && blockIndent(blocks[end]) > indent) end++;
  return end;
}

/**
 * The number each numbered list item shows: items count per level, 1, 2, 3 … while the run of
 * numbered items at that level lasts. Blocks nested under an item do not break its run; any
 * other block at the item's level, or a block above it, does. Non-numbered entries get 0.
 */
export function listNumbers(blocks: readonly unknown[]): number[] {
  const counters: Array<number | undefined> = [];
  return blocks.map((block) => {
    const indent = blockIndent(block);
    counters.length = indent + 1;
    const type = isRecord(block) ? block.type : undefined;
    if (type === 'numbered_list') {
      counters[indent] = (counters[indent] ?? 0) + 1;
      return counters[indent] as number;
    }
    counters[indent] = undefined;
    return 0;
  });
}

/**
 * The blocks to show: those not hidden inside a collapsed toggle. `isCollapsed` is asked for
 * toggle blocks only. Returns the indices into `blocks`.
 */
export function visibleBlockIndices(
  blocks: readonly unknown[],
  isCollapsed: (block: BlockRecord) => boolean
): number[] {
  const visible: number[] = [];
  let hiddenBelow: number | null = null;
  blocks.forEach((block, index) => {
    const indent = blockIndent(block);
    if (hiddenBelow !== null) {
      if (indent > hiddenBelow) return;
      hiddenBelow = null;
    }
    visible.push(index);
    if (isRecord(block) && block.type === 'toggle' && isCollapsed(block)) hiddenBelow = indent;
  });
  return visible;
}

/**
 * The blocks with the block at `index` and the blocks nested under it indented by `delta`
 * levels (they keep their depth relative to it). An indent that would be refused returns the
 * list unchanged: the block may only go one level deeper than the block before it (and never
 * past MAX_BLOCK_INDENT), and may not go above level 0. The result is normalised.
 */
export function shiftSubtree<T extends { indent?: number }>(
  blocks: readonly T[],
  index: number,
  delta: 1 | -1
): T[] {
  if (index < 0 || index >= blocks.length) return blocks as T[];
  const indent = blockIndent(blocks[index]);
  const target = indent + delta;
  const previous = index > 0 ? blockIndent(blocks[index - 1]) : -1;
  if (target < 0 || target > MAX_BLOCK_INDENT || target > previous + 1) return blocks as T[];
  const end = subtreeEnd(blocks, index);
  const deepest = Math.max(...blocks.slice(index, end).map(blockIndent)) + delta;
  if (deepest > MAX_BLOCK_INDENT) return blocks as T[];
  return normalizeBlockTree(
    blocks.map((block, at) => {
      if (at < index || at >= end) return block;
      const next = blockIndent(block) + delta;
      const { indent: _indent, ...rest } = block;
      return (next > 0 ? { ...rest, indent: next } : rest) as T;
    })
  );
}
