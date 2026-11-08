/**
 * Page embeds (issue #135, decision P3-D2): another page shown in place, read-only and live.
 *
 * Embeds are views. The embedding page stores only the target's id, as the token
 * `![[page:<id>]]` on a line of its own (the `page_embed` block's Markdown, see
 * shared/block-markdown.ts). Nothing of the target is kept in the embedding page, its versions,
 * its search text or its exports (a vault export writes the target's title, nothing else). Each
 * viewer fetches the content with their own access (GET /api/pages/:id/embed), which answers
 * exactly like the link preview for a page they cannot read.
 *
 * The token holds a link token (`[[page:<id>]]`), so the link index, backlinks and the graph
 * count embeds as links. Where an embed token is not on its own line (inside a sentence, a list
 * item, a heading), it reads as a link.
 *
 * The work is bounded: an embedded page shows its own embeds down to `MAX_EMBED_DEPTH`, a page
 * that is already on the way down (a cycle) is not shown again, at most `MAX_EMBEDS_PER_PAGE`
 * embeds render in one page view, and the server sends at most `MAX_EMBED_CONTENT_CHARS` of an
 * embedded page's Markdown.
 *
 * Pure: no DOM and no Node-only APIs (imported by the server and the client).
 */
import { isPageId } from './page-links.js';

/** Deepest embed shown: an embed in the viewed page is depth 1, an embed inside that one 2. */
export const MAX_EMBED_DEPTH = 2;

/** Most embeds rendered in one page view, nested ones included. */
export const MAX_EMBEDS_PER_PAGE = 20;

/** Most characters of an embedded page's Markdown the server sends. */
export const MAX_EMBED_CONTENT_CHARS = 32_000;

export function pageEmbedToken(pageId: number): string {
  return `![[page:${pageId}]]`;
}

/** An embed token alone on a line that starts a block: up to three spaces (four make code). */
const EMBED_LINE = /^ {0,3}!\[\[page:(\d{1,10})\]\][ \t]*$/;
/** The same on a paragraph's continuation line, whose indentation Markdown drops. */
const EMBED_CONTINUATION_LINE = /^[ \t]*!\[\[page:(\d{1,10})\]\][ \t]*$/;

/**
 * The page id of a line that is only an embed token, or null (also for an id that cannot name a
 * page, see `isPageId`: such a token stays text and reads as a link).
 */
export function embedLinePageId(
  line: string,
  options: { continuation?: boolean } = {}
): number | null {
  const match = (options.continuation ? EMBED_CONTINUATION_LINE : EMBED_LINE).exec(line);
  if (!match) return null;
  const id = Number(match[1]);
  return isPageId(id) ? id : null;
}

/** The page id of an embed token's text as a whole (`![[page:12]]`, spaces around allowed). */
export function embedTokenPageId(text: string): number | null {
  return embedLinePageId(text.trim());
}

/** Why an embed is not rendered: a bad id, a page already above it, or too deep. */
export type EmbedRefusal = 'invalid' | 'cycle' | 'depth';

/**
 * Whether an embed of `pageId` may render, or why not. `ancestors` are the pages it would sit
 * inside, the viewed page first (when it has an id); `depth` is the depth it would have (1 for
 * an embed in the viewed page).
 */
export function embedRefusal(
  pageId: number,
  scope: { ancestors: readonly number[]; depth: number }
): EmbedRefusal | null {
  if (!isPageId(pageId)) return 'invalid';
  if (scope.ancestors.includes(pageId)) return 'cycle';
  if (scope.depth > MAX_EMBED_DEPTH) return 'depth';
  return null;
}

/**
 * At most `limit` characters of `content` for an embed, cut at a line break near the end when
 * there is one (so a line, and a token on it, is not cut in half) and never inside a surrogate
 * pair. Linear in the limit.
 */
export function truncateEmbedContent(
  content: string,
  limit = MAX_EMBED_CONTENT_CHARS
): { content: string; truncated: boolean } {
  if (content.length <= limit) return { content, truncated: false };
  let cut = limit;
  const code = content.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  const newline = content.lastIndexOf('\n', cut - 1);
  if (newline >= Math.floor(limit * 0.75)) cut = newline;
  return { content: content.slice(0, cut), truncated: true };
}
