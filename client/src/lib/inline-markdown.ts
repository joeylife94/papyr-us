/**
 * Inline Markdown for the block editor's live preview (#113 §2).
 *
 * A small, pure tokenizer: the text of one block in, a tree of inline nodes out. Renderers turn
 * the nodes into React elements (never into an HTML string), so block text stays text whatever
 * it holds. It covers what a text block carries inline: `**strong**` / `__strong__`, `*em*` /
 * `_em_`, `~~strike~~`, `` `code` ``, `[text](url)`, page link tokens (`[[page:<id>]]`) and
 * `#tags`. Anything it does not match stays literal text; `\*` and friends are escapes; nothing
 * inside code is parsed. It follows CommonMark where that is cheap and stays simpler elsewhere
 * (no reference links, autolinks or images: those show as written).
 *
 * Text and code nodes carry the source offset of their first character, so a click in the
 * preview can put the caret at the matching place in the block's textarea.
 */
// Relative import: unit tests load this module without the Vite aliases.
import { isSafeUrl } from './rehype-safe-urls';

export type InlineNode =
  | { type: 'text'; text: string; from: number }
  | { type: 'code'; text: string; from: number }
  | { type: 'strong' | 'em' | 'strike'; children: InlineNode[] }
  /** `href` is null when the URL failed the allowlist: the text shows without a link. */
  | { type: 'link'; href: string | null; children: InlineNode[] }
  | { type: 'pageLink'; pageId: number }
  | { type: 'tag'; tag: string };

// ── Tags ────────────────────────────────────────────────────────────────────────────────────

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

/** Where a tag chip leads: the document list filtered by that tag. */
export function tagHref(tag: string): string {
  return `/?tag=${encodeURIComponent(tag)}`;
}

/** Look of a `#tag` chip, shared by the editor preview, the reader and the tag filter. */
export const TAG_CHIP_CLASS =
  'not-prose mx-px inline-flex items-center rounded-md bg-accent px-1 align-baseline font-medium leading-snug text-highlight no-underline transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// ── Scanning helpers ────────────────────────────────────────────────────────────────────────

const ESCAPABLE = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
const PAGE_LINK_AT = /\[\[page:(\d{1,9})\]\]/y;
const ALPHANUMERIC = /^[\p{L}\p{N}]$/u;
const WHITESPACE = /^\s$/;
/**
 * Longest link text and destination looked for. Far above real links; it keeps a block full of
 * unmatched `[` linear instead of quadratic.
 */
const MAX_LINK_TEXT = 1000;
const MAX_LINK_DESTINATION = 2048;

const isWhitespace = (char: string | undefined) => char === undefined || WHITESPACE.test(char);
const isAlphanumeric = (char: string | undefined) => char !== undefined && ALPHANUMERIC.test(char);

function runLength(source: string, index: number, end: number, char: string): number {
  let cursor = index;
  while (cursor < end && source[cursor] === char) cursor++;
  return cursor - index;
}

/**
 * Backtick runs of `source[0, end)`, each with the index of the next run of the same length, built
 * once per source and range. A code span closes at the next run of exactly its size, so this makes
 * every lookup O(1) instead of rescanning the rest of the text for each unmatched run.
 */
interface CodeRuns {
  source: string;
  end: number;
  runAt: Map<number, number>;
  starts: number[];
  nextSameLength: number[];
}
let codeRunsCache: CodeRuns | null = null;

function codeRunsFor(source: string, end: number): CodeRuns {
  if (codeRunsCache && codeRunsCache.source === source && codeRunsCache.end === end) {
    return codeRunsCache;
  }
  const runAt = new Map<number, number>();
  const starts: number[] = [];
  const lengths: number[] = [];
  for (let at = source.indexOf('`'); at >= 0 && at < end; ) {
    const length = runLength(source, at, end, '`');
    runAt.set(at, starts.length);
    starts.push(at);
    lengths.push(length);
    at = source.indexOf('`', at + length);
  }
  const nextSameLength = new Array<number>(starts.length).fill(-1);
  const latest = new Map<number, number>();
  for (let k = starts.length - 1; k >= 0; k--) {
    nextSameLength[k] = latest.get(lengths[k]) ?? -1;
    latest.set(lengths[k], k);
  }
  codeRunsCache = { source, end, runAt, starts, nextSameLength };
  return codeRunsCache;
}

