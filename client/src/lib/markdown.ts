import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import matter from 'gray-matter';
// Relative imports: unit tests load this module without the Vite aliases.
import { replacePageLinks } from '../../../shared/page-links';
import { blocksToMarkdownWithRanges } from '../../../shared/block-markdown';
import { rehypePageLinkSlots } from '../components/page/page-link-markdown';
import { rehypeInlineTags } from './rehype-inline-tags';
import { rehypeSafeUrls } from './rehype-safe-urls';

// Parse markdown with frontmatter
export function parseMarkdown(content: string) {
  const { data: frontmatter, content: markdownContent } = matter(content);
  return { frontmatter, content: markdownContent };
}

// Convert markdown to HTML. Page link tokens become chip placeholders (#103 E6), `#tags` link to
// the tag's document list and headings get the anchor ids the table of contents links to (#113).
// Raw HTML is dropped by remark-rehype; links and images keep only safe URL schemes.
// `takenHeadingIds`: ids of headings earlier in the same page, when it renders in parts.
export async function markdownToHtml(
  markdown: string,
  options: { takenHeadingIds?: readonly string[] } = {}
): Promise<string> {
  const processor = remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeInlineTags)
    .use(rehypePageLinkSlots)
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
  const processor = remark().use(remarkGfm).use(remarkRehype).use(rehypePageLinkSlots);
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
  const text = replacePageLinks(content, () => ' ')
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
