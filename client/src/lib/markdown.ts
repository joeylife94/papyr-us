import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import matter from 'gray-matter';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import { hasPageLinks, splitPageLinks } from '@shared/page-links';
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

// Parse markdown with frontmatter
export function parseMarkdown(content: string) {
  const { data: frontmatter, content: markdownContent } = matter(content);
  return { frontmatter, content: markdownContent };
}

// Convert markdown to HTML. Page link tokens become chip placeholders (#103 E6) and `#tags` links
// to the tag's document list (#113). Raw HTML is dropped by remark-rehype; links and images keep
// only safe URL schemes (a `javascript:` link would otherwise run in the reader).
export async function markdownToHtml(markdown: string): Promise<string> {
  const processor = remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeInlineTags)
    .use(rehypePageLinks)
    .use(rehypeHighlight)
    .use(rehypeSafeUrls)
    .use(rehypeStringify);

  const result = await processor.process(markdown);
  return result.toString();
}

// Extract headings for table of contents
export function extractHeadings(content: string) {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: Array<{ id: string; text: string; level: number }> = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    headings.push({ id, text, level });
  }

  return headings;
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
  const text = content
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
