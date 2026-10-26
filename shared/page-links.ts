/**
 * Page link tokens (issue #103 E6).
 *
 * A link to another page is stored in block content as `[[page:<id>]]`. It carries only the
 * target's id: the title (and icon) are resolved at render time through an access-checked API,
 * so renaming the target updates every link, and a reader who cannot read the target never sees
 * its title. The save pipeline indexes these tokens into `page_links`.
 */

/** Matches one link token; group 1 is the target page id. Use with `matchAll` (global flag). */
export const PAGE_LINK_PATTERN = /\[\[page:(\d{1,9})\]\]/g;

/** The token for a link to `pageId`. */
export function formatPageLink(pageId: number): string {
  return `[[page:${pageId}]]`;
}

/** Distinct target ids linked from `text`, in first-appearance order. */
export function extractPageLinkIdsFromText(text: string): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const match of text.matchAll(PAGE_LINK_PATTERN)) {
    const id = Number(match[1]);
    if (id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Distinct target ids linked from a block list (the `blocks` JSON of a page). */
export function extractPageLinkIds(blocks: unknown): number[] {
  if (!Array.isArray(blocks)) return [];
  const text = blocks
    .map((block) =>
      block && typeof (block as { content?: unknown }).content === 'string'
        ? (block as { content: string }).content
        : ''
    )
    .join('\n');
  return extractPageLinkIdsFromText(text);
}

/** Split `text` into plain-text and link segments, for renderers. */
export type PageLinkSegment = { type: 'text'; text: string } | { type: 'link'; pageId: number };

export function splitPageLinks(text: string): PageLinkSegment[] {
  const segments: PageLinkSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(PAGE_LINK_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: 'text', text: text.slice(last, start) });
    segments.push({ type: 'link', pageId: Number(match[1]) });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

/** Most ids one link resolution request may carry (GET /api/pages/links/resolve). */
export const MAX_PAGE_LINK_RESOLVE_IDS = 100;

/** Whether `text` holds at least one link token. */
export function hasPageLinks(text: string): boolean {
  return new RegExp(PAGE_LINK_PATTERN.source).test(text);
}

/**
 * `text` with every link token replaced by `render(pageId)`, for plain-text uses (TOC, excerpts,
 * list previews). Pass a function returning '' to strip the tokens.
 */
export function replacePageLinks(text: string, render: (pageId: number) => string): string {
  return text.replace(PAGE_LINK_PATTERN, (_token, id: string) => render(Number(id)));
}
