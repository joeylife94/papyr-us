import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '../../client/src/lib/markdown';
import { blocksToMarkdown } from '../../shared/block-markdown';

// WP11: the reader draws a toggle block as a disclosure everyone can open and close. Page content
// is untrusted, so only the exact shape the editor writes is recognised and its text is escaped.
describe('toggles in rendered Markdown', () => {
  const toggle = (content: string, indent = 0) => ({
    id: `t${content}${indent}`,
    type: 'toggle',
    content,
    properties: {},
    order: 0,
    children: [],
    ...(indent ? { indent } : {}),
  });
  const paragraph = (content: string, indent = 0) => ({
    ...toggle(content, indent),
    type: 'paragraph',
  });

  it('renders a toggle as an open details element with its summary and nested blocks', async () => {
    const html = await markdownToHtml(
      blocksToMarkdown([toggle('Question'), paragraph('Answer', 1), paragraph('After')])
    );
    expect(html).toMatch(
      /<details open>\s*<summary>Question<\/summary>\s*<p>Answer<\/p>\s*<\/details>/
    );
    expect(html.indexOf('</details>')).toBeLessThan(html.indexOf('<p>After</p>'));
  });

  it('nests a toggle inside a toggle', async () => {
    const html = await markdownToHtml(
      blocksToMarkdown([toggle('outer'), toggle('inner', 1), paragraph('deep', 2)])
    );
    expect(html.match(/<details open>/g)).toHaveLength(2);
    expect(html.match(/<\/details>/g)).toHaveLength(2);
    expect(html.indexOf('<summary>inner')).toBeGreaterThan(html.indexOf('<summary>outer'));
  });

  it('shows the summary as text: markup in it is escaped, never run', async () => {
    const html = await markdownToHtml(
      blocksToMarkdown([toggle('<img src=x onerror=alert(1)> & <script>alert(2)</script>')])
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&#x3C;img src=x onerror=alert(1)>');
  });

  it('drops other raw HTML, including details that do not have the editor shape', async () => {
    const html = await markdownToHtml(
      '<details onclick="alert(1)">\n<summary>x</summary>\n\nbody\n\n</details>\n\n<script>alert(1)</script>\n\n<details><summary><b>x</b></summary>\n\nmore\n\n</details>'
    );
    expect(html).not.toContain('<details');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>');
  });

  it('ignores a closing line without an opening one', async () => {
    const html = await markdownToHtml('before\n\n</details>\n\nafter');
    expect(html).not.toContain('details');
    expect(html).toContain('<p>after</p>');
  });

  it('closes an unclosed toggle at the end of the page', async () => {
    const html = await markdownToHtml('<details>\n<summary>x</summary>\n\nbody');
    expect(html).toMatch(/<details open>\s*<summary>x<\/summary>\s*<p>body<\/p>\s*<\/details>/);
  });
});
