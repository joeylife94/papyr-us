import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import matter from 'gray-matter';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import { hasPageLinks, splitPageLinks } from '@shared/page-links';
import { blocksToMarkdownWithRanges } from '@shared/block-markdown';
import { rehypeInlineTags } from './rehype-inline-tags';
import { rehypeSafeUrls } from './rehype-safe-urls';

const RAW_TEXT_PARENTS = new Set(['code', 'pre', 'script', 'style']);

function pageLinkPlaceholders(text: string): ElementContent[] {
  return splitPageLinks(text).map((segment) =>
    segment.kind === 'text'
      ? { type: 'text', value: segment.text }
      : {
          type: 'element',
          tagName: 'span',
          properties: { dataPageLink: String(segment.pageId), className: ['page-link'] },
          children: [],
        }
  );
}

function replacePageLinkTokens(node: Root | Element) {
  if (node.type === 'element' && RAW_TEXT_PARENTS.has(node.tagName)) return;
  const children: Array<RootContent | ElementContent> = [];
  let changed = false;
  for (const child of node.children) {
    if (child.type === 'text' && hasPageLinks(child.value)) {
      changed = true;
      // A loop, not a spread: a text node can hold more tokens than an argument list takes.
      for (const part of pageLinkPlaceholders(child.value)) children.push(part);
    } else {
      if (child.type === 'element') replacePageLinkTokens(child);
      children.push(child);
    }
  }
  if (changed) node.children = children as typeof node.children;
}

/**
 * Page links (issue #103 E6): turn `[[page:<id>]]` tokens in text into empty
 * `<span data-page-link="<id>">` placeholders, which MarkdownRenderer fills with link chips.
 * Code keeps the token as written. A rehype step that runs after `rehypeInlineTags` (#113): that
 * step reads the source positions of text nodes, which splitting them here would drop.
 */
function rehypePageLinks() {
  return (tree: Root) => replacePageLinkTokens(tree);
}

/**
 * What the reader shows when `markdownToHtml` fails: the page text as escaped plain text. Page
 * content is untrusted; inserting it unescaped would run any HTML it holds.
 */
export function plainTextFallbackHtml(content: string): string {
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<pre>${escaped}</pre>`;
}

// Parse markdown with frontmatter
export function parseMarkdown(content: string) {
  const { data: frontmatter, content: markdownContent } = matter(content);
  return { frontmatter, content: markdownContent };
}

/**
 * GFM names every footnote list's heading `footnote-label` (each reference points at it with
 * `aria-describedby`), and remark-rehype's `clobberPrefix` does not reach that id. With `id`,
 * the label and the references to it use that id instead, so each part of a page rendered in
 * parts keeps its own label.
 */
function rehypeFootnoteLabelId(options: { id?: string }) {
  const rename = (node: HastNode) => {
    const properties = node.properties;
    if (properties?.id === 'footnote-label') properties.id = options.id;
    if (Array.isArray(properties?.ariaDescribedBy)) {
      properties.ariaDescribedBy = properties.ariaDescribedBy.map((id) =>
        id === 'footnote-label' ? options.id : id
      );
    }
    node.children?.forEach(rename);
  };
  return (tree: HastNode) => {
    if (options.id) rename(tree);
  };
}

// Convert markdown to HTML. Page link tokens become chip placeholders (#103 E6), `#tags` link to
// the tag's document list and headings get the anchor ids the table of contents links to (#113).
// Raw HTML is dropped by remark-rehype; links and images keep only safe URL schemes (a
// `javascript:` link would otherwise run in the reader).
// When a page renders in parts (see `markdownParts`): `takenHeadingIds` are the ids of headings
// earlier in the page, `footnoteIdPrefix` keeps this part's footnote ids apart from the others'.
export async function markdownToHtml(
  markdown: string,
  options: { takenHeadingIds?: readonly string[]; footnoteIdPrefix?: string } = {}
): Promise<string> {
  // The default prefix without `footnoteIdPrefix`, so whole pages render as they always have.
  const footnoteIds = `user-content-${options.footnoteIdPrefix ?? ''}`;
  const processor = remark()
    .use(remarkGfm)
    .use(remarkRehype, { clobberPrefix: footnoteIds })
    .use(rehypeFootnoteLabelId, {
      id: options.footnoteIdPrefix ? `${footnoteIds}footnote-label` : undefined,
    })
    .use(rehypeInlineTags)
    .use(rehypePageLinks)
    .use(rehypeHeadingIds, { taken: options.takenHeadingIds })
    .use(rehypeHighlight)
    .use(rehypeSafeUrls)
    .use(rehypeStringify);

  const result = await processor.process(markdown);
  return result.toString();
}

// ---- Headings and the table of contents (#113 §1) -------------------------------------------
// The reader and the table of contents find headings in the same tree (remark + GFM + link
// slots) and name them with the same slugger, so every TOC entry points at a rendered heading.

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  position?: { start?: { offset?: number } };
};

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** A heading's visible text: link slots are empty, so link tokens never become text (#103 E6). */
function hastText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(hastText).join('');
}

