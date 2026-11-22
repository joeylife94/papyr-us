/**
 * Blocks ⇄ Markdown (issue #113 §1, decision P2-D1).
 *
 * Pages are edited as blocks and read as Markdown: `content` (reader, table of contents, FTS, AI,
 * export) is `blocksToMarkdown(blocks)`, computed by the same code on the server (save pipeline)
 * and in the browser (live table of contents while editing). `markdownToBlocks` is the inverse,
 * so content-only pages (API, templates, imports) open in the editor as real blocks.
 *
 * Blocks → Markdown:
 * - `heading1`–`heading3`: `#`, `##`, `###`. A Markdown heading is one line, so line breaks in
 *   the text become single spaces (and the text is trimmed). Text that already starts with
 *   heading marks (`## Title`) is kept as typed, as on main since #123.
 * - `bulleted_list`: `- `; `numbered_list`: `1. `, `2. ` … counting each run of consecutive
 *   items from 1, like the editor; `checkbox`: `- [ ] ` / `- [x] ` (`properties.checked`).
 *   Continuation lines are indented to the item's content column, so a multi-line item stays
 *   one item. A bulleted run right after a to-do run (or the reverse) uses `*` instead of `-`:
 *   Markdown would otherwise merge the two into one loose list.
 * - `quote`: `> ` on every line (`>` on empty ones).
 * - `code`: a fenced block with `properties.language`. The fence is longer than any backtick run
 *   in the code, so the code can never close it.
 * - `divider`: `---`.
 * - `page_embed` (#135): the embed token `![[page:<id>]]` of `properties.pageId`, and nothing
 *   else: the target's text is never part of this page's content (decision P3-D2). A block
 *   without a valid page id derives nothing.
 * - `paragraph` and every other type: its text unchanged.
 * - An empty heading or code block derives nothing (#123); an empty list item, to-do or quote
 *   keeps its bare marker (`-`, `- [ ]`, `>`).
 *
 * Blocks are joined by a blank line, except consecutive items of the same list type, which are
 * joined by one newline so Markdown sees one list. A page made only of paragraphs (and other
 * text-only types) therefore derives exactly the legacy `content` (texts joined by blank lines).
 *
 * Markdown → blocks understands those constructs (ATX headings, deeper levels as `heading3`, and
 * setext headings; `-`/`*`/`+` and ordered lists; `- [ ]`/`- [x]` tasks; `>` quotes, lazy lines
 * included; fenced code with its language; `---`/`***`/`___` dividers; a line holding only an
 * embed token, which also ends a paragraph, as the reader shows it). Everything else becomes
 * paragraphs split on blank lines, with their text verbatim, so constructs the editor has no
 * block for (tables, HTML, indented code, math) still render the same after the next save.
 * Inline Markdown and page link tokens (`[[page:<id>]]`) are never touched. Nested list items
 * and `<details>` toggles become nested blocks (see below); continuation lines and lazy lines
 * of an item stay in its text.
 *
 * Nesting (shared/block-tree.ts: a flat list with an `indent` per block):
 * - A list item or to-do nested under a list item is a nested Markdown list item, written at the
 *   parent's content column (2 spaces per level under `-` items and to-dos, wider under numbered
 *   items, so every Markdown reader nests them). Numbered lists count per level.
 * - A `toggle` is `<details>` with a `<summary>` line holding its text (`&`, `<` and `>`
 *   escaped, line breaks as spaces), the blocks under it, and `</details>`. The reader draws it
 *   as a disclosure (client/src/lib/markdown.ts); other Markdown tools show their own.
 *   `<details>` that is not exactly this shape stays text, as before.
 * - Import reads both back: nested list items get their level, blocks inside `<details>` the
 *   toggle's depth plus their own list level. The round trip is exact for lists and to-dos
 *   nested under lists or toggles and for toggles nested in toggles. Any other nested block (a
 *   paragraph under a list item, a list under a paragraph) is written without its nesting, in
 *   order, and comes back at the depth of the enclosing toggles.
 *
 * Text that already looks like Markdown syntax is not escaped: a paragraph that starts with
 * `# ` reads as a heading, exactly as it did before blocks had their own Markdown.
 *
 * Pure: no DOM and no Node-only APIs (imported by the server and the client).
 */
