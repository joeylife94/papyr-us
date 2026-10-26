import { describe, expect, it } from 'vitest';
import { extractHeadings, markdownToHtml, toPlainTextPreview } from '../../client/src/lib/markdown';

// Issue #103 E6: the reader turns link tokens into empty chip placeholders that carry only the
// target id, and plain-text helpers never show raw tokens.
describe('page link tokens in rendered Markdown', () => {
  it('replaces tokens in text with id-only placeholders', async () => {
    const html = await markdownToHtml('See [[page:12]] and **[[page:3]]**.');
    expect(html).toBe(
      '<p>See <span data-page-link-slot="12"></span> and <strong><span data-page-link-slot="3"></span></strong>.</p>'
    );
  });

  it('keeps tokens in code as written', async () => {
    const html = await markdownToHtml('`[[page:12]]`\n\n```\n[[page:4]]\n```');
    expect(html).not.toContain('data-page-link-slot');
    expect(html).toContain('[[page:12]]');
    expect(html).toContain('[[page:4]]');
  });

  it('renders text without tokens exactly as before', async () => {
    expect(await markdownToHtml('Plain [[Title]] text')).toBe('<p>Plain [[Title]] text</p>');
  });

  it('leaves tokens out of the table of contents and list previews', () => {
    expect(extractHeadings('# Plan for [[page:3]]\n\n## [[page:4]]')).toEqual([
      { id: 'plan-for', text: 'Plan for', level: 1 },
    ]);
    expect(toPlainTextPreview('See [[page:3]] here')).toBe('See here');
  });
});
