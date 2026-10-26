import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '../../client/src/lib/markdown';
import { isSafeUrl } from '../../client/src/lib/rehype-safe-urls';

// Page content is untrusted: the reader must never render a script URL (stored XSS).
describe('URLs in rendered Markdown', () => {
  it.each([
    '[x](javascript:alert(1))',
    '[x](JavaScript:alert(1))',
    '[x](&#106;avascript:alert(1))',
    '![x](javascript:alert(1))',
    '<javascript:alert(1)>',
    '[x](vbscript:msgbox(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x][ref]\n\n[ref]: javascript:alert(1)',
  ])('drops the URL of %s', async (markdown) => {
    const html = await markdownToHtml(markdown);
    expect(html.toLowerCase()).not.toMatch(/(?:href|src)="\s*(?:javascript|vbscript|data):/);
  });

  it.each([
    ['[x](https://example.com/a?b=1)', 'href="https://example.com/a?b=1"'],
    ['[x](http://example.com)', 'href="http://example.com"'],
    ['[x](mailto:team@example.com)', 'href="mailto:team@example.com"'],
    ['[x](/page/roadmap)', 'href="/page/roadmap"'],
    ['[x](#section)', 'href="#section"'],
    ['![x](/uploads/a.png)', 'src="/uploads/a.png"'],
  ])('keeps %s', async (markdown, expected) => {
    expect(await markdownToHtml(markdown)).toContain(expected);
  });

  it('treats whitespace and control characters inside a scheme as the scheme', () => {
    expect(isSafeUrl('java\tscript:alert(1)')).toBe(false);
    expect(isSafeUrl(' javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('java\u0000script:alert(1)')).toBe(false);
    expect(isSafeUrl('//cdn.example.com/a.png')).toBe(true);
    expect(isSafeUrl('docs/guide')).toBe(true);
  });
});