import type { Block, BlockType } from './schema.js';
import { blockIndent, listNumbers, normalizeBlockTree } from './block-tree.js';
import { embedLinePageId, pageEmbedToken } from './page-embeds.js';
import { isPageId } from './page-links.js';

/** Block types whose consecutive items form one Markdown list. */
const LIST_TYPES: ReadonlySet<string> = new Set(['bulleted_list', 'numbered_list', 'checkbox']);

interface BlockLike {
  type?: unknown;
  content?: unknown;
  properties?: unknown;
}

function blockText(block: unknown): string {
  const content = block && typeof block === 'object' ? (block as BlockLike).content : undefined;
  return typeof content === 'string' ? content : '';
}

function blockType(block: unknown): string | undefined {
  const type = block && typeof block === 'object' ? (block as BlockLike).type : undefined;
  return typeof type === 'string' ? type : undefined;
}

function blockProperties(block: unknown): Record<string, unknown> {
  const properties =
    block && typeof block === 'object' ? (block as BlockLike).properties : undefined;
  return properties && typeof properties === 'object'
    ? (properties as Record<string, unknown>)
    : {};
}

function headingMarkdown(level: number, text: string): string {
  const line = text
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');
  if (!line) return '';
  // Text that already carries Markdown heading marks is kept as typed.
  return /^#{1,6}\s/.test(line) ? line : `${'#'.repeat(level)} ${line}`;
}

/** A list item: the marker on the first line, the following lines indented by `indent`. */
function listItemMarkdown(marker: string, indent: number, text: string): string {
  const [first, ...rest] = text.split('\n');
  const pad = ' '.repeat(indent);
  return [
    first ? `${marker} ${first}` : marker,
    ...rest.map((line) => (line ? pad + line : '')),
  ].join('\n');
}

