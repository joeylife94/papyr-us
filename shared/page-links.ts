/**
 * Page links (issue #103 E6). A link is stored in block text as an id-only token, `[[page:123]]`.
 * Titles are never stored in content: the link renders with the target's current title, so a
 * rename shows up everywhere, and a viewer who cannot read the target sees no title at all.
 */

/** One link token; group 1 is the target id. Global: use with `matchAll` or `replace`. */
export const PAGE_LINK_PATTERN = /\[\[page:(\d{1,10})\]\]/g;
const TOKEN = PAGE_LINK_PATTERN;

/** Most links indexed per page; anything beyond is still rendered, just not indexed. */
export const MAX_INDEXED_LINKS = 500;

export function pageLinkToken(pageId: number): string {
  return `[[page:${pageId}]]`;
}

/** Distinct target ids in the order they first appear (positive integers only). */
export function extractPageLinkIds(content: string | null | undefined): number[] {
  if (!content) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const match of content.matchAll(TOKEN)) {
    const id = Number(match[1]);
    if (Number.isSafeInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
      if (ids.length >= MAX_INDEXED_LINKS) break;
    }
  }
  return ids;
}

export type PageLinkSegment = { kind: 'text'; text: string } | { kind: 'link'; pageId: number };

/** Text split into plain runs and link tokens, for rendering chips in place. */
export function splitPageLinks(text: string): PageLinkSegment[] {
  const segments: PageLinkSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) segments.push({ kind: 'text', text: text.slice(last, at) });
    segments.push({ kind: 'link', pageId: Number(match[1]) });
    last = at + match[0].length;
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) });
  return segments;
}

export function hasPageLinks(text: string | null | undefined): boolean {
  return !!text && /\[\[page:\d{1,10}\]\]/.test(text);
}
