import { describe, expect, it } from 'vitest';
import {
  PAGE_EXCERPT_LENGTH,
  buildPageExcerpt,
  draftPageExcerpt,
  excerptLinkIds,
  renderPageExcerpt,
} from '../../shared/page-excerpt';

// The hover card of a page link (issue #133) shows the start of the target page as plain text,
// built on the server from untrusted Markdown content.

describe('page link preview excerpt', () => {
  it('drops Markdown syntax and collapses whitespace', () => {
    const content = [
      '# Plan ##',
      'Guidelines for **small** teams, _not_ ~~large~~ ones.',
      '## Weekly rhythm',
      '- Review `tasks`\n- See [decisions](/page/x "Decisions")\n1. First\n2) Second',
      '> Quote\n> > nested',
      '---',
      '- [ ] Open item\n* [x] Done item',
    ].join('\n\n');
    expect(buildPageExcerpt(content)).toBe(
      'Plan Guidelines for small teams, not large ones. Weekly rhythm Review tasks See decisions ' +
        'First Second Quote nested Open item Done item'
    );
  });

  it('keeps text that only looks like syntax', () => {
    expect(buildPageExcerpt('Rename snake_case_name later; 2 * 3 is ~6, C# and 3.14')).toBe(
      'Rename snake_case_name later; 2 * 3 is ~6, C# and 3.14'
    );
    expect(buildPageExcerpt('An escaped \\*star\\* and \\[bracket]')).toBe(
      'An escaped *star* and [bracket]'
    );
  });

  it('leaves out code blocks, images, embeds, raw HTML and frontmatter', () => {
    const content = [
      '---\ntitle: Hidden\ntags: [x]\n---',
      'Before ![diagram](https://example.com/d.png) the ![[Sketch.png]] text <b>bold</b><br/>',
      '```ts\nconst secret = 1;\n```',
      '~~~\nmore code\n~~~',
      '<!-- note --> After <https://example.com/x>',
    ].join('\n');
    expect(buildPageExcerpt(content)).toBe('Before the text bold After https://example.com/x');
  });

  it('reads tables as their cell text', () => {
    expect(buildPageExcerpt('| Name | Role |\n| --- | :-: |\n| Ada | Lead |')).toBe(
      'Name Role Ada Lead'
    );
  });

  it('names link tokens by title when given one and "[링크]" otherwise', () => {
    const draft = draftPageExcerpt('See [[page:42]], [[page:7]] and [[page:42]] again.');
    expect(excerptLinkIds(draft)).toEqual([42, 7]);
    expect(renderPageExcerpt(draft, new Map([[42, 'Road  map']]))).toBe(
      'See Road map, [링크] and Road map again.'
    );
    expect(renderPageExcerpt(draft)).toBe('See [링크], [링크] and [링크] again.');
    // An embedded page is not a link: it is dropped like any embed.
    expect(buildPageExcerpt('Intro ![[page:42]] outro')).toBe('Intro outro');
    // Ids beyond the page id column are never looked up.
    expect(excerptLinkIds(draftPageExcerpt('[[page:9999999999]] [[page:0]]'))).toEqual([]);
  });

  it('keeps tokens inside code as written, as the reader does', () => {
    const draft = draftPageExcerpt('Write `[[page:5]]` to link.');
    expect(excerptLinkIds(draft)).toEqual([]);
    expect(renderPageExcerpt(draft)).toBe('Write [[page:5]] to link.');
  });

  it('caps the text and adds an ellipsis only when it was cut', () => {
    expect(buildPageExcerpt('Short note')).toBe('Short note');
    expect(buildPageExcerpt('')).toBe('');
    expect(buildPageExcerpt(null)).toBe('');
    const exact = 'a'.repeat(PAGE_EXCERPT_LENGTH);
    expect(buildPageExcerpt(exact)).toBe(exact);
    const long = `${'word '.repeat(100)}end`;
    const excerpt = buildPageExcerpt(long);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(PAGE_EXCERPT_LENGTH + 1);
    expect(long.startsWith(excerpt.slice(0, -1))).toBe(true);
  });

  it('counts long titles against the cap and never splits a character', () => {
    const draft = draftPageExcerpt('[[page:1]] tail');
    expect(renderPageExcerpt(draft, new Map([[1, 'T'.repeat(400)]]))).toBe(
      `${'T'.repeat(PAGE_EXCERPT_LENGTH)}…`
    );
    const emoji = buildPageExcerpt(`${'a'.repeat(PAGE_EXCERPT_LENGTH - 1)}😀😀`);
    expect(emoji).toBe(`${'a'.repeat(PAGE_EXCERPT_LENGTH - 1)}…`);
  });

  it('looks up at most a bounded number of links, however many the page holds', () => {
    const content = Array.from({ length: 5000 }, (_, i) => `[[page:${i + 1}]]`).join(' ');
    const ids = excerptLinkIds(draftPageExcerpt(content));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(Math.ceil(PAGE_EXCERPT_LENGTH / 4) + 1);
  });
});

// Page content is untrusted (#113): each of these used to be a quadratic scan for regex-based
// stripping. The bound is generous so a slow CI machine does not flake.
const BOUND_MS = 2000;

function timed<T>(run: () => T): { result: T; ms: number } {
  const started = performance.now();
  const result = run();
  return { result, ms: performance.now() - started };
}

describe('the excerpt stays linear on hostile content', () => {
  let ticks = '';
  for (let length = 1; ticks.length < 1_000_000; length++) ticks += `${'`'.repeat(length)} x `;
  const inputs: Record<string, string> = {
    'unclosed brackets': '['.repeat(1_000_000),
    'unclosed links': '[a]('.repeat(250_000),
    'unclosed images': '!['.repeat(500_000),
    'unclosed embeds': '![['.repeat(300_000),
    'emphasis without closers': '*a '.repeat(300_000),
    'unclosed angle brackets': '<'.repeat(1_000_000),
    'unmatched backtick runs': ticks,
    'backticks before a long run': `${'` '.repeat(400)}${'`'.repeat(1_000_000)}`,
    'dropped tags only': '<b>'.repeat(300_000),
    'dropped images only': '![a](b)'.repeat(150_000),
    'deep blockquote': `${'> '.repeat(500_000)}x`,
    'blank lines': '\n'.repeat(1_000_000),
    'unclosed code fence': `\`\`\`\n${'a\n'.repeat(500_000)}`,
    'rules only': '---\n\n'.repeat(200_000),
    'link tokens': '[[page:1]]'.repeat(100_000),
    'unicode spaces': `${'　'.repeat(1_000_000)}x`,
  };
  for (const [name, content] of Object.entries(inputs)) {
    it(name, () => {
      const { result, ms } = timed(() => buildPageExcerpt(content));
      expect(ms).toBeLessThan(BOUND_MS);
      expect(result.length).toBeLessThanOrEqual(PAGE_EXCERPT_LENGTH + 1);
    });
  }
});
