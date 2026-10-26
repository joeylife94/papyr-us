/**
 * Markdown vault format (#113 P2-D2): the pieces the vault export and import share and that need
 * no database: file names, YAML frontmatter, and the link syntax at the boundary.
 *
 * Inside Papyr.us a link is an id token (`[[page:<id>]]`); in a vault it is an Obsidian
 * wikilink to a file name (`[[Name]]`, or `[[folder/Name]]` when names repeat). Code keeps its
 * text unchanged in both directions, like the reader does (fenced blocks and inline code spans).
 *
 * The frontmatter parser reads a small, safe YAML subset: `key: value` lines with plain, single-
 * or double-quoted scalars, `[a, b]` flow lists and `- item` block lists. Anything else is
 * skipped. It never evaluates tags, anchors, aliases or other YAML features.
 */
import { PAGE_LINK_PATTERN } from '../../shared/page-links.js';

/** Shown instead of a link whose target the exporting viewer cannot read (never its title). */
export const INACCESSIBLE_PAGE_LABEL = '접근할 수 없는 페이지';

/** File name used when a title has no characters left after sanitizing. */
export const UNTITLED_FILE_NAME = 'Untitled';

// Longest file name stem in UTF-8 bytes. With a " (99)" suffix and ".md" it stays well below the
// 255-byte limit of common file systems.
const MAX_FILE_NAME_BYTES = 150;
// Characters file systems or Obsidian links do not accept in a file name (`#^[]|` break links).
const FORBIDDEN_FILE_NAME_CHARACTERS = /[/\\:*?"<>|#^[\]\u0000-\u001f\u007f]+/g;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

/**
 * A portable file name stem (no extension) for `title`: characters that file systems or
 * Obsidian links reject are replaced, whitespace is collapsed, leading dots (hidden files) and
 * trailing dots or spaces are dropped, the length is capped, and `.`/`..`/reserved device names
 * cannot result.
 */
export function sanitizeFileName(title: string): string {
  let name = String(title ?? '')
    .normalize('NFC')
    .replace(FORBIDDEN_FILE_NAME_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  name = truncateUtf8(name, MAX_FILE_NAME_BYTES)
    .replace(/[. ]+$/, '')
    .trim();
  if (!name) return UNTITLED_FILE_NAME;
  if (WINDOWS_RESERVED_NAME.test(name)) return `${name}_`;
  return name;
}

/**
 * Assigns unique names within one folder, case-insensitively (`Note`, `note (2)`, `Note (3)`).
 */
export class FolderNames {
  private readonly used = new Map<string, Set<string>>();

  claim(folder: string, name: string): string {
    const taken = this.used.get(folder) ?? new Set<string>();
    this.used.set(folder, taken);
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${name} (${n})`;
    taken.add(candidate.toLowerCase());
    return candidate;
  }
}

// ---- Frontmatter ----

export type FrontmatterValue = string | string[];

function quoteYaml(value: string): string {
  const escaped = value.replace(/[\\"\u0000-\u001f\u007f\u2028\u2029]/g, (character) => {
    switch (character) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default:
        return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
    }
  });
  return `"${escaped}"`;
}

/** A frontmatter block (`---` fences, trailing newline) with every scalar double-quoted. */
export function serializeFrontmatter(fields: Array<[string, FrontmatterValue]>): string {
  const lines = ['---'];
  for (const [key, value] of fields) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${quoteYaml(item)}`);
      }
    } else {
      lines.push(`${key}: ${quoteYaml(value)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function unquoteDouble(body: string): string {
  return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_match, escape: string) => {
    switch (escape[0]) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case '0':
        return '';
      case 'u':
      case 'x': {
        const code = Number.parseInt(escape.slice(1), 16);
        // Control characters stay out of titles and tags.
        return code < 0x20 || code === 0x7f ? '' : String.fromCharCode(code);
      }
      default:
        return escape;
    }
  });
}

/** One scalar: quoted (with its closing quote) or plain (up to a ` #` comment). */
function parseScalar(raw: string): string | null {
  const text = raw.trim();
  if (text.startsWith('"')) {
    const match = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(text);
    return match ? unquoteDouble(match[1]) : null;
  }
  if (text.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(text);
    return match ? match[1].replace(/''/g, "'") : null;
  }
  // Block scalars, anchors, aliases and tags are not part of the subset.
  if (/^[|>&*!]/.test(text)) return null;
  return stripComment(text).trim();
}

/**
 * `text` without a trailing comment (a `#` after whitespace). One linear search: a pattern like
 * `\s+#.*$` backtracks quadratically on long runs of spaces in untrusted files.
 */
function stripComment(text: string): string {
  const comment = /\s#/.exec(text);
  return comment ? text.slice(0, comment.index) : text;
}

/** Items of a `[a, "b, c", 'd']` flow list. */
function parseFlowList(raw: string): string[] | null {
  const inner = raw.trim().slice(1, -1);
  const items: string[] = [];
  let at = 0;
  while (at < inner.length) {
    while (at < inner.length && /[\s,]/.test(inner[at])) at += 1;
    if (at >= inner.length) break;
    let end: number;
    if (inner[at] === '"' || inner[at] === "'") {
      const quote = inner[at];
      end = at + 1;
      while (end < inner.length) {
        if (quote === '"' && inner[end] === '\\') end += 2;
        else if (inner[end] === quote && quote === "'" && inner[end + 1] === "'") end += 2;
        else if (inner[end] === quote) break;
        else end += 1;
      }
      end += 1;
    } else {
      end = inner.indexOf(',', at);
      if (end < 0) end = inner.length;
    }
    const value = parseScalar(inner.slice(at, end));
    if (value === null) return null;
    if (value) items.push(value);
    at = end;
  }
  return items;
}

const FRONTMATTER_KEY = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/;
const MAX_FRONTMATTER_LINE = 4096;
const BLOCK_LIST_ITEM = /^\s*-\s+(.*)$/;

/**
 * Splits a Markdown file into its frontmatter fields and body. Without a well-formed block
 * (`---` on the first line and a closing `---` or `...` line) the whole text is the body.
 */
export function parseFrontmatter(text: string): {
  data: Record<string, FrontmatterValue>;
  body: string;
} {
  const source = text.replace(/^\uFEFF/, '');
  // `Object.create(null)` keeps keys such as `__proto__` plain data.
  const fields: Record<string, FrontmatterValue> = Object.create(null);
  const opening = /^---[ \t]*\r?\n/.exec(source);
  if (!opening) return { data: fields, body: source };
  const closing = /^(?:---|\.\.\.)[ \t]*$/m;
  const rest = source.slice(opening[0].length);
  const close = closing.exec(rest);
  if (!close) return { data: fields, body: source };

  const lines = rest.slice(0, close.index).split(/\r?\n/);
  const body = rest.slice(close.index + close[0].length).replace(/^\r?\n/, '');
  let listKey: string | null = null;
  for (const line of lines) {
    // No frontmatter field we read needs a long line; skipping them bounds the parser's work.
    if (line.length > MAX_FRONTMATTER_LINE) continue;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const item = listKey !== null ? BLOCK_LIST_ITEM.exec(line) : null;
    if (item && listKey !== null) {
      const value = parseScalar(item[1]);
      if (value) (fields[listKey] as string[]).push(value);
      continue;
    }
    listKey = null;
    if (/^\s/.test(line)) continue; // nested structures are not part of the subset
    const field = FRONTMATTER_KEY.exec(line);
    if (!field) continue;
    const [, key, raw = ''] = field;
    const value = raw.trim();
    if (!value) {
      fields[key] = [];
      listKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const list = parseFlowList(value);
      if (list) fields[key] = list;
    } else {
      const scalar = parseScalar(value);
      if (scalar !== null) fields[key] = scalar;
    }
  }
  return { data: fields, body };
}

const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 100;

/** Tags from a frontmatter value: a list or a comma/space separated string, without `#`. */
export function normalizeTags(value: FrontmatterValue | undefined): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = String(item).replace(/^#+/, '').trim().slice(0, MAX_TAG_LENGTH);
    if (!tag || /[\u0000-\u001f\u007f]/.test(tag) || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

// ---- Code-aware text transforms ----

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/**
 * `text` with `transform` applied to everything outside fenced code blocks and inline code
 * spans, which are kept as they are.
 */
export function mapOutsideCode(text: string, transform: (prose: string) => string): string {
  const lines = text.split(/(?<=\n)/);
  let output = '';
  let prose = '';
  let fence: { marker: string; length: number } | null = null;
  const flush = () => {
    // Code spans never run past a blank line, so each paragraph is scanned on its own.
    for (const paragraph of prose.split(/(?<=\n[ \t]*\n)/)) {
      output += mapOutsideInlineCode(paragraph, transform);
    }
    prose = '';
  };
  for (const line of lines) {
    if (fence) {
      output += line;
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?\n?$/.exec(line);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open && !(open[1][0] === '`' && line.slice(open[0].length).includes('`'))) {
      flush();
      fence = { marker: open[1][0], length: open[1].length };
      output += line;
      continue;
    }
    prose += line;
  }
  flush();
  return output;
}

function mapOutsideInlineCode(text: string, transform: (prose: string) => string): string {
  // A code span closes at the next run of exactly as many backticks. Index every run once, with
  // the next run of the same length, so unmatched runs cost nothing extra (linear overall).
  const runs: Array<{ start: number; length: number }> = [];
  for (let at = text.indexOf('`'); at >= 0; ) {
    let length = 1;
    while (text[at + length] === '`') length += 1;
    runs.push({ start: at, length });
    at = text.indexOf('`', at + length);
  }
  const nextSameLength = new Array<number>(runs.length).fill(-1);
  const latest = new Map<number, number>();
  for (let k = runs.length - 1; k >= 0; k -= 1) {
    nextSameLength[k] = latest.get(runs[k].length) ?? -1;
    latest.set(runs[k].length, k);
  }

  let output = '';
  let last = 0;
  for (let k = 0; k < runs.length; k += 1) {
    const closeAt = nextSameLength[k];
    if (closeAt < 0) continue; // unmatched backticks are literal text
    const open = runs[k];
    const end = runs[closeAt].start + runs[closeAt].length;
    output += transform(text.slice(last, open.start)) + text.slice(open.start, end);
    last = end;
    k = closeAt;
  }
  return output + transform(text.slice(last));
}

// ---- Links at the boundary ----

/** `text` with every page link token outside code replaced by `render(pageId)`. */
export function renderPageLinkTokens(text: string, render: (pageId: number) => string): string {
  return mapOutsideCode(text, (prose) =>
    prose.replace(new RegExp(PAGE_LINK_PATTERN.source, 'g'), (_token, id: string) =>
      render(Number(id))
    )
  );
}

/** The ids of page link tokens outside code, in first-appearance order. */
export function pageLinkTokenIds(text: string): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  renderPageLinkTokens(text, (id) => {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    return '';
  });
  return ids;
}

/** A wikilink as written: `[[target#heading|alias]]`. */
export interface WikiLink {
  /** The note the link points to: a name or a `/`-separated path, without `.md` or heading. */
  target: string;
  heading: string | null;
  alias: string | null;
}

// `[[...]]` without brackets or line breaks inside; `![[...]]` embeds are matched to be skipped.
const WIKI_LINK = /(!?)\[\[([^[\]\n]+)\]\]/g;

/** Parses the inside of `[[...]]`; the escaped pipe `\|` (used in tables) also starts an alias. */
export function parseWikiLink(inner: string): WikiLink {
  const pipe = inner.indexOf('|');
  let reference = pipe >= 0 ? inner.slice(0, pipe) : inner;
  const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() || null : null;
  reference = reference.replace(/\\$/, '');
  const hash = reference.indexOf('#');
  const heading =
    hash >= 0
      ? reference
          .slice(hash + 1)
          .replace(/^\^/, '')
          .trim() || null
      : null;
  const target = (hash >= 0 ? reference.slice(0, hash) : reference)
    .trim()
    .replace(/\.md$/i, '')
    .replace(/^\.?\//, '');
  return { target, heading, alias };
}

/**
 * `text` with every wikilink outside code replaced by `replace(link)`. Embeds (`![[...]]`) are
 * left as written: transclusion is not supported yet.
 */
export function replaceWikiLinks(text: string, replace: (link: WikiLink) => string): string {
  return mapOutsideCode(text, (prose) =>
    prose.replace(WIKI_LINK, (whole, bang: string, inner: string) =>
      bang ? whole : replace(parseWikiLink(inner))
    )
  );
}

/** The text an unresolved wikilink leaves behind: its alias, else the note name it names. */
export function wikiLinkText(link: WikiLink): string {
  if (link.alias) return link.alias;
  const name = link.target.split('/').pop() ?? '';
  return name || link.heading || '';
}
