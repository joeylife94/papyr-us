import type { Block } from '@shared/schema';
// Relative import: unit tests load this module without the Vite aliases.
import { blocksToMarkdown, markdownToBlocks } from '../../../shared/block-markdown';

/**
 * The Markdown page content for a block list (#113 §1). The server derives `content` with the
 * same function on save (server/services/page-save.ts); the client uses it for the live table of
 * contents and reading time while editing, and sends it when creating a page.
 */
export function blocksToContent(blocks: Block[]): string {
  return blocksToMarkdown(blocks);
}

/**
 * Blocks for a page. A page saved without blocks (API, template, import) opens as the blocks its
 * Markdown content describes (#113 §1); the ids match the collaboration server's seed for the
 * page (server/services/yjs-collaboration.ts). A page without content opens empty.
 */
export function initialBlocksFor(page: {
  id?: number;
  blocks?: unknown;
  content?: string;
}): Block[] {
  if (Array.isArray(page.blocks) && page.blocks.length > 0) return page.blocks as Block[];
  if (page.content) {
    return markdownToBlocks(page.content, {
      idPrefix: page.id ? `block_seed_${page.id}` : `block_${Date.now()}`,
    });
  }
  return [];
}

export function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** URL slug for a new page title; falls back to a unique "untitled" slug. */
export function slugForTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Date.now().toString(36);
  return base ? `${base}-${suffix}` : `untitled-${suffix}`;
}