/** The code block's language as a fence info word (one token, no backticks), or ''. */
function fenceLanguage(language: unknown): string {
  if (typeof language !== 'string') return '';
  return (language.trim().split(/\s+/)[0] ?? '').replace(/`/g, '');
}

function codeMarkdown(text: string, language: unknown): string {
  if (!text.trim()) return '';
  const longestRun = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}${fenceLanguage(language)}\n${text}\n${fence}`;
}

/** The embed token of a `page_embed` block, or '' without a valid page id. */
function pageEmbedMarkdown(pageId: unknown): string {
  const id =
    typeof pageId === 'number'
      ? pageId
      : typeof pageId === 'string' && /^\d{1,10}$/.test(pageId)
        ? Number(pageId)
        : NaN;
  return isPageId(id) ? pageEmbedToken(id) : '';
}

/** Bullet-style lists: a bulleted run next to a to-do run needs another marker to stay apart. */
const BULLET_TYPES: ReadonlySet<string> = new Set(['bulleted_list', 'checkbox']);

function blockMarkdown(block: unknown, listNumber: number, bullet: '-' | '*'): string {
  const text = blockText(block);
  switch (blockType(block)) {
    case 'heading1':
      return headingMarkdown(1, text);
    case 'heading2':
      return headingMarkdown(2, text);
    case 'heading3':
      return headingMarkdown(3, text);
    case 'bulleted_list':
      return listItemMarkdown(bullet, 2, text);
    case 'numbered_list':
      return listItemMarkdown(`${listNumber}.`, `${listNumber}. `.length, text);
    case 'checkbox':
      // The to-do marker is part of the item's text; continuation lines align with `- `.
      return listItemMarkdown(`${bullet} [${blockProperties(block).checked ? 'x' : ' '}]`, 2, text);
    case 'toggle':
      return toggleOpening(text);
    case 'quote':
      return text
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'code':
      return codeMarkdown(text, blockProperties(block).language);
    case 'divider':
      return '---';
    case 'page_embed':
      return pageEmbedMarkdown(blockProperties(block).pageId);
    default:
      return text;
  }
}

/** The summary's text on one line, with the characters HTML reads as markup written as entities. */
function escapeSummary(text: string): string {
  return text
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The inverse of `escapeSummary` for the three entities it writes (others stay as written). */
function unescapeSummary(text: string): string {
  return text.replace(/&(amp|lt|gt);/g, (_match, name: string) =>
    name === 'amp' ? '&' : name === 'lt' ? '<' : '>'
  );
}

function toggleOpening(text: string): string {
  return `<details>\n<summary>${escapeSummary(text)}</summary>`;
}

const DETAILS_CLOSING = '</details>';

/** Where each block's Markdown starts and ends in the joined document (`end` exclusive). */
export interface BlockMarkdownRange {
  start: number;
  end: number;
}

/** Spaces a nested list item is written with: the content columns of its list ancestors. */
function indentLines(markdown: string, columns: number): string {
  if (columns === 0) return markdown;
  const pad = ' '.repeat(columns);
  return markdown
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n');
}

/**
 * `blocksToMarkdown`, plus each block's range in the result, so a position in `content` (a
 * heading found by the table of contents) can be mapped back to its block. The `</details>`
 * lines closing toggles lie between blocks, in no block's range.
 */
export function blocksToMarkdownWithRanges(blocks: unknown): {
  markdown: string;
  ranges: BlockMarkdownRange[];
} {
  let markdown = '';
  const ranges: BlockMarkdownRange[] = [];
  if (!Array.isArray(blocks)) return { markdown, ranges };
  const list = normalizeBlockTree(blocks);
  const numbers = listNumbers(list);
  // Per level, for the blocks above the current one: the type of the latest block, the bullet
  // its list uses, and the column where list items nested under it start.
  const typeAt: Array<string | undefined> = [];
  const bulletAt: Array<'-' | '*' | undefined> = [];
  const childColumn: number[] = [];
  const openToggles: number[] = [];
  let previousType: string | undefined;
  let previousIndent = 0;

  list.forEach((block, index) => {
    const type = blockType(block);
    const indent = blockIndent(block);
    const isList = type !== undefined && LIST_TYPES.has(type);

    // Toggles at this level or deeper end before this block.
    let closers = 0;
    while (openToggles.length > 0 && openToggles[openToggles.length - 1] >= indent) {
      openToggles.pop();
      closers++;
    }

    const sameTypeAsLevel = isList && typeAt[indent] === type;
    const previousIsList = previousType !== undefined && LIST_TYPES.has(previousType);
    const continuesList =
      index > 0 &&
      closers === 0 &&
      isList &&
      previousIsList &&
      (indent > previousIndent || sameTypeAsLevel);

    let bullet: '-' | '*' = bulletAt[indent] ?? '-';
    if (isList && !sameTypeAsLevel) {
      const followsOtherBullets =
        BULLET_TYPES.has(type) && typeAt[indent] !== undefined && BULLET_TYPES.has(typeAt[indent]!);
      bullet = followsOtherBullets && bulletAt[indent] === '-' ? '*' : '-';
    }

    const column = isList && indent > 0 ? (childColumn[indent - 1] ?? 0) : 0;
    typeAt.length = indent + 1;
    bulletAt.length = indent + 1;
    childColumn.length = indent + 1;
    typeAt[indent] = type;
    bulletAt[indent] = isList ? bullet : undefined;
    childColumn[indent] = isList
      ? column + (type === 'numbered_list' ? `${numbers[index]}. `.length : 2)
      : 0;

    for (let close = 0; close < closers; close++) {
      markdown += `${index > 0 || markdown ? '\n\n' : ''}${DETAILS_CLOSING}`;
    }
    if (index > 0) markdown += continuesList ? '\n' : '\n\n';
    const start = markdown.length;
    markdown += indentLines(blockMarkdown(block, numbers[index], bullet), column);
    ranges.push({ start, end: markdown.length });
    if (type === 'toggle') openToggles.push(indent);
    previousType = type;
    previousIndent = indent;
  });
  for (let close = 0; close < openToggles.length; close++) {
    markdown += `\n\n${DETAILS_CLOSING}`;
  }
  return { markdown, ranges };
}

/** The Markdown `content` of a block list (see the module comment for the mapping). */
export function blocksToMarkdown(blocks: unknown): string {
  return blocksToMarkdownWithRanges(blocks).markdown;
}

// ---------------------------------------------------------------------------------------------
// Markdown → blocks

/**
 * A leading YAML frontmatter block: `---` on the first line, a non-blank second line, and a
 * closing `---` or `...` line. Requiring the non-blank second line keeps a document that starts
 * with a divider (always followed by a blank line in derived content) from being read as one.
 * Returns the index of the closing line, or -1.
 */
function frontmatterEnd(lines: readonly string[]): number {
  if (lines.length < 3 || !/^---[ \t]*$/.test(lines[0].replace(/^\uFEFF/, ''))) return -1;
  if (lines[1].trim() === '') return -1;
  for (let index = 1; index < lines.length; index++) {
    if (/^(---|\.\.\.)[ \t]*$/.test(lines[index])) return index;
  }
  return -1;
}

function splitLines(markdown: string): string[] {
  return markdown.replace(/\r\n?/g, '\n').split('\n');
}

/**
 * Split a leading YAML frontmatter block (see `frontmatterEnd`) from the body. `frontmatter` is
 * the raw text between the delimiters (not parsed), or null when there is none; `body` is the
 * rest of the document.
 */
export function splitFrontmatter(markdown: string): { frontmatter: string | null; body: string } {
  const lines = splitLines(markdown);
  const end = frontmatterEnd(lines);
  if (end < 0) return { frontmatter: null, body: markdown };
  return {
    frontmatter: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
  };
}

type ParsedBlock = {
  type: BlockType;
  content: string;
  properties: Record<string, unknown>;
  /** Depth in the flat list (shared/block-tree.ts); absent means the depth of the open toggles. */
  indent?: number;
};

const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const QUOTE_LINE = /^ {0,3}> ?(.*)$/;
const BULLET_ITEM = /^( {0,3})([-*+])(?:([ \t]+)(.*))?$/;
const ORDERED_ITEM = /^( {0,3})(\d{1,9})([.)])(?:([ \t]+)(.*))?$/;
const TASK_PREFIX = /^\[([ xX])\](?:[ \t]+(.*))?$/;

const DETAILS_OPEN =
  /^ {0,3}<details(?:[ \t]+open)?[ \t]*>[ \t]*(?:<summary>([^<]*)<\/summary>[ \t]*)?$/i;
const SUMMARY_LINE = /^ {0,3}<summary>([^<]*)<\/summary>[ \t]*$/i;
const DETAILS_CLOSE = /^ {0,3}<\/details>[ \t]*$/i;

const isBlank = (line: string) => line.trim() === '';
const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * A paragraph's lines as blocks: each line holding only an embed token becomes a `page_embed`
 * block (#135) and the text around it paragraphs, as the reader splits it. Continuation lines
 * count whatever their indentation (Markdown drops it); the first line only with up to three
 * spaces (four make it code). A hard break ending the line is only a line break: trailing spaces
 * (always allowed), or a backslash on any line but the paragraph's last (where it is text).
 */
function paragraphBlocks(lines: readonly string[]): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 0) blocks.push({ type: 'paragraph', content: run.join('\n'), properties: {} });
    run = [];
  };
  lines.forEach((line, index) => {
    // A line ending in one backslash (not an escaped one) before another line: a hard break.
    const unbroken =
      index < lines.length - 1 && /(?:^|[^\\])\\$/.test(line) ? line.slice(0, -1) : line;
    const id = embedLinePageId(unbroken, { continuation: index > 0 });
    if (id === null) {
      run.push(line);
      return;
    }
    // The break before the embed ends that paragraph now; as its last line it would be text.
    if (run.length > 0) {
      const last = run[run.length - 1];
      if (/(?:^|[^\\])\\$/.test(last)) run[run.length - 1] = last.slice(0, -1);
    }
    flush();
    blocks.push({ type: 'page_embed', content: '', properties: { pageId: id } });
  });
  flush();
  return blocks;
}

