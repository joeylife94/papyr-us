/**
 * Tags (#113 §2, #137): the `#tag` grammar, read the same way by the editor preview
 * (client/src/lib/inline-markdown.ts), the reader (client/src/lib/rehype-inline-tags.ts) and the
 * tag pane on the server (server/services/tag-pane.ts), plus the tag pane's nesting and counts.
 *
 * A tag is `#` followed by Unicode letters, digits, marks, `_`, `-` and `/`, with at least one
 * letter (`#113` stays text, like an issue number), after the start of the text or a boundary
 * character (whitespace, an opening bracket or quote, a Markdown marker…), never inside a word, a
 * URL or an entity. `/` nests tags: `#project/alpha` is `alpha` under `project`.
 *
 * Pure: no DOM and no Node-only APIs (imported by the server and the client).
 */

// ── Grammar ─────────────────────────────────────────────────────────────────────────────────

const TAG_CHARACTER = /^[\p{L}\p{N}\p{M}_\-/]$/u;
const LETTER = /\p{L}/u;
/**
 * What a `#tag` may follow besides the start of the text: whitespace, opening brackets and
 * quotes, Markdown markers and a few separators. Anything else (a letter, `/`, `&`, `]`…) means
 * the `#` is inside a word, a URL or an entity.
 */
const TAG_BOUNDARY = /^[\s([{"'“‘«「『【〈《*_~,，、;>|]$/u;

/** Whether a `#` after `previous` (undefined: start of the text) may start a tag. */
export function isTagBoundary(previous: string | undefined): boolean {
  return previous === undefined || TAG_BOUNDARY.test(previous);
}

/**
 * The name of the tag whose `#` is at `index`, or null. A name is Unicode letters, digits, `_`,
 * `-` and `/` with at least one letter (`#113` stays text, like an issue number). The caller
 * checks the character before the `#` with `isTagBoundary`.
 */
export function readTagName(text: string, index: number, end = text.length): string | null {
  if (text[index] !== '#') return null;
  let cursor = index + 1;
  while (cursor < end) {
    const char = String.fromCodePoint(text.codePointAt(cursor)!);
    if (!TAG_CHARACTER.test(char)) break;
    cursor += char.length;
  }
  const name = text.slice(index + 1, Math.min(cursor, end));
  return LETTER.test(name) ? name : null;
}

// ── Tag pane keys ───────────────────────────────────────────────────────────────────────────

/** Longest tag the tag pane lists (after normalizing); longer ones are left out. */
export const MAX_TAG_LENGTH = 120;
/** Deepest nesting the tag pane lists (`a/b/c` is 3); deeper tags are left out. */
export const MAX_TAG_DEPTH = 8;
/** Most distinct tags read from one page (its `tags` field first, then its content). */
export const MAX_TAGS_PER_PAGE = 100;

/**
 * The tag pane's key of a tag, from a `#tag` chip or the `tags` field: without a leading `#` and
 * with empty segments dropped (`#project/` and `project//alpha` nest like `project` and
 * `project/alpha`). Case is kept: `Plan` and `plan` are two tags, like the document list filter.
 * Null when nothing is left, or when the tag is longer or deeper than the pane lists.
 */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_TAG_LENGTH * 4) return null;
  let text = raw.trim();
  if (text.startsWith('#')) text = text.slice(1);
  const segments = text
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.length > MAX_TAG_DEPTH) return null;
  const tag = segments.join('/');
  return tag.length <= MAX_TAG_LENGTH ? tag : null;
}

/** `a/b/c` → `a`, `a/b`, `a/b/c`: the tag and every parent it nests under. */
export function tagAncestors(tag: string): string[] {
  const paths: string[] = [];
  for (let slash = tag.indexOf('/'); slash >= 0; slash = tag.indexOf('/', slash + 1)) {
    paths.push(tag.slice(0, slash));
  }
  paths.push(tag);
  return paths;
}

/** Whether `tag` is `selected` or nests under it (`project/alpha` is under `project`). */
export function isInTagTree(tag: string, selected: string): boolean {
  return tag === selected || (tag.length > selected.length && tag.startsWith(`${selected}/`));
}

// ── Inline tags of a page's Markdown ────────────────────────────────────────────────────────

const BACKSLASH = 92;
const BACKTICK = 96;
const TILDE = 126;
const OPEN_BRACKET = 91;
const AMPERSAND = 38;
const HASH = 35;
const SPACE = 32;
const TAB = 9;
const CARRIAGE_RETURN = 13;
const GREATER_THAN = 62;
const UNDERSCORE = 95;
const ASTERISK = 42;

const WHITESPACE_GROUP = 1;
const PUNCTUATION_GROUP = 2;

/** micromark's character groups around a delimiter run: whitespace, punctuation, or other (0). */
function characterGroup(char: string | undefined): number {
  if (char === undefined || /\s/.test(char)) return WHITESPACE_GROUP;
  return /[\p{P}\p{S}]/u.test(char) ? PUNCTUATION_GROUP : 0;
}

/** Markers of emphasis and (GFM) strikethrough: next to one, a run may always open or close. */
const isAttentionMarker = (char: string | undefined) =>
  char === '*' || char === '_' || char === '~';

const ESCAPABLE = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
const CHARACTER_REFERENCE = /&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/y;
const ATX_HEADING = /#{1,6}(?=[ \t\r\n]|$)/y;
const LIST_MARKER = /(?:[-*+]|\d{1,9}[.)])(?=[ \t\r\n]|$)/y;
/** Longest link text and destination looked for, as in the editor preview. */
const MAX_LINK_TEXT = 1000;
const MAX_LINK_DESTINATION = 2048;

