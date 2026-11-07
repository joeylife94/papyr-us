/**
 * Page preview excerpts (issue #133): the start of a page as plain text, for the card shown when
 * a page link is hovered or focused. The server builds it from the page's Markdown `content`,
 * only for pages the caller may read, and the client renders it as text (never as HTML).
 *
 * - Markdown syntax is dropped: block markers (headings, list and to-do markers, quotes,
 *   horizontal rules, setext underlines, table delimiter rows and pipes), emphasis marks, code
 *   fences together with their code, inline code marks (the code text stays), link syntax (the
 *   link text stays), raw HTML tags and a leading frontmatter block.
 * - Images (`![alt](url)`) and embeds (`![[...]]`) are dropped entirely.
 * - Page link tokens (`[[page:<id>]]`) become parts the caller names: `renderPageExcerpt` shows
 *   the target's title when the caller may read it and "[링크]" otherwise.
 * - Whitespace collapses to single spaces, and "…" marks text that was cut.
 *
 * Content is untrusted and can be large. The scan reads lines in order and stops as soon as it
 * has more text than the excerpt holds. A construct (link, image, embed, tag, code span) is
 * looked for at most LOOKAHEAD characters ahead; a failed attempt keeps its first character as
 * text, so failed attempts are bounded by the excerpt length. No regular expression runs over an
 * unbounded span with backtracking, so the cost is linear in the content scanned.
 *
 * Pure: no DOM and no Node-only APIs.
 */
import { splitFrontmatter } from './block-markdown.js';
import { isPageId } from './page-links.js';

/** Characters of plain text in an excerpt (before the ellipsis). */
export const PAGE_EXCERPT_LENGTH = 300;

/** How an excerpt names a link to a page the caller may not read, or that does not exist. */
export const UNNAMED_PAGE_LINK = '[링크]';

/** Longest link, image, embed, tag or code span read as one construct. */
const LOOKAHEAD = 1000;

export type PageExcerptPart = string | { pageId: number };

/** An excerpt before its links are named: text runs and link targets, in order. */
export interface PageExcerptDraft {
  parts: PageExcerptPart[];
  /** The content has more text than `parts` holds. */
  truncated: boolean;
}

const isSpace = (char: string | undefined) =>
  char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f' || char === '\v';

const isWhitespace = (char: string | undefined) =>
  char !== undefined && (isSpace(char) || /\s/.test(char));

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

const ASCII_PUNCTUATION = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');

/**
 * Collects excerpt text with whitespace collapsed, and stops accepting it once it holds more than
 * `limit` characters (links counted as "[링크]"), which is how the scan knows the text was cut.
 */
class ExcerptWriter {
  readonly parts: PageExcerptPart[] = [];
  private text = '';
  private length = 0;
  private pendingSpace = false;

  constructor(private readonly limit: number) {}

  get full(): boolean {
    return this.length > this.limit;
  }

  space(): void {
    if (this.length > 0) this.pendingSpace = true;
  }

  write(value: string): void {
    for (let at = 0; at < value.length && !this.full; at++) {
      const char = value[at];
      if (isWhitespace(char)) {
        this.space();
        continue;
      }
      this.flushSpace();
      this.text += char;
      this.length += 1;
    }
  }

  link(pageId: number): void {
    if (this.full) return;
    this.flushSpace();
    if (this.text) this.parts.push(this.text);
    this.text = '';
    this.parts.push({ pageId });
    this.length += UNNAMED_PAGE_LINK.length;
  }

  finish(): PageExcerptPart[] {
    if (this.text) this.parts.push(this.text);
    this.text = '';
    return this.parts;
  }

  private flushSpace(): void {
    if (!this.pendingSpace) return;
    this.pendingSpace = false;
    this.text += ' ';
    this.length += 1;
  }
}

/** `[text](destination)` starting at `start` (a `[`), within LOOKAHEAD; text holds no `[`. */
function inlineLinkAt(line: string, start: number): { text: string; end: number } | null {
  const limit = Math.min(line.length, start + LOOKAHEAD);
  let close = start + 1;
  while (close < limit && line[close] !== ']') {
    if (line[close] === '[') return null;
    close += line[close] === '\\' ? 2 : 1;
  }
  if (close >= limit || line[close + 1] !== '(') return null;
  let depth = 0;
  for (let at = close + 2; at < limit; at++) {
    if (line[at] === '\\') at++;
    else if (line[at] === '(') depth++;
    else if (line[at] === ')') {
      if (depth === 0) return { text: line.slice(start + 1, close), end: at + 1 };
      depth--;
    }
  }
  return null;
}

/** The end of an `![[...]]` embed starting at `start` (the `!`), or -1. */
function embedEndAt(line: string, start: number): number {
  const limit = Math.min(line.length, start + LOOKAHEAD);
  for (let at = start + 3; at < limit; at++) {
    if (line[at] === '[') return -1;
    if (line[at] === ']') return line[at + 1] === ']' ? at + 2 : -1;
  }
  return -1;
}