interface ListStart {
  type: 'bulleted_list' | 'numbered_list' | 'checkbox';
  checked: boolean;
  first: string;
  /** Column where the item's text starts; continuation lines indented this far belong to it. */
  contentIndent: number;
  /** The ordered list number as written (only `1` may interrupt a paragraph). */
  number: number;
}

function listStart(line: string): ListStart | null {
  const bullet = BULLET_ITEM.exec(line);
  const ordered = bullet ? null : ORDERED_ITEM.exec(line);
  const match = bullet ?? ordered;
  if (!match) return null;
  const markerEnd = bullet
    ? bullet[1].length + 1
    : ordered![1].length + ordered![2].length + ordered![3].length;
  const spaces = (bullet ? bullet[3] : ordered![4]) ?? '';
  const rest = (bullet ? bullet[4] : ordered![5]) ?? '';
  // More than four spaces after the marker: the text starts one space after it.
  const contentIndent = markerEnd + (spaces.length >= 1 && spaces.length <= 4 ? spaces.length : 1);
  const first = spaces.length > 4 ? line.slice(markerEnd + 1) : rest;
  if (bullet) {
    const task = TASK_PREFIX.exec(first);
    if (task) {
      return {
        type: 'checkbox',
        checked: task[1] !== ' ',
        first: task[2] ?? '',
        contentIndent,
        number: 0,
      };
    }
    return { type: 'bulleted_list', checked: false, first, contentIndent, number: 0 };
  }
  return {
    type: 'numbered_list',
    checked: false,
    first,
    contentIndent,
    number: Number(ordered![2]),
  };
}

