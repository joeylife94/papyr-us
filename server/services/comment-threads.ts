/**
 * Block anchors and resolved state of comment threads (WP15).
 *
 * - A thread is anchored to a block id of the page's stored blocks; the short excerpt of the
 *   block's text is taken here from the stored block, never from the request.
 * - A reply belongs to its thread: it is listed with the anchor and the resolved state of the
 *   top-level comment it answers.
 * - Whether the anchored block still exists is computed from the page's current blocks.
 */

import { blocksForPage } from '../../shared/block-markdown.js';

export const BLOCK_EXCERPT_MAX = 200;
export const BLOCK_ID_MAX = 200;

interface StoredBlock {
  id?: unknown;
  content?: unknown;
}

/**
 * The blocks a page shows (stored blocks, or the ones seeded from its content): the ids a thread
 * may be anchored to. A page that cannot be read (in the trash) has none.
 */
export function blocksOfPage(
  page: { id: number; blocks?: unknown; content?: string | null } | undefined
): unknown[] {
  return page ? blocksForPage(page) : [];
}

/** A comment as it is answered to a caller: the resolver's account id is not part of it. */
export function publicComment<T extends { resolvedByUserId?: unknown }>(
  comment: T
): Omit<T, 'resolvedByUserId'> {
  const { resolvedByUserId: _resolvedBy, ...rest } = comment;
  return rest;
}

/** The blocks of a page as an array; anything else is no blocks. */
export function pageBlocks(blocks: unknown): StoredBlock[] {
  return Array.isArray(blocks)
    ? blocks.filter((block): block is StoredBlock => !!block && typeof block === 'object')
    : [];
}

/** The stored block with this id, or undefined. */
export function findBlock(blocks: unknown, blockId: string): StoredBlock | undefined {
  return pageBlocks(blocks).find((block) => block.id === blockId);
}

/** At most 200 characters of the block's text, whitespace collapsed; null when it has none. */
export function blockExcerptOf(block: StoredBlock): string | null {
  const text = typeof block.content === 'string' ? block.content.replace(/\s+/g, ' ').trim() : '';
  if (text === '') return null;
  return Array.from(text).slice(0, BLOCK_EXCERPT_MAX).join('');
}

export interface ThreadRow {
  id: number;
  parentId: number | null;
  blockId: string | null;
  blockExcerpt: string | null;
  resolvedAt: Date | null;
  resolvedByUserId?: number | null;
  /** Current name of the account that resolved the thread; null when none or not shown. */
  resolvedByName?: string | null;
}

/**
 * Adds the thread fields to a comment row: the anchor and resolved state of its thread (a reply
 * takes its parent's), the resolver by name only, and whether the anchored block still exists.
 */
export function withThreadFields<T extends ThreadRow>(
  rows: T[],
  blocks: unknown
): Array<
  Omit<T, 'resolvedByUserId' | 'resolvedByName'> & {
    resolvedBy: string | null;
    blockExists: boolean;
  }
> {
  const roots = new Map<number, T>();
  for (const row of rows) if (row.parentId == null) roots.set(row.id, row);
  const ids = new Set(pageBlocks(blocks).map((block) => block.id));
  return rows.map((row) => {
    const thread = row.parentId == null ? row : (roots.get(row.parentId) ?? null);
    const { resolvedByUserId: _id, resolvedByName: _name, ...rest } = row;
    const blockId = thread?.blockId ?? null;
    const resolvedAt = thread?.resolvedAt ?? null;
    return {
      ...rest,
      blockId,
      blockExcerpt: thread?.blockExcerpt ?? null,
      resolvedAt,
      resolvedBy: resolvedAt ? (thread?.resolvedByName ?? 'Unknown User') : null,
      blockExists: blockId !== null && ids.has(blockId),
    };
  });
}
