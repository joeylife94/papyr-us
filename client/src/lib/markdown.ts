import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import matter from 'gray-matter';
// Relative imports: unit tests load this module without the Vite aliases.
import { replacePageLinks } from '../../../shared/page-links';
import { rehypePageLinkSlots } from '../components/page/page-link-markdown';
import { rehypeInlineTags } from './rehype-inline-tags';
import { rehypeSafeUrls } from './rehype-safe-urls';

// Parse markdown with frontmatter
export function parseMarkdown(content: string) {
  const { data: frontmatter, content: markdownContent } = matter(content);
  return { frontmatter, content: markdownContent };
}

// Convert markdown to HTML. Page link tokens become chip placeholders (#103 E6) and `#tags` links
// to the tag's document list (#113). Raw HTML is dropped by remark-rehype; links and images keep
// only safe URL schemes.
export async function markdownToHtml(markdown: string): Promise<string> {
  const processor = remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeInlineTags)
    .use(rehypePageLinkSlots)
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
    // A page link token is an id, not text: leave it out of the table of contents (#103 E6).
    const text = replacePageLinks(match[2], () => '').trim();
    if (!text) continue;
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