function fenceOpen(line: string): { indent: number; fence: string; language: string } | null {
  const match = FENCE_OPEN.exec(line);
  if (!match) return null;
  // A backtick fence's info string cannot hold a backtick (that is inline code).
  if (match[2][0] === '`' && match[3].includes('`')) return null;
  return {
    indent: match[1].length,
    fence: match[2],
    language: match[3].trim().split(/\s+/)[0] ?? '',
  };
}

/** Lines that start a new block even right after a paragraph line. */
function interruptsParagraph(line: string): boolean {
  if (ATX_HEADING.test(line) || THEMATIC_BREAK.test(line) || QUOTE_LINE.test(line)) return true;
  if (fenceOpen(line)) return true;
  const item = listStart(line);
  // An empty item, or an ordered list not starting at 1, cannot interrupt a paragraph.
  return !!item && item.first.trim() !== '' && (item.type !== 'numbered_list' || item.number === 1);
}

/** Lines that start a new block anywhere (so they are never lazy continuation lines). */
function startsBlock(line: string): boolean {
  return (
    ATX_HEADING.test(line) ||
    THEMATIC_BREAK.test(line) ||
    QUOTE_LINE.test(line) ||
    !!fenceOpen(line) ||
    !!listStart(line) ||
    DETAILS_OPEN.test(line) ||
    DETAILS_CLOSE.test(line)
  );
}

/**
 * A toggle's opening at `index`: `<details>` with its `<summary>` on the same line or the next
 * (the shape `blocksToMarkdown` writes). Null for any other `<details>` line, which stays text.
 */
function detailsOpening(
  lines: readonly string[],
  index: number
): { summary: string; lines: number } | null {
  const open = DETAILS_OPEN.exec(lines[index]);
  if (!open) return null;
  if (open[1] !== undefined) return { summary: unescapeSummary(open[1]), lines: 1 };
  const next = index + 1 < lines.length ? SUMMARY_LINE.exec(lines[index + 1]) : null;
  return next ? { summary: unescapeSummary(next[1]), lines: 2 } : null;
}

/** Leading tabs count as four columns, so lists indented with tabs nest like the ones with spaces. */
function expandLeadingTabs(line: string): string {
  return line.replace(/^\t+/, (tabs) => ' '.repeat(tabs.length * 4));
}

interface OpenItem {
  start: ListStart;
  markerColumn: number;
  contentIndent: number;
  text: string[];
  level: number;
  /** A fenced code block inside the item's text is open: its lines are text, never items. */
  fence: RegExp | null;
}

/** The list item a line starts at any indentation (nesting), or null. */
function itemAt(line: string): { start: ListStart; column: number } | null {
  const column = indentOf(line);
  const rest = line.slice(column);
  if (THEMATIC_BREAK.test(rest)) return null;
  const start = listStart(rest);
  return start
    ? { start: { ...start, contentIndent: start.contentIndent + column }, column }
    : null;
}

/**
 * A run of list items from `from`, nested items included: each item becomes a block whose indent
 * is `depth` (the open toggles) plus its list level. An item is nested under the previous item
 * when it starts at least two columns after that item's marker. Continuation lines indented to an
 * item's content, lazy lines and blank lines inside an item stay in its text, as before nesting.
 * Returns the index after the run.
 */