/** Backtick runs of one inline range, each with the index of the next run of the same length. */
interface CodeRuns {
  runAt: Map<number, number>;
  starts: number[];
  lengths: number[];
  nextSameLength: number[];
}

function codeRuns(source: string, start: number, end: number): CodeRuns {
  const runAt = new Map<number, number>();
  const starts: number[] = [];
  const lengths: number[] = [];
  // A plain loop, not indexOf: indexOf would look past `end`, once per block.
  for (let at = start; at < end; at++) {
    if (source.charCodeAt(at) !== BACKTICK) continue;
    let length = 1;
    while (at + length < end && source.charCodeAt(at + length) === BACKTICK) length++;
    runAt.set(at, starts.length);
    starts.push(at);
    lengths.push(length);
    at += length - 1;
  }
  const nextSameLength = new Array<number>(starts.length).fill(-1);
  const latest = new Map<number, number>();
  for (let k = starts.length - 1; k >= 0; k--) {
    nextSameLength[k] = latest.get(lengths[k]) ?? -1;
    latest.set(lengths[k], k);
  }
  return { runAt, starts, lengths, nextSameLength };
}

/**
 * The next `](` of the whole text from `from` (-1: none). Shared by every block of one text:
 * blocks are scanned in order, so each search starts past the previous answer (linear).
 */
interface LinkCloseCache {
  from: number;
  at: number;
}

/** A `*` or `_` delimiter run that may still open emphasis (the delimiter stack). */
interface Opener {
  char: number;
  /** Where its unused delimiters start; a closer takes them from the end. */
  start: number;
  remaining: number;
  /** The run can also close. */
  both: boolean;
}

/**
 * One block's inline text: finds its `#tags` with the reader's rules. Code spans, links (text
 * and destination) and images are skipped whole; `\#` and character references are not tags.
 *
 * `_` is both a tag character and an emphasis delimiter, so emphasis is resolved first, as the
 * reader's parser (micromark) does for `*` and `_`: flanking, the rule of 3, delimiters between
 * a match dropped. A matched `_` ends the text a tag is read from (`_#idea_` is the tag `idea`).
 * Link matching shares a work budget proportional to the text and the delimiter search keeps
 * an "openers bottom" per kind of closer (as cmark does), so any input stays linear.
 */
class InlineScanner {
  private readonly runs: CodeRuns;
  private budget: number;
  /** Link ends by `[` position (-1: not a link), shared by both passes. */
  private readonly links = new Map<number, number>();
  private readonly openers: Opener[] = [];
  /** Per kind of closer, the stack height below which no opener can match it. */
  private readonly openersBottom = new Map<number, number>();
  /** Positions where a matched `_` delimiter ends the text before it. */
  private readonly emphasisBreaks = new Set<number>();

