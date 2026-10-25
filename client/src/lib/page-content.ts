import type { Block } from '@shared/schema';

/**
 * The Markdown-ish page content for a block list: block contents joined by blank lines. The
 * server derives `content` the same way on save (server/services/page-save.ts); the client uses
 * it for the live table of contents and reading time while editing.
 */
export function blocksToContent(blocks: Block[]): string {
  return blocks
    .map((block) => (typeof block?.content === 'string' ? block.content : ''))
    .join('\n\n');
}

/** Blocks for a page, seeding one paragraph from `content` when it has none (API/template pages). */
export function initialBlocksFor(page: {
  id?: number;
  blocks?: unknown;
  content?: string;
}): Block[] {
  if (Array.isArray(page.blocks) && page.blocks.length > 0) return page.blocks as Block[];
  if (page.content) {
    return [
      {
        id: page.id ? `block_seed_${page.id}` : `block_${Date.now()}`,
        type: 'paragraph',
        content: page.content,
        properties: {},
        order: 0,
        children: [],
      } as Block,
    ];
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
