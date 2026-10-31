import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import matter from 'gray-matter';
import { hasPageLinks, splitPageLinks } from '@shared/page-links';

/**
 * Page links (issue #103 E6): turn `[[page:<id>]]` tokens in text into empty
 * `<span data-page-link="<id>">` placeholders, which MarkdownRenderer fills with link chips.
 * Code spans and code blocks are not text nodes, so tokens there stay as written.
 */
function remarkPageLinks() {
  return (tree: any) => {
    const walk = (node: any) => {
      if (!Array.isArray(node.children)) return;
      const children: any[] = [];
      for (const child of node.children) {
        if (child.type === 'text' && hasPageLinks(child.value)) {
          for (const segment of splitPageLinks(child.value)) {
            children.push(
              segment.kind === 'text'
                ? { type: 'text', value: segment.text }
                : {
                    type: 'emphasis',
                    children: [],
                    data: {
                      hName: 'span',
                      hProperties: {
                        dataPageLink: String(segment.pageId),
                        className: ['page-link'],
                      },
                    },
                  }
            );
          }
        } else {
          walk(child);
          children.push(child);
        }
      }
      node.children = children;
    };
    walk(tree);
  };
}

// Parse markdown with frontmatter
export function parseMarkdown(content: string) {
  const { data: frontmatter, content: markdownContent } = matter(content);
  return { frontmatter, content: markdownContent };
}

// Convert markdown to HTML
export async function markdownToHtml(markdown: string): Promise<string> {
  const processor = remark()
    .use(remarkGfm)
    .use(remarkPageLinks)
    .use(remarkRehype)
    .use(rehypeHighlight)
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
    // Page links (issue #103 E6) store only an id; a preview names them without the title,
    // which would need a lookup the viewer may not be allowed.
    .replace(/\[\[page:\d{1,10}\]\]/g, '[링크]')
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