  constructor(
    private readonly source: string,
    private readonly start: number,
    private readonly end: number,
    private readonly found: Set<string>,
    private readonly limit: number,
    private readonly linkClose: LinkCloseCache
  ) {
    this.runs = codeRuns(source, start, end);
    this.budget = 4 * (end - start) + 4096;
  }

  /** Index just past the code span opened by the run at `index`, or past the run itself. */
  private skipCode(index: number): number {
    const run = this.runs.runAt.get(index);
    if (run === undefined) return index + 1;
    const length = this.runs.lengths[run];
    const close = this.runs.nextSameLength[run];
    return close < 0 ? index + length : this.runs.starts[close] + length;
  }

  /** The next `](` at or after `index` (consecutive `[` share one search). */
  private nextLinkClose(index: number): number {
    const cache = this.linkClose;
    if (cache.from >= 0 && cache.from <= index && (cache.at < 0 || cache.at >= index)) {
      return cache.at;
    }
    cache.from = index;
    cache.at = this.source.indexOf('](', index);
    return cache.at;
  }

  /** Index just past the link or image whose text opens at `index` (a `[`), or -1. */
  private link(index: number): number {
    let linkEnd = this.links.get(index);
    if (linkEnd === undefined) {
      linkEnd = this.matchLink(index);
      this.links.set(index, linkEnd);
    }
    return linkEnd;
  }

  private matchLink(index: number): number {
    const { source, end } = this;
    const textLimit = Math.min(end, index + MAX_LINK_TEXT);
    const closing = this.nextLinkClose(index);
    if (closing < 0 || closing >= textLimit || this.budget <= 0) return -1;

    let depth = 0;
    let cursor = index;
    for (; cursor < textLimit; cursor++) {
      this.budget--;
      const code = source.charCodeAt(cursor);
      if (code === BACKSLASH) cursor++;
      else if (code === BACKTICK) cursor = this.skipCode(cursor) - 1;
      else if (code === OPEN_BRACKET) depth++;
      else if (source[cursor] === ']' && --depth === 0) break;
    }
    if (cursor >= textLimit || source[cursor + 1] !== '(') return -1;

    const limit = Math.min(end, cursor + 2 + MAX_LINK_DESTINATION);
    let position = cursor + 2;
    const skipSpace = () => {
      while (position < limit && /[ \t\n]/.test(source[position])) {
        position++;
        this.budget--;
      }
    };
    skipSpace();
    if (source[position] === '<') {
      for (position++; position < limit && source[position] !== '>'; position++) {
        this.budget--;
        if (source[position] === '<' || source[position] === '\n') return -1;
      }
      if (position >= limit) return -1;
      position++;
    } else {
      let parentheses = 0;
      for (; position < limit; position++) {
        this.budget--;
        const char = source[position];
        if (char === '\\' && ESCAPABLE.has(source[position + 1])) {
          position++;
          continue;
        }
        // eslint-disable-next-line no-control-regex
        if (/[\s\u0000-\u001f]/.test(char)) break;
        if (char === '(') parentheses++;
        else if (char === ')') {
          if (parentheses === 0) break;
          parentheses--;
        }
      }
      if (parentheses !== 0) return -1;
    }
    const afterDestination = position;
    skipSpace();
    const opener = source[position];
    if (position > afterDestination && (opener === '"' || opener === "'" || opener === '(')) {
      const closer = opener === '(' ? ')' : opener;
      position++;
      while (position < limit && source[position] !== closer) {
        if (source[position] === '\\') position++;
        position++;
        this.budget--;
      }
      if (position >= limit) return -1;
      position++;
      skipSpace();
    }
    return position < limit && source[position] === ')' ? position + 1 : -1;
  }

  /**
   * Index past the escape, code span, link, image or character reference at `index`, or -1 when
   * none starts there. Both passes skip exactly the same text.
   */
  private skip(index: number): number {
    const { source, end } = this;
    switch (source.charCodeAt(index)) {
      case BACKSLASH:
        return index + (index + 1 < end && ESCAPABLE.has(source[index + 1]) ? 2 : 1);
      case BACKTICK:
        return this.skipCode(index);
      case OPEN_BRACKET: {
        const linkEnd = this.link(index);
        return linkEnd > index ? linkEnd : -1;
      }
      case AMPERSAND:
        CHARACTER_REFERENCE.lastIndex = index;
        return CHARACTER_REFERENCE.test(source) ? CHARACTER_REFERENCE.lastIndex : -1;
      default:
        return -1;
    }
  }

