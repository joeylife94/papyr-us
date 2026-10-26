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
 *   the text become single spaces (and the text is trimmed).
 * - `bulleted_list`: `- `; `numbered_list`: `1. `, `2. ` … counting each run of consecutive
 *   items from 1, like the editor; `checkbox`: `- [ ] ` / `- [x] ` (`properties.checked`).
 *   Continuation lines are indented to the item's content column, so a multi-line item stays
 *   one item. A bulleted run right after a to-do run (or the reverse) uses `*` instead of `-`:
 *   Markdown would otherwise merge the two into one loose list.
 * - `quote`: `> ` on every line (`>` on empty ones).
 * - `code`: a fenced block with `properties.language`. The fence is longer than any backtick run
 *   in the code, so the code can never close it.
 * - `divider`: `---`.
 * - `paragraph` and every other type: its text unchanged.
 * - An empty heading, list item, to-do or quote keeps its bare marker (`##`, `-`, `- [ ]`, `>`).
 *
 * Blocks are joined by a blank line, except consecutive items of the same list type, which are
 * joined by one newline so Markdown sees one list. A page made only of paragraphs (and other
 * text-only types) therefore derives exactly the legacy `content` (texts joined by blank lines).
 *
 * Markdown → blocks understands those constructs (ATX headings, deeper levels as `heading3`, and
 * setext headings; `-`/`*`/`+` and ordered lists; `- [ ]`/`- [x]` tasks; `>` quotes, lazy lines
 * included; fenced code with its language; `---`/`***`/`___` dividers). Everything else becomes
 * paragraphs split on blank lines, with their text verbatim, so constructs the editor has no
 * block for (tables, HTML, indented code, math) still render the same after the next save.
 * Inline Markdown and page link tokens (`[[page:<id>]]`) are never touched. Nested list items
 * stay in their parent item's text (the editor has no nesting), indented as written.
 *
 * Text that already looks like Markdown syntax is not escaped: a paragraph that starts with
 * `# ` reads as a heading, exactly as it did before blocks had their own Markdown.
 *
 * Pure: no DOM and no Node-only APIs (imported by the server and the client).
 */
import type { Block, BlockType } from './schema.js';

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
  const marker = '#'.repeat(level);
  return line ? `${marker} ${line}` : marker;
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
  const longestRun = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const open = fence + fenceLanguage(language);
  return text ? `${open}\n${text}\n${fence}` : `${open}\n${fence}`;
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
    case 'quote':
      return text
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'code':
      return codeMarkdown(text, blockProperties(block).language);
    case 'divider':
      return '---';
    default:
      return text;
  }
}

/** Where each block's Markdown starts and ends in the joined document (`end` exclusive). */
export interface BlockMarkdownRange {
  start: number;
  end: number;
}

/**
 * `blocksToMarkdown`, plus each block's range in the result, so a position in `content` (a
 * heading found by the table of contents) can be mapped back to its block.
 */
export function blocksToMarkdownWithRanges(blocks: readonly unknown[]): {
  markdown: string;
  ranges: BlockMarkdownRange[];
} {
  let markdown = '';
  const ranges: BlockMarkdownRange[] = [];
  let previousType: string | undefined;
  let listNumber = 0;
  let bullet: '-' | '*' = '-';
  blocks.forEach((block, index) => {
    const type = blockType(block);
    const continuesList =
      index > 0 && type !== undefined && LIST_TYPES.has(type) && type === previousType;
    listNumber = type === 'numbered_list' ? (continuesList ? listNumber + 1 : 1) : 0;
    if (!continuesList) {
      const followsOtherBullets =
        type !== undefined &&
        BULLET_TYPES.has(type) &&
        previousType !== undefined &&
        BULLET_TYPES.has(previousType);
      bullet = followsOtherBullets && bullet === '-' ? '*' : '-';
    }
    if (index > 0) markdown += continuesList ? '\n' : '\n\n';
    const start = markdown.length;
    markdown += blockMarkdown(block, listNumber, bullet);
    ranges.push({ start, end: markdown.length });
    previousType = type;
  });
  return { markdown, ranges };
}

/** The Markdown `content` of a block list (see the module comment for the mapping). */
export function blocksToMarkdown(blocks: readonly unknown[]): string {
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

type ParsedBlock = { type: BlockType; content: string; properties: Record<string, unknown> };

const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const QUOTE_LINE = /^ {0,3}> ?(.*)$/;
const BULLET_ITEM = /^( {0,3})([-*+])(?:([ \t]+)(.*))?$/;
const ORDERED_ITEM = /^( {0,3})(\d{1,9})([.)])(?:([ \t]+)(.*))?$/;
const TASK_PREFIX = /^\[([ xX])\](?:[ \t]+(.*))?$/;

const isBlank = (line: string) => line.trim() === '';
const indentOf = (line: string) => line.length - line.trimStart().length;

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
    !!listStart(line)
  );
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
      blocks.push({
        type: 'code',
        content: code.join('\n'),
        properties: fence.language ? { language: fence.language } : {},
      });
      continue;
    }

    const heading = ATX_HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: headingLevelType(heading[1].length),
        content: atxHeadingText(heading[2] ?? ''),
        properties: {},
      });
      index++;
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      blocks.push({ type: 'divider', content: '', properties: {} });
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
      blocks.push({ type: 'quote', content: quoted.join('\n'), properties: {} });
      continue;
    }

    const item = listStart(line);
    if (item) {
      const text = [item.first];
      index++;
      while (index < lines.length) {
        const current = lines[index];
        if (isBlank(current)) {
          // Blank lines belong to the item only when it continues after them.
          let next = index;
          while (next < lines.length && isBlank(lines[next])) next++;
          if (next >= lines.length || indentOf(lines[next]) < item.contentIndent) break;
          for (; index < next; index++) text.push('');
          continue;
        }
        if (indentOf(current) >= item.contentIndent) {
          text.push(current.slice(item.contentIndent));
        } else if (!isBlank(text[text.length - 1]) && !startsBlock(current)) {
          // A lazy line continues the item's paragraph.
          text.push(current.trimStart());
        } else {
          break;
        }
        index++;
      }
      blocks.push({
        type: item.type,
        content: text.join('\n'),
        properties: item.type === 'checkbox' ? { checked: item.checked } : {},
      });
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
      paragraph.push(current);
      index++;
    }
    if (setextLevel) {
      blocks.push({
        type: headingLevelType(setextLevel),
        content: paragraph.map((part) => part.trim()).join(' '),
        properties: {},
      });
    } else {
      blocks.push({ type: 'paragraph', content: paragraph.join('\n'), properties: {} });
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
  parsed.push(...parseMarkdown(lines, from));
  if (parsed.length === 0) parsed.push({ type: 'paragraph', content: '', properties: {} });

  const prefix = options.idPrefix ?? 'block_md';
  return parsed.map((block, order) => ({
    id: `${prefix}_${order}`,
    type: block.type,
    content: block.content,
    properties: block.properties,
    order,
    children: [],
  }));
}
