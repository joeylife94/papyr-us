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

  it('renders inline Markdown in the summary: bold, italic, code and links', async () => {
    const html = await markdownToHtml(
      blocksToMarkdown([
        toggle('**Bold** and _italic_ with `code` and [a link](https://example.com/x)'),
      ])
    );
    expect(html).toContain(
      '<summary><strong>Bold</strong> and <em>italic</em> with <code>code</code>'
    );
    expect(html).toContain('<a href="https://example.com/x">a link</a></summary>');
  });

  it('shows the lines after a summary as a paragraph inside the toggle', async () => {
    const html = await markdownToHtml(
      blocksToMarkdown([toggle('Title\nmore **text**'), paragraph('nested', 1)])
    );
    expect(html).toMatch(
      /<summary>Title<\/summary>\s*<p>more <strong>text<\/strong><\/p>\s*<p>nested<\/p>\s*<\/details>/
    );
  });

  it.each([
    '<script>alert(1)</script>',
    '</summary><img src=x onerror=alert(1)>',
    '**<img src=x onerror=alert(1)>**',
    '[x](javascript:alert(1))',
    '![x](javascript:alert(1))',
    '<a href="javascript:alert(1)">x</a>',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    '"><svg onload=alert(1)>',
  ])('never lets a summary become markup or a script link: %s', async (payload) => {
    const html = await markdownToHtml(blocksToMarkdown([toggle(payload), paragraph('inside', 1)]));
    // Only the tags the renderer itself makes; nothing from the payload is an element, and no
    // script URL survives in an attribute (text such as "onerror=" is escaped text, not one).
    const tags = [...html.matchAll(/<([a-z][a-z0-9]*)/gi)].map((m) => m[1].toLowerCase());
    expect(
      tags.filter((t) => !['details', 'summary', 'strong', 'p', 'a', 'img'].includes(t))
    ).toEqual([]);
    expect(html.toLowerCase()).not.toMatch(/<[^>]*(?:href|src)="\s*javascript:/);
    expect(html).not.toMatch(/<img[^>]*\ssrc=/i);
    expect((html.match(/<details/g) ?? []).length).toBe(1);
  });
});