  /**
   * A `*` or `_` delimiter run at `start`: matched as a closer against earlier openers, then kept
   * as an opener if it can open. The flanking rules and the rule of 3 (on the sizes left) are
   * micromark's, which the reader uses.
   */
  private delimiterRun(char: number, start: number, length: number): void {
    const { source, openers } = this;
    const previous = source[start - 1];
    const next = start + length < this.end ? source[start + length] : undefined;
    const before = characterGroup(previous);
    const after = characterGroup(next);
    const open = !after || (after === PUNCTUATION_GROUP && before > 0) || isAttentionMarker(next);
    const close =
      !before || (before === PUNCTUATION_GROUP && after > 0) || isAttentionMarker(previous);
    const canOpen = char === ASTERISK ? open : open && (before > 0 || !close);
    const canClose = char === ASTERISK ? close : close && (after > 0 || !open);

    let remaining = length;
    while (canClose && remaining > 0) {
      const kind = (char === UNDERSCORE ? 6 : 0) + (canOpen ? 3 : 0) + (remaining % 3);
      const bottom = Math.min(this.openersBottom.get(kind) ?? 0, openers.length);
      let match = -1;
      for (let k = openers.length - 1; k >= bottom; k--) {
        const opener = openers[k];
        if (opener.char !== char) continue;
        const multipleOfThree =
          (opener.both || canOpen) &&
          remaining % 3 !== 0 &&
          (opener.remaining + remaining) % 3 === 0;
        if (!multipleOfThree) {
          match = k;
          break;
        }
      }
      if (match < 0) {
        this.openersBottom.set(kind, openers.length);
        break;
      }
      const opener = openers[match];
      const use = opener.remaining > 1 && remaining > 1 ? 2 : 1;
      opener.remaining -= use;
      if (char === UNDERSCORE) {
        // The opener's used delimiters are its last ones, the closer's its first ones.
        this.emphasisBreaks.add(opener.start + opener.remaining);
        this.emphasisBreaks.add(start + length - remaining);
      }
      remaining -= use;
      // Delimiters between the match and this closer can no longer match anything.
      openers.length = opener.remaining > 0 ? match + 1 : match;
      // The opener left on top has a new size: every kind of closer may match it again.
      for (const [key, value] of this.openersBottom) {
        if (value > match) this.openersBottom.set(key, match);
      }
    }
    if (canOpen && remaining > 0) {
      openers.push({ char, start: start + length - remaining, remaining, both: canClose });
    }
  }

  /** Pass 1: emphasis, so pass 2 knows where `_` delimiters end the text. */
  private resolveEmphasis(): void {
    const { source, end } = this;
    let index = this.start;
    while (index < end) {
      const skipped = this.skip(index);
      if (skipped > index) {
        index = skipped;
        continue;
      }
      const code = source.charCodeAt(index);
      if (code === UNDERSCORE || code === ASTERISK) {
        let length = 1;
        while (index + length < end && source.charCodeAt(index + length) === code) length++;
        this.delimiterRun(code, index, length);
        index += length;
      } else {
        index++;
      }
    }
  }

  scan(): void {
    const { source, end, found } = this;
    this.resolveEmphasis();
    let index = this.start;
    while (index < end && found.size < this.limit) {
      const skipped = this.skip(index);
      if (skipped > index) {
        index = skipped;
        continue;
      }
      if (source.charCodeAt(index) !== HASH) {
        index++;
        continue;
      }
      let name = isTagBoundary(source[index - 1]) ? readTagName(source, index, end) : null;
      if (!name) {
        index++;
        continue;
      }
      const after = index + 1 + name.length;
      // A matched `_` inside the name ends the text the reader reads the tag from.
      for (let at = name.indexOf('_'); at >= 0; at = name.indexOf('_', at + 1)) {
        if (this.emphasisBreaks.has(index + 1 + at)) {
          name = name.slice(0, at);
          break;
        }
      }
      if (LETTER.test(name)) found.add(name);
      index = after;
    }
  }
}