/** The id and end of a `[[page:<id>]]` token starting at `start`, or null. */
function pageLinkAt(line: string, start: number): { pageId: number; end: number } | null {
  if (!line.startsWith('[[page:', start)) return null;
  let at = start + 7;
  while (at < line.length && at - start - 7 < 10 && line[at] >= '0' && line[at] <= '9') at++;
  if (at === start + 7 || !line.startsWith(']]', at)) return null;
  return { pageId: Number(line.slice(start + 7, at)), end: at + 2 };
}

const HTML_TAG = /^(?:\/?[A-Za-z][A-Za-z0-9-]*(?:[\s/][^<>]*)?|!--[^<>]*--)$/;
const AUTOLINK = /^(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>@]+)$/;

/** A raw HTML tag or an autolink starting at `start` (a `<`), within LOOKAHEAD. */
function angleAt(line: string, start: number): { text: string; end: number } | null {
  const limit = Math.min(line.length, start + LOOKAHEAD);
  for (let at = start + 1; at < limit; at++) {
    if (line[at] === '<' || line[at] === '\n') return null;
    if (line[at] !== '>') continue;
    const inner = line.slice(start + 1, at);
    if (AUTOLINK.test(inner)) return { text: inner, end: at + 1 };
    if (HTML_TAG.test(inner)) return { text: '', end: at + 1 };
    return null;
  }
  return null;
}

/** A code span opened by the backtick run at `start` (`length` backticks), within LOOKAHEAD. */
function codeSpanAt(
  line: string,
  start: number,
  length: number
): { text: string; end: number } | null {
  const limit = Math.min(line.length, start + length + LOOKAHEAD);
  for (let at = start + length; at < limit; ) {
    if (line[at] !== '`') {
      at++;
      continue;
    }
    let run = 1;
    while (at + run < limit && line[at + run] === '`') run++;
    // A run cut by the window could be longer than it looks.
    if (at + run === limit && line[limit] === '`') return null;
    if (run === length) return { text: line.slice(start + length, at), end: at + run };
    at += run;
  }
  return null;
}

/** Inline Markdown of one line (or a link's text) as plain text. */
function writeInline(line: string, out: ExcerptWriter, tableRow: boolean): void {
  let at = 0;
  while (at < line.length && !out.full) {
    const char = line[at];
    if (char === '\\') {
      const next = line[at + 1];
      if (next === undefined)
        at += 1; // a hard line break
      else if (ASCII_PUNCTUATION.has(next)) {
        out.write(next);
        at += 2;
      } else {
        out.write(char);
        at += 1;
      }
      continue;
    }
    if (char === '[') {
      const token = pageLinkAt(line, at);
      if (token) {
        out.link(token.pageId);
        at = token.end;
        continue;
      }
      const link = inlineLinkAt(line, at);
      if (link) {
        writeInline(link.text, out, false);
        at = link.end;
        continue;
      }
    } else if (char === '!' && line[at + 1] === '[') {
      // Images and embeds show nothing in an excerpt.
      const end =
        line[at + 2] === '[' ? embedEndAt(line, at) : (inlineLinkAt(line, at + 1)?.end ?? -1);
      if (end > 0) {
        out.space();
        at = end;
        continue;
      }
    } else if (char === '<') {
      const angle = angleAt(line, at);
      if (angle) {
        // Raw HTML is dropped, as in the reader; an autolink shows its address.
        out.write(angle.text);
        at = angle.end;
        continue;
      }
    } else if (char === '`') {
      let length = 1;
      while (line[at + length] === '`') length++;
      const code = codeSpanAt(line, at, length);
      if (code) {
        out.write(code.text);
        at = code.end;
      } else {
        out.write(line.slice(at, at + length));
        at += length;
      }
      continue;
    } else if (char === '*' || char === '_' || char === '~') {
      let length = 1;
      while (line[at + length] === char) length++;
      const before = line[at - 1];
      const after = line[at + length];
      const flanking = !isWhitespace(after) && after !== undefined;
      const closing = !isWhitespace(before) && before !== undefined;
      // A delimiter run next to text is emphasis; `snake_case` and a lone `~` stay as written.
      const emphasis =
        (flanking || closing) &&
        !(char === '_' && isWordChar(before) && isWordChar(after)) &&
        !(char === '~' && length < 2);
      if (!emphasis) out.write(line.slice(at, at + length));
      at += length;
      continue;
    } else if (char === '|' && tableRow) {
      out.space();
      at += 1;
      continue;
    }
    out.write(char);
    at += 1;
  }
}

/** A thematic break, setext underline or table delimiter row: no text of its own. */
function isRuleLine(text: string): boolean {
  let marks = 0;
  let dashes = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (isSpace(char)) continue;
    if (
      char !== '-' &&
      char !== '*' &&
      char !== '_' &&
      char !== '=' &&
      char !== '|' &&
      char !== ':'
    ) {
      return false;
    }
    marks++;
    if (char === '-' || char === '=' || char === '*' || char === '_') dashes++;
  }
  return marks >= 3 && dashes >= 1;
}