/** Start of the backtick run of exactly `size` that closes a code span, or -1. */
function findCodeClose(source: string, from: number, end: number, size: number): number {
  // Callers pass the position right after a whole opening run: answer from the run index.
  const runs = codeRunsFor(source, end);
  const opener = runs.runAt.get(from - size);
  if (opener !== undefined) {
    const close = runs.nextSameLength[opener];
    return close < 0 ? -1 : runs.starts[close];
  }
  let cursor = from;
  while (cursor < end) {
    if (source[cursor] !== '`') {
      cursor++;
      continue;
    }
    const run = runLength(source, cursor, end, '`');
    if (run === size) return cursor;
    cursor += run;
  }
  return -1;
}

/** Index just past the code span (or the unmatched backtick run) starting at `index`. */
function skipCode(source: string, index: number, end: number): number {
  const size = runLength(source, index, end, '`');
  const close = findCodeClose(source, index + size, end, size);
  return close >= 0 ? close + size : index + size;
}

const NAMED_REFERENCES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  num: '#',
  tab: '\t',
  newline: '\n',
};

/** A link destination with its backslash escapes and character references resolved. */
function decodeDestination(raw: string): string {
  return raw.replace(
    /\\([!-/:-@[-`{-~])|&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/g,
    (match, escaped?: string, decimal?: string, hex?: string, name?: string) => {
      if (escaped) return escaped;
      if (name) return NAMED_REFERENCES[name] ?? match;
      const code = decimal ? Number(decimal) : parseInt(hex!, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
    }
  );
}

interface LinkMatch {
  textFrom: number;
  textTo: number;
  destination: string;
  end: number;
}

let linkCloseCache: { source: string; from: number; at: number } | null = null;

/**
 * The next `](` at or after `index`. Consecutive `[` share one search (the answer cannot change
 * until `index` passes it), so a text full of unmatched `[` stays linear.
 */
function nextLinkClose(source: string, index: number): number {
  const cache = linkCloseCache;
  if (
    cache &&
    cache.source === source &&
    cache.from <= index &&
    (cache.at < 0 || cache.at >= index)
  ) {
    return cache.at;
  }
  const at = source.indexOf('](', index);
  linkCloseCache = { source, from: index, at };
  return at;
}

/** `[text](destination "title")` starting at `index`, or null. */
function matchLink(source: string, index: number, end: number): LinkMatch | null {
  const textLimit = Math.min(end, index + MAX_LINK_TEXT);
  const closing = nextLinkClose(source, index);
  if (closing < 0 || closing >= textLimit) return null;
  let depth = 0;
  let cursor = index;
  for (; cursor < textLimit; cursor++) {
    const char = source[cursor];
    if (char === '\\') {
      cursor++;
    } else if (char === '`') {
      cursor = skipCode(source, cursor, textLimit) - 1;
    } else if (char === '[') {
      depth++;
    } else if (char === ']' && --depth === 0) {
      break;
    }
  }
  if (cursor >= textLimit || source[cursor + 1] !== '(') return null;
  const textTo = cursor;

  const limit = Math.min(end, textTo + MAX_LINK_DESTINATION);
  let position = textTo + 2;
  while (position < limit && (source[position] === ' ' || source[position] === '\t')) position++;
  let raw: string;
  if (source[position] === '<') {
    const close = source.indexOf('>', position + 1);
    if (close < 0 || close >= limit) return null;
    raw = source.slice(position + 1, close);
    if (/[<\n]/.test(raw)) return null;
    position = close + 1;
  } else {
    const from = position;
    let parentheses = 0;
    while (position < limit) {
      const char = source[position];
      if (char === '\\' && ESCAPABLE.has(source[position + 1])) {
        position += 2;
        continue;
      }
      // eslint-disable-next-line no-control-regex
      if (/[\s\u0000-\u001f]/.test(char)) break;
      if (char === '(') parentheses++;
      else if (char === ')') {
        if (parentheses === 0) break;
        parentheses--;
      }
      position++;
    }
    if (parentheses !== 0) return null;
    raw = source.slice(from, position);
  }

  // An optional title, which the preview does not show.
  let afterSpace = position;
  while (afterSpace < limit && /[ \t\n]/.test(source[afterSpace])) afterSpace++;
  const opener = source[afterSpace];
  if (afterSpace > position && (opener === '"' || opener === "'" || opener === '(')) {
    const closer = opener === '(' ? ')' : opener;
    let titleEnd = afterSpace + 1;
    while (titleEnd < limit && source[titleEnd] !== closer) {
      if (source[titleEnd] === '\\') titleEnd++;
      titleEnd++;
    }
    if (titleEnd >= limit) return null;
    position = titleEnd + 1;
    while (position < limit && /[ \t\n]/.test(source[position])) position++;
  } else {
    position = afterSpace;
  }
  if (position >= limit || source[position] !== ')') return null;
  return { textFrom: index + 1, textTo, destination: decodeDestination(raw), end: position + 1 };
}

/** The page link token at `index`, if one ends before `end`. */
function pageLinkAt(source: string, index: number, end: number): RegExpExecArray | null {
  PAGE_LINK_AT.lastIndex = index;
  const match = PAGE_LINK_AT.exec(source);
  return match && index + match[0].length <= end ? match : null;
}

interface Context {
  /** Links and page link tokens (off inside a link's text: links do not nest). */
  links: boolean;
  /** `#tags` (off inside a link's text: a chip inside a link would be a link in a link). */
  tags: boolean;
}

interface EmphasisMatch {
  kind: 'em' | 'strong' | 'strongEm' | 'strike';
  innerFrom: number;
  innerTo: number;
  end: number;
}

// ── Parser ──────────────────────────────────────────────────────────────────────────────────

/** Parses `source[start, end)`. One instance per range: its caches assume that range. */
class RangeParser {
  private readonly links = new Map<number, LinkMatch | null>();
  /** Delimiter runs (`*1`, `_2`, `~2`…) known to have no closer after an earlier opener. */
  private readonly unclosed = new Set<string>();

  constructor(
    private readonly source: string,
    private readonly start: number,
    private readonly end: number,
    private readonly context: Context
  ) {}

  private link(index: number): LinkMatch | null {
    if (!this.links.has(index)) this.links.set(index, matchLink(this.source, index, this.end));
    return this.links.get(index)!;
  }

  /** Index past the page link token or link at `index`, or `index` when there is none. */
  private skipLink(index: number): number {
    const token = pageLinkAt(this.source, index, this.end);
    if (token) return index + token[0].length;
    return this.link(index)?.end ?? index;
  }

  /**
   * Emphasis or strikethrough opened by the delimiter run at `index`. A run opens when the next
   * character is not whitespace (and, for `_`, the previous one is not alphanumeric); it closes
   * at the first run of the same character that follows non-whitespace (for `_`, not followed
   * by an alphanumeric) and has a fitting length. Code spans and links in between are skipped
   * whole, so a delimiter inside them never closes the emphasis.
   */
  private emphasis(index: number): EmphasisMatch | null {
    const { source, end } = this;
    const char = source[index];
    const size = runLength(source, index, end, char);
    if (char === '~' ? size !== 2 : size > 3) return null;
    if (index + size >= end || isWhitespace(source[index + size])) return null;
    if (char === '_' && isAlphanumeric(source[index - 1])) return null;
    // A later opener of the same kind sees a subset of the closers an earlier one saw.
    const kind = `${char}${size}`;
    if (this.unclosed.has(kind)) return null;

    let cursor = index + size;
    while (cursor < end) {
      const current = source[cursor];
      if (current === '\\') {
        cursor += 2;
        continue;
      }
      if (current === '`') {
        cursor = skipCode(source, cursor, end);
        continue;
      }
      if (current === '[' && this.context.links) {
        const skipped = this.skipLink(cursor);
        if (skipped > cursor) {
          cursor = skipped;
          continue;
        }
      }
      if (current !== char) {
        cursor++;
        continue;
      }
      const run = runLength(source, cursor, end, char);
      const closes =
        cursor > index + size &&
        !isWhitespace(source[cursor - 1]) &&
        !(char === '_' && isAlphanumeric(source[cursor + run]));
      if (closes) {
        const after = cursor + run;
        if (char === '~') {
          if (run === 2)
            return { kind: 'strike', innerFrom: index + 2, innerTo: cursor, end: after };
        } else if (size === 1 && (run === 1 || run === 3)) {
          return { kind: 'em', innerFrom: index + 1, innerTo: after - 1, end: after };
        } else if (size === 2 && (run === 2 || run === 3)) {
          return { kind: 'strong', innerFrom: index + 2, innerTo: after - 2, end: after };
        } else if (size === 3 && run === 3) {
          return { kind: 'strongEm', innerFrom: index + 3, innerTo: cursor, end: after };
        }
      }
      cursor += run;
    }
    this.unclosed.add(kind);
    return null;
  }

  parse(): InlineNode[] {
    const { source, end, context } = this;
    const nodes: InlineNode[] = [];
    let textFrom = this.start;
    let index = this.start;

    const flush = (to: number) => {
      if (to > textFrom) {
        nodes.push({ type: 'text', text: source.slice(textFrom, to), from: textFrom });
      }
    };
    const emit = (node: InlineNode, from: number, to: number) => {
      flush(from);
      nodes.push(node);
      index = to;
      textFrom = to;
    };

    while (index < end) {
      const char = source[index];

      if (char === '\\' && index + 1 < end && ESCAPABLE.has(source[index + 1])) {
        // The backslash disappears; the escaped character starts the next run of plain text.
        flush(index);
        textFrom = index + 1;
        index += 2;
        continue;
      }

      if (char === '`') {
        const size = runLength(source, index, end, '`');
        const close = findCodeClose(source, index + size, end, size);
        if (close < 0) {
          index += size;
          continue;
        }
        let from = index + size;
        let text = source.slice(from, close).replace(/\n/g, ' ');
        if (text.length > 2 && text.startsWith(' ') && text.endsWith(' ') && text.trim()) {
          text = text.slice(1, -1);
          from++;
        }
        emit({ type: 'code', text, from }, index, close + size);
        continue;
      }

      if (char === '[' && context.links) {
        const token = pageLinkAt(source, index, end);
        if (token) {
          emit({ type: 'pageLink', pageId: Number(token[1]) }, index, index + token[0].length);
          continue;
        }
        const link = this.link(index);
        if (link && source[index - 1] === '!' && source[index - 2] !== '\\') {
          // An image: shown as written.
          index = link.end;
          continue;
        }
        if (link) {
          const children = new RangeParser(source, link.textFrom, link.textTo, {
            links: false,
            tags: false,
          }).parse();
          const href = isSafeUrl(link.destination) ? link.destination : null;
          emit({ type: 'link', href, children }, index, link.end);
          continue;
        }
      }

      if (char === '*' || char === '_' || char === '~') {
        const match = this.emphasis(index);
        if (match) {
          const children = new RangeParser(source, match.innerFrom, match.innerTo, context).parse();
          const node: InlineNode =
            match.kind === 'strongEm'
              ? { type: 'em', children: [{ type: 'strong', children }] }
              : { type: match.kind, children };
          emit(node, index, match.end);
          continue;
        }
        // `***` that does not close as a whole may still open `**` one character later.
        const size = runLength(source, index, end, char);
        index += size === 3 ? 1 : size;
        continue;
      }

      if (char === '#' && context.tags && isTagBoundary(source[index - 1])) {
        const tag = readTagName(source, index, end);
        if (tag) {
          emit({ type: 'tag', tag }, index, index + 1 + tag.length);
          continue;
        }
      }

      index++;
    }
    flush(end);
    return nodes;
  }
}

/** The inline nodes of one block's text. */
export function parseInlineMarkdown(text: string): InlineNode[] {
  return new RangeParser(text, 0, text.length, { links: true, tags: true }).parse();
}

/**
 * Whether `nodes` (parsed from `text`) show anything besides `text` itself: formatting, a link,
 * a chip, or an escape. Blocks without any keep their plain textarea.
 */
export function hasInlineMarkup(nodes: InlineNode[], text: string): boolean {
  if (nodes.length === 0) return false;
  return !(nodes.length === 1 && nodes[0].type === 'text' && nodes[0].text === text);
}