/** Width of `source[from, to)` as Markdown indentation (a tab advances to the next stop of 4). */
function indentWidth(source: string, from: number, to: number): number {
  let width = 0;
  for (let index = from; index < to; index++) {
    width = source.charCodeAt(index) === TAB ? width + 4 - (width % 4) : width + 1;
  }
  return width;
}

interface OpenFence {
  char: number;
  length: number;
  /** `>` markers before the opening fence: a line with fewer ends the quote, and the code. */
  quotes: number;
  /** Content column of the list item holding the fence (0 outside lists): less ends it. */
  indent: number;
}

/**
 * The `#tags` of a page's Markdown `content`, as the reader shows them as chips: distinct names
 * in order of first appearance, at most `limit`.
 *
 * Nothing is rendered: block structure is read line by line, close to CommonMark for what the
 * editor writes (see shared/block-markdown.ts). Fenced code (also inside quotes and list items)
 * and indented code are skipped; every other block's text is scanned inline (`InlineScanner`).
 * tests/unit/tags.test.ts holds the result to the reader's chips. Not modelled, so they can
 * differ: HTML (an HTML block's or tag's text counts), reference links (`[x][ref]`), literal
 * autolinks (`www.x.y`), indented code inside a quote or list item, and an escape or character
 * reference inside a tag name (it ends the name, as in the editor preview; the reader reads it
 * decoded). Linear in the length of `markdown`.
 */
export function extractInlineTags(markdown: string, limit = MAX_TAGS_PER_PAGE): string[] {
  const found = new Set<string>();
  if (typeof markdown !== 'string' || !markdown.includes('#')) return [];
  const source = markdown;
  const length = source.length;

  let fence: OpenFence | null = null;
  let previousBlank = true;
  let inIndentedCode = false;
  let inList = false;
  let previousHeading = false;
  let previousQuotes = 0;
  let chunkStart = -1;
  let chunkEnd = -1;
  const linkClose: LinkCloseCache = { from: -1, at: -1 };

  const flush = () => {
    if (chunkStart >= 0 && found.size < limit) {
      new InlineScanner(source, chunkStart, chunkEnd, found, limit, linkClose).scan();
    }
    chunkStart = -1;
  };

  for (let lineStart = 0; lineStart <= length && found.size < limit; ) {
    let lineEnd = source.indexOf('\n', lineStart);
    if (lineEnd < 0) lineEnd = length;
    const next = lineEnd + 1;
    let contentEnd = lineEnd;
    if (contentEnd > lineStart && source.charCodeAt(contentEnd - 1) === CARRIAGE_RETURN) {
      contentEnd--;
    }

    let textStart = lineStart;
    while (
      textStart < contentEnd &&
      (source.charCodeAt(textStart) === SPACE || source.charCodeAt(textStart) === TAB)
    ) {
      textStart++;
    }
    const blank = textStart >= contentEnd;
    const indent = indentWidth(source, lineStart, textStart);

    // Container markers: `>` quotes and list markers, in any order (`> - `, `- > `).
    let markerEnd = textStart;
    let quotes = 0;
    let listItem = false;
    for (;;) {
      if (source.charCodeAt(markerEnd) === GREATER_THAN && markerEnd < contentEnd) {
        quotes++;
        markerEnd++;
      } else {
        LIST_MARKER.lastIndex = markerEnd;
        const marker = markerEnd < contentEnd && LIST_MARKER.exec(source);
        if (!marker || marker.index + marker[0].length > contentEnd) break;
        listItem = true;
        markerEnd += marker[0].length;
      }
      while (
        markerEnd < contentEnd &&
        (source.charCodeAt(markerEnd) === SPACE || source.charCodeAt(markerEnd) === TAB)
      ) {
        markerEnd++;
      }
    }

    if (fence) {
      if (blank || (quotes >= fence.quotes && indent >= fence.indent)) {
        let run = 0;
        while (source.charCodeAt(markerEnd + run) === fence.char) run++;
        const rest = source.slice(markerEnd + run, contentEnd);
        if (run >= fence.length && rest.trim() === '') fence = null;
        lineStart = next;
        continue;
      }
      fence = null; // The quote or list item holding the code ended, and the code with it.
    }

    if (blank) {
      flush();
      previousBlank = true;
      lineStart = next;
      continue;
    }

    if (indent >= 4 && (previousBlank || inIndentedCode) && !inList) {
      flush();
      inIndentedCode = true;
      previousBlank = false;
      lineStart = next;
      continue;
    }
    inIndentedCode = false;
    if (indent < 4 && listItem) inList = true;
    else if (previousBlank && indent < 2 && quotes === 0) inList = false;

    const fenceChar = source.charCodeAt(markerEnd);
    if (indent < 4 && (fenceChar === BACKTICK || fenceChar === TILDE)) {
      let run = 0;
      while (source.charCodeAt(markerEnd + run) === fenceChar) run++;
      const info = source.slice(markerEnd + run, contentEnd);
      if (run >= 3 && !(fenceChar === BACKTICK && info.includes('`'))) {
        flush();
        const listIndent = listItem || inList ? indentWidth(source, lineStart, markerEnd) : 0;
        fence = { char: fenceChar, length: run, quotes, indent: listIndent };
        previousBlank = false;
        lineStart = next;
        continue;
      }
    }

    // A list item, a heading or a deeper quote starts a new block: inline text (a code span, an
    // emphasis) never runs from one block into the next.
    ATX_HEADING.lastIndex = markerEnd;
    const heading = ATX_HEADING.test(source);
    if (listItem || heading || previousHeading || (quotes > 0 && quotes !== previousQuotes)) {
      flush();
    }
    previousHeading = heading;
    previousQuotes = quotes;

    if (chunkStart < 0) chunkStart = lineStart;
    chunkEnd = contentEnd;
    previousBlank = false;
    lineStart = next;
  }
  flush();
  return Array.from(found).slice(0, limit);
}