/** Leading spaces and blockquote markers (`>`, any depth). */
function skipContainers(line: string): number {
  let at = 0;
  for (;;) {
    while (isSpace(line[at])) at++;
    if (line[at] !== '>') return at;
    at++;
  }
}

/** The end of a list item marker (`-`, `*`, `+`, `1.`, `1)`) and to-do box at `start`, or `start`. */
function skipListMarker(line: string, start: number): number {
  let at = start;
  if (line[at] === '-' || line[at] === '*' || line[at] === '+') {
    at++;
  } else {
    while (at - start < 9 && line[at] >= '0' && line[at] <= '9') at++;
    if (at === start || (line[at] !== '.' && line[at] !== ')')) return start;
    at++;
  }
  if (at < line.length && !isSpace(line[at])) return start;
  while (isSpace(line[at])) at++;
  if (line[at] === '[' && ' xX'.includes(line[at + 1] ?? '-') && line[at + 2] === ']') {
    const after = line[at + 3];
    if (after === undefined || isSpace(after)) {
      at += 3;
      while (isSpace(line[at])) at++;
    }
  }
  return at;
}

/** An ATX heading's text without its opening and closing `#` marks, or null if not a heading. */
function headingText(line: string, start: number): string | null {
  let at = start;
  while (at - start < 7 && line[at] === '#') at++;
  const level = at - start;
  if (level === 0 || level > 6 || (at < line.length && !isSpace(line[at]))) return null;
  let end = line.length;
  while (end > at && isSpace(line[end - 1])) end--;
  let marks = end;
  while (marks > at && line[marks - 1] === '#') marks--;
  if (marks === at || isSpace(line[marks - 1])) end = marks;
  return line.slice(at, end);
}

const FENCE_OPEN = /^(`{3,}|~{3,})/;

/**
 * The excerpt of `content` up to `maxLength` characters, with its link tokens left for the
 * caller to name (see `excerptLinkIds` and `renderPageExcerpt`).
 */
export function draftPageExcerpt(
  content: string | null | undefined,
  maxLength = PAGE_EXCERPT_LENGTH
): PageExcerptDraft {
  const out = new ExcerptWriter(maxLength);
  let text = content ?? '';
  if (/^﻿?---/.test(text)) text = splitFrontmatter(text).body;

  let fence: { marker: string; length: number } | null = null;
  for (let start = 0; start <= text.length && !out.full; ) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end);
    start = end + 1;
    out.space();

    const body = line.slice(skipContainers(line));
    if (fence) {
      const close = FENCE_OPEN.exec(body);
      if (
        close &&
        close[1][0] === fence.marker &&
        close[1].length >= fence.length &&
        body.slice(close[1].length).trim() === ''
      ) {
        fence = null;
      }
      continue;
    }
    const open = FENCE_OPEN.exec(body);
    if (open && !(open[1][0] === '`' && body.slice(open[1].length).includes('`'))) {
      // Code blocks are left out, as in document list previews.
      fence = { marker: open[1][0], length: open[1].length };
      continue;
    }
    if (isRuleLine(body)) continue;

    const heading = headingText(body, 0);
    const rest = heading ?? body.slice(skipListMarker(body, 0));
    writeInline(rest, out, rest.startsWith('|'));
  }
  return { parts: out.finish(), truncated: out.full };
}

/** The distinct valid page ids linked in a draft, in order. */
export function excerptLinkIds(draft: PageExcerptDraft): number[] {
  const ids = new Set<number>();
  for (const part of draft.parts) {
    if (typeof part !== 'string' && isPageId(part.pageId)) ids.add(part.pageId);
  }
  return Array.from(ids);
}

/** `text` cut to `length` UTF-16 units without splitting a surrogate pair. */
function cut(text: string, length: number): string {
  const code = text.charCodeAt(length - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? length - 1 : length);
}

/**
 * The excerpt as text: each link named by `titles` (pages the caller may read) or "[링크]",
 * cut to `maxLength` characters, with "…" when the page has more text.
 */
export function renderPageExcerpt(
  draft: PageExcerptDraft,
  titles: ReadonlyMap<number, string> = new Map(),
  maxLength = PAGE_EXCERPT_LENGTH
): string {
  let text = '';
  for (const part of draft.parts) {
    if (text.length > maxLength) break;
    if (typeof part === 'string') text += part;
    else {
      const title = titles.get(part.pageId)?.replace(/\s+/g, ' ').trim();
      text += title || UNNAMED_PAGE_LINK;
    }
  }
  if (text.length > maxLength) return `${cut(text, maxLength).trimEnd()}…`;
  return draft.truncated ? `${text.trimEnd()}…` : text;
}

/** `draftPageExcerpt` and `renderPageExcerpt` in one step. */
export function buildPageExcerpt(
  content: string | null | undefined,
  titles: ReadonlyMap<number, string> = new Map(),
  maxLength = PAGE_EXCERPT_LENGTH
): string {
  return renderPageExcerpt(draftPageExcerpt(content, maxLength), titles, maxLength);
}