function parseListRun(
  lines: readonly string[],
  from: number,
  depth: number,
  emit: (block: ParsedBlock) => void
): number {
  const stack: OpenItem[] = [];
  const open: { current: OpenItem | null } = { current: null };
  const flush = () => {
    const item = open.current;
    if (!item) return;
    emit({
      type: item.start.type,
      content: item.text.join('\n'),
      properties: item.start.type === 'checkbox' ? { checked: item.start.checked } : {},
      indent: depth + item.level,
    });
  };
  const begin = (start: ListStart, column: number) => {
    flush();
    while (stack.length > 0 && column < stack[stack.length - 1].markerColumn + 2) stack.pop();
    const created: OpenItem = {
      start,
      markerColumn: column,
      contentIndent: start.contentIndent,
      text: [start.first],
      level: stack.length,
      fence: null,
    };
    open.current = created;
    stack.push(created);
  };

  const firstLine = expandLeadingTabs(lines[from]);
  const first = itemAt(firstLine);
  if (!first) return from + 1;
  begin(first.start, first.column);
  let index = from + 1;
  while (index < lines.length) {
    const item = open.current as OpenItem;
    const line = expandLeadingTabs(lines[index]);
    if (isBlank(line)) {
      // Blank lines belong to the item only when it continues after them; the next item of the
      // list (loose lists) is not text.
      let next = index;
      while (next < lines.length && isBlank(lines[next])) next++;
      if (next >= lines.length) break;
      const following = expandLeadingTabs(lines[next]);
      if (!item.fence && itemAt(following)) {
        index = next;
        continue;
      }
      // Text indented to any open item's content stays in the list (as text of the latest item).
      if (indentOf(following) < stack[0].contentIndent) break;
      for (; index < next; index++) item.text.push('');
      continue;
    }
    if (item.fence) {
      if (indentOf(line) >= item.contentIndent) {
        const piece = line.slice(item.contentIndent);
        const closer = item.fence.test(piece);
        item.text.push(piece);
        if (closer) item.fence = null;
        index++;
        continue;
      }
      item.fence = null;
    }
    const next = itemAt(line);
    if (next) {
      begin(next.start, next.column);
      index++;
      continue;
    }
    if (indentOf(line) >= stack[0].contentIndent) {
      const piece = line.slice(Math.min(item.contentIndent, indentOf(line)));
      const fence = fenceOpen(piece);
      if (fence) {
        // The line that closes it: the same character, at least as many times.
        item.fence = new RegExp(`^ {0,3}${fence.fence[0]}{${fence.fence.length},}[ \\t]*$`);
      }
      item.text.push(piece);
    } else if (!isBlank(item.text[item.text.length - 1]) && !startsBlock(line)) {
      // A lazy line continues the item's paragraph.
      item.text.push(line.trimStart());
    } else {
      break;
    }
    index++;
  }
  flush();
  return index;
}

/**
 * An ATX heading's text without its optional closing sequence (`## Title ##`). The `#` run only
 * closes the heading after whitespace, so `C#` keeps its `#`. Done without a backtracking regex,
 * so a long heading line stays linear.
 */
function atxHeadingText(raw: string): string {
  const text = raw.trimEnd();
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  if (end === text.length) return text.trim();
  if (end === 0) return '';
  const before = text[end - 1];
  return before === ' ' || before === '\t' ? text.slice(0, end).trim() : text.trim();
}

function headingLevelType(hashes: number): BlockType {
  return hashes === 1 ? 'heading1' : hashes === 2 ? 'heading2' : 'heading3';
}