// ── Tag pane: a page's tags, nesting and counts ─────────────────────────────────────────────

/**
 * The tag pane's tags of one page: its `tags` field and the `#tags` of its content, normalized
 * (`normalizeTag`), distinct, at most `MAX_TAGS_PER_PAGE`.
 */
export function pageTags(fieldTags: unknown, content: string | null | undefined): string[] {
  const tags = new Set<string>();
  const add = (raw: unknown) => {
    const tag = normalizeTag(raw);
    if (tag) tags.add(tag);
  };
  if (Array.isArray(fieldTags)) {
    for (const raw of fieldTags) {
      if (tags.size >= MAX_TAGS_PER_PAGE) break;
      add(raw);
    }
  }
  if (content && tags.size < MAX_TAGS_PER_PAGE) {
    for (const raw of extractInlineTags(content, MAX_TAGS_PER_PAGE)) {
      if (tags.size >= MAX_TAGS_PER_PAGE) break;
      add(raw);
    }
  }
  return Array.from(tags);
}

/** One tag of the pane: a tag some page carries, or a parent that only exists through nesting. */
export interface TagCount {
  /** The full path, `project/alpha`. */
  name: string;
  /** Distinct pages carrying this tag or a tag nested under it. */
  count: number;
  /** Pages carrying exactly this tag. */
  direct: number;
}

/**
 * Counts for the tag pane from each page's tags (`pageTags`). A parent counts the distinct pages
 * of itself and everything nested under it: a page tagged `project/alpha` and `project/beta`
 * counts once for `project`. Ordered by count (highest first), then name, and cut to `limit`:
 * a parent never counts less than its children and its name sorts first, so a cut list still
 * holds the parent of every tag it holds.
 */
export function countTags(
  pages: Iterable<readonly string[]>,
  limit: number
): { tags: TagCount[]; truncated: boolean } {
  const counts = new Map<string, TagCount>();
  for (const tags of pages) {
    const seen = new Set<string>();
    for (const tag of new Set(tags)) {
      for (const path of tagAncestors(tag)) {
        let entry = counts.get(path);
        if (!entry) {
          entry = { name: path, count: 0, direct: 0 };
          counts.set(path, entry);
        }
        if (!seen.has(path)) {
          seen.add(path);
          entry.count++;
        }
        if (path === tag) entry.direct++;
      }
    }
  }
  const sorted = Array.from(counts.values()).sort((a, b) =>
    a.count !== b.count ? b.count - a.count : a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  return { tags: sorted.slice(0, limit), truncated: sorted.length > limit };
}