/** Headings in document order, with their text (empty ones are left out of the TOC). */
function collectHeadings(
  node: HastNode,
  out: Array<{ node: HastNode; text: string; level: number }> = []
) {
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue;
    if (child.tagName && HEADING_TAGS.has(child.tagName)) {
      // A heading that already has an id was generated, not written: GFM's screen-reader
      // footnote label, which footnote references point at. It keeps its id and stays out of
      // the table of contents.
      if (child.properties?.id) continue;
      const text = hastText(child).replace(/\s+/g, ' ').trim();
      if (text) out.push({ node: child, text, level: Number(child.tagName.slice(1)) });
    } else {
      collectHeadings(child, out);
    }
  }
  return out;
}

/**
 * Anchor ids for one document's headings: `heading-` and a slug of the text (letters and digits
 * of any script, so Korean headings get real ids), with `-1`, `-2` … for repeats. The prefix
 * keeps ids written from page text from colliding with the app's own element ids. `taken` holds
 * ids already used by earlier parts of the same page, so a page rendered in parts gets the ids
 * it would get in one piece.
 */
export function createHeadingSlugger(taken: Iterable<string> = []): (text: string) => string {
  const used = new Set<string>(taken);
  return (text) => {
    const slug =
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
        .trim()
        .replace(/\s+/g, '-') || 'section';
    const base = `heading-${slug}`;
    let id = base;
    for (let n = 1; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
}

/** Rehype plugin: give each non-empty heading its table-of-contents anchor id. */
export function rehypeHeadingIds(options: { taken?: readonly string[] } = {}) {
  return (tree: HastNode) => {
    const slug = createHeadingSlugger(options.taken);
    for (const heading of collectHeadings(tree)) {
      heading.node.properties = { ...heading.node.properties, id: slug(heading.text) };
    }
  };
}

export interface PageHeading {
  id: string;
  text: string;
  level: number;
}

/** Headings of a Markdown document with their offsets in it, as the reader renders them. */
function headingsWithOffsets(
  content: string,
  taken: readonly string[] = []
): Array<PageHeading & { offset: number }> {
  // Most edits never touch a heading: skip parsing when no ATX or setext heading is possible.
  if (!content.includes('#') && !/^ {0,3}(?:=+|-+)[ \t]*$/m.test(content)) return [];
  const processor = remark().use(remarkGfm).use(remarkRehype).use(rehypePageLinks);
  const tree = processor.runSync(processor.parse(content)) as unknown as HastNode;
  const slug = createHeadingSlugger(taken);
  return collectHeadings(tree).map(({ node, text, level }) => ({
    id: slug(text),
    text,
    level,
    offset: node.position?.start?.offset ?? 0,
  }));
}

// Extract headings for the table of contents: the ids match the reader's (`markdownToHtml`).
// Headings inside code blocks are code, not headings. `takenHeadingIds` as in markdownToHtml.
export function extractHeadings(
  content: string,
  takenHeadingIds: readonly string[] = []
): PageHeading[] {
  return headingsWithOffsets(content, takenHeadingIds).map(({ id, text, level }) => ({
    id,
    text,
    level,
  }));
}

/**
 * For a page rendered in parts (Markdown runs around inline databases): the heading ids each
 * part must skip, so the parts together get the ids of the whole document, which the table of
 * contents links to.
 */
export function takenHeadingIdsByPart(parts: readonly string[]): string[][] {
  const taken: string[] = [];
  return parts.map((content) => {
    const before = taken.slice();
    for (const heading of extractHeadings(content, before)) taken.push(heading.id);
    return before;
  });
}

type MdastNode = {
  type: string;
  children?: MdastNode[];
  position?: {
    start?: { line?: number; offset?: number };
    end?: { line?: number; offset?: number };
  };
};

const DEFINITION_TYPES = new Set(['definition', 'footnoteDefinition']);

/**
 * The link reference and footnote definitions of one Markdown document, as Markdown, and
 * whether the document holds anything else. Definitions are copied as written, except one that
 * spans lines inside a quote or a list: its lines carry the container's markers, so it is
 * copied as remark writes it.
 */
function definitionsOf(content: string): { definitions: string[]; onlyDefinitions: boolean } {
  // Every definition has a `]:` right after its label.
  if (!content.includes(']:')) return { definitions: [], onlyDefinitions: !content.trim() };
  const processor = remark().use(remarkGfm);
  const tree = processor.parse(content);
  const definitions: string[] = [];
  const collect = (node: MdastNode, topLevel: boolean) => {
    for (const child of node.children ?? []) {
      if (!DEFINITION_TYPES.has(child.type)) {
        collect(child, false);
        continue;
      }
      const { start, end } = child.position ?? {};
      const asWritten = topLevel || start?.line === end?.line;
      definitions.push(
        asWritten && start?.offset !== undefined && end?.offset !== undefined
          ? content.slice(start.offset, end.offset)
          : processor.stringify({ type: 'root', children: [child] } as MdastRoot).trimEnd()
      );
    }
  };
  collect(tree as unknown as MdastNode, true);
  const onlyDefinitions = tree.children.every((child) => DEFINITION_TYPES.has(child.type));
  return { definitions, onlyDefinitions };
}

export interface MarkdownPart {
  /** The part's Markdown, with the other parts' definitions appended. */
  markdown: string;
  takenHeadingIds: string[];
  footnoteIdPrefix: string;
}

/**
 * For a page rendered in parts (Markdown runs around inline databases, #113 §4): what each part
 * renders, so that together the parts read as the page's one document. Null for a part that
 * shows nothing (empty, or only definitions).
 * - Link reference and footnote definitions apply to the whole page. Markdown reads
 *   `[text][label]` and `[^label]` as references only when the label is defined in the same
 *   document, so each part renders with the other parts' definitions appended (definitions
 *   render nothing themselves).
 * - A part lists the footnotes it cites at its own end, as GFM does for a document, under ids
 *   with the part's own prefix: two parts citing a footnote never both emit `user-content-fn-1`
 *   or `footnote-label`.
 * - Heading ids continue across the parts, so the table of contents (built from the whole
 *   `content`) points at every heading.
 */
export function markdownParts(parts: readonly string[]): Array<MarkdownPart | null> {
  const found = parts.map(definitionsOf);
  const markdown = parts.map((content, index) => {
    if (found[index].onlyDefinitions) return '';
    const others = found.flatMap((part, other) => (other === index ? [] : part.definitions));
    return others.length > 0 ? `${content}\n\n${others.join('\n\n')}` : content;
  });
  const taken = takenHeadingIdsByPart(markdown);
  return markdown.map((content, index) =>
    content
      ? { markdown: content, takenHeadingIds: taken[index], footnoteIdPrefix: `part-${index}-` }
      : null
  );
}

/**
 * For the editor: the table-of-contents id of the first heading each block writes into the
 * page content, keyed by block id, so the TOC can scroll to blocks while editing.
 */
export function headingIdsByBlock(blocks: ReadonlyArray<{ id: string }>): Map<string, string> {
  const { markdown, ranges } = blocksToMarkdownWithRanges(blocks);
  const ids = new Map<string, string>();
  let index = 0;
  for (const heading of headingsWithOffsets(markdown)) {
    while (index < ranges.length && ranges[index].end <= heading.offset) index++;
    const block = blocks[index];
    if (block && heading.offset >= ranges[index].start && !ids.has(block.id)) {
      ids.set(block.id, heading.id);
    }
  }
  return ids;
}

// Generate reading time estimate
export function estimateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

// Plain-text excerpt for document lists: drops common markdown syntax and only adds an
// ellipsis when the text was actually shortened.
export function toPlainTextPreview(content: string, maxLength = 160): string {
  // Page link tokens carry only an id; list previews leave them out (#103 E6).
  const text = splitPageLinks(content)
    .map((part) => (part.kind === 'text' ? part.text : ' '))
    .join('')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|~~|\*)(\S(?:[\s\S]*?\S)?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

// Create slug from title
export function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