function parseMarkdown(lines: readonly string[], from: number): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let index = from;
  // Toggles (`<details>`) open at this point: blocks inside are indented by their number.
  let depth = 0;
  const emit = (block: ParsedBlock) => {
    blocks.push({ ...block, indent: block.indent ?? depth });
  };

  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line)) {
      index++;
      continue;
    }

    const fence = fenceOpen(line);
    if (fence) {
      const close = new RegExp(
        `^ {0,3}${fence.fence[0] === '`' ? '`' : '~'}{${fence.fence.length},}[ \\t]*$`
      );
      const code: string[] = [];
      index++;
      while (index < lines.length && !close.test(lines[index])) {
        // Content lines lose at most the opening fence's indentation.
        const current = lines[index];
        code.push(current.slice(Math.min(fence.indent, indentOf(current))));
        index++;
      }
      index++; // the closing fence (or the end of the document)
      emit({
        type: 'code',
        content: code.join('\n'),
        properties: fence.language ? { language: fence.language } : {},
      });
      continue;
    }

    const opening = detailsOpening(lines, index);
    if (opening) {
      emit({ type: 'toggle', content: opening.summary, properties: {} });
      depth++;
      index += opening.lines;
      continue;
    }
    if (depth > 0 && DETAILS_CLOSE.test(line)) {
      depth--;
      index++;
      continue;
    }

    const heading = ATX_HEADING.exec(line);
    if (heading) {
      emit({
        type: headingLevelType(heading[1].length),
        content: atxHeadingText(heading[2] ?? ''),
        properties: {},
      });
      index++;
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      emit({ type: 'divider', content: '', properties: {} });
      index++;
      continue;
    }

    if (QUOTE_LINE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const current = lines[index];
        const quote = QUOTE_LINE.exec(current);
        if (quote) {
          quoted.push(quote[1]);
        } else if (
          // A lazy line continues the quote's paragraph.
          !isBlank(current) &&
          quoted.length > 0 &&
          !isBlank(quoted[quoted.length - 1]) &&
          !startsBlock(current)
        ) {
          quoted.push(current.trimStart());
        } else {
          break;
        }
        index++;
      }
      emit({ type: 'quote', content: quoted.join('\n'), properties: {} });
      continue;
    }

    if (listStart(line)) {
      index = parseListRun(lines, index, depth, emit);
      continue;
    }

    // A paragraph: verbatim lines up to a blank line, a block that interrupts it, or a setext
    // underline (which makes it a heading).
    const paragraph = [line];
    index++;
    let setextLevel = 0;
    while (index < lines.length && !isBlank(lines[index])) {
      const current = lines[index];
      const underline = SETEXT_UNDERLINE.exec(current);
      if (underline) {
        setextLevel = underline[1][0] === '=' ? 1 : 2;
        index++;
        break;
      }
      if (interruptsParagraph(current)) break;
      if (detailsOpening(lines, index) || (depth > 0 && DETAILS_CLOSE.test(current))) break;
      paragraph.push(current);
      index++;
    }
    if (setextLevel) {
      emit({
        type: headingLevelType(setextLevel),
        content: paragraph.map((part) => part.trim()).join(' '),
        properties: {},
      });
    } else {
      // Embed lines split the paragraph (#135); a setext heading keeps them as its text.
      for (const block of paragraphBlocks(paragraph)) emit(block);
    }
  }

  return blocks;
}

/**
 * Blocks for a Markdown document (see the module comment for what is understood). A leading
 * YAML frontmatter block is not interpreted (never turned into dividers): it is kept verbatim
 * as the first paragraph, so opening a page never drops it. Callers that handle frontmatter
 * themselves pass the body from `splitFrontmatter`. An empty document is one empty paragraph.
 *
 * Block ids are `<idPrefix>_<index>`, deterministic so the server's collaboration seed and the
 * browser's initial blocks for the same page agree.
 */
export function markdownToBlocks(markdown: string, options: { idPrefix?: string } = {}): Block[] {
  const lines = splitLines(markdown);
  const parsed: ParsedBlock[] = [];
  let from = 0;
  const frontmatter = frontmatterEnd(lines);
  if (frontmatter > 0) {
    parsed.push({
      type: 'paragraph',
      content: lines.slice(0, frontmatter + 1).join('\n'),
      properties: {},
    });
    from = frontmatter + 1;
  }
  // Not `push(...blocks)`: spreading a huge document's blocks overflows the call stack.
  for (const block of parseMarkdown(lines, from)) parsed.push(block);
  if (parsed.length === 0) parsed.push({ type: 'paragraph', content: '', properties: {} });

  const prefix = options.idPrefix ?? 'block_md';
  // Nested blocks carry `indent` (absent at 0) and the `parentId` normalizeBlockTree derives.
  return normalizeBlockTree(
    parsed.map((block, order) => ({
      id: `${prefix}_${order}`,
      type: block.type,
      content: block.content,
      properties: block.properties,
      order,
      ...(block.indent ? { indent: block.indent } : {}),
      children: [],
    }))
  );
}
