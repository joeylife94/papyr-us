import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '../../client/src/lib/markdown';

// Issue #113 §2: the reader shows `#tags` as links to the tag's document list, with the same
// rules as the editor preview. Display only: the page's stored tags do not change.

/** The rendered HTML with each tag link reduced to `<tag:name>`. */
async function render(markdown: string): Promise<string> {
  const html = await markdownToHtml(markdown);
  return html.replace(
    /<a href="([^"]*)"[^>]*data-inline-tag="([^"]*)">([^<]*)<\/a>/g,
    (_m, href, tag, text) => {
      expect(href).toBe(`/?tag=${encodeURIComponent(tag)}`);
      expect(text).toBe(`#${tag}`);
      return `<tag:${tag}>`;
    }
  );
}

describe('#tags in rendered Markdown', () => {
  it('links tags in paragraphs, headings, lists, quotes and tables', async () => {
    expect(await render('#회의 and **#bold** text')).toBe(
      '<p><tag:회의> and <strong><tag:bold></strong> text</p>'
    );
    expect(await render('## Plan #draft')).toBe('<h2>Plan <tag:draft></h2>');
    expect(await render('- #a\n\n> #b')).toBe(
      '<ul>\n<li><tag:a></li>\n</ul>\n<blockquote>\n<p><tag:b></p>\n</blockquote>'
    );
    expect(await render('| x |\n|---|\n| #c |')).toContain('<td><tag:c></td>');
  });

  it('gives each tag link an internal href, a chip class and an accessible name', async () => {
    const html = await markdownToHtml('#태그');
    expect(html).toContain('href="/?tag=%ED%83%9C%EA%B7%B8"');
    expect(html).toContain('aria-label="태그 태그"');
    expect(html).toContain('class="not-prose');
  });

  it.each([
    ['`#code`', '<p><code>#code</code></p>'],
    ['```\n#fenced\n```', '<pre><code>#fenced\n</code></pre>'],
    ['[#linked](https://x.y)', '<p><a href="https://x.y">#linked</a></p>'],
    ['https://x.y/#frag', '<p><a href="https://x.y/#frag">https://x.y/#frag</a></p>'],
    ['a#b and #113 and # x', '<p>a#b and #113 and # x</p>'],
    ['\\#escaped', '<p>#escaped</p>'],
    ['&#35;entity &num;named', '<p>#entity #named</p>'],
    ['[x](/y)#after-link', '<p><a href="/y">x</a>#after-link</p>'],
  ])('leaves %s as written', async (markdown, expected) => {
    expect(await markdownToHtml(markdown)).toBe(expected);
  });

  it('works next to page link tokens', async () => {
    expect(await render('#a [[page:3]] #b')).toBe(
      '<p><tag:a> <span data-page-link="3" class="page-link"></span> <tag:b></p>'
    );
    expect(await render('[[page:3]]#no')).toBe(
      '<p><span data-page-link="3" class="page-link"></span>#no</p>'
    );
  });

  it('keeps unsafe link URLs out next to tags', async () => {
    const html = await markdownToHtml('[나쁜](javascript:alert(1)) #ok');
    expect(html).not.toMatch(/href="\s*javascript:/i);
    expect(html).toContain('<a>나쁜</a>');
    expect(html).toContain('data-inline-tag="ok"');
  });

  it('renders text without tags exactly as before', async () => {
    expect(await markdownToHtml('Plain text # not a tag')).toBe('<p>Plain text # not a tag</p>');
  });
});
