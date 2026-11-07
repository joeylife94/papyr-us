import { describe, expect, it } from 'vitest';
import {
  embedLinePageId,
  embedRefusal,
  embedTokenPageId,
  MAX_EMBED_CONTENT_CHARS,
  MAX_EMBED_DEPTH,
  MAX_EMBEDS_PER_PAGE,
  pageEmbedToken,
  truncateEmbedContent,
} from '../../shared/page-embeds';
import {
  extractPageLinkIds,
  hasPageLinks,
  MAX_PAGE_ID,
  splitPageLinks,
} from '../../shared/page-links';
import { blocksToMarkdown, markdownToBlocks } from '../../shared/block-markdown';
import { createEmbedBudget } from '../../client/src/lib/embed-budget';
import { extractHeadings, markdownToHtml, toPlainTextPreview } from '../../client/src/lib/markdown';

// Page embeds (#135, decision P3-D2): an embed stores only the target's id, as the token
// `![[page:<id>]]` on its own line, and is counted as a link everywhere links are.

const embed = (pageId: unknown, id = 'e') => ({
  id,
  type: 'page_embed',
  content: '',
  properties: { pageId },
  order: 0,
});
const paragraph = (content: string, id = 'p') => ({ id, type: 'paragraph', content, order: 0 });

describe('embed tokens', () => {
  it('writes the token and reads a line holding only it', () => {
    expect(pageEmbedToken(42)).toBe('![[page:42]]');
    expect(embedLinePageId('![[page:42]]')).toBe(42);
    expect(embedLinePageId('   ![[page:42]]  ')).toBe(42);
    expect(embedTokenPageId('  ![[page:42]]\t')).toBe(42);
    for (const line of [
      '    ![[page:42]]', // four spaces: indented code
      'see ![[page:42]]',
      '![[page:42]] more',
      '[[page:42]]',
      '![[Plan]]',
      '![[page:0]]',
      '![[page:abc]]',
    ]) {
      expect(embedLinePageId(line), line).toBeNull();
    }
    // A paragraph's continuation lines lose their indentation in Markdown.
    expect(embedLinePageId('      ![[page:42]]', { continuation: true })).toBe(42);
  });

  it('keeps ids beyond the page id column out (isPageId bounds)', () => {
    expect(embedLinePageId(`![[page:${MAX_PAGE_ID}]]`)).toBe(MAX_PAGE_ID);
    expect(embedLinePageId(`![[page:${MAX_PAGE_ID + 1}]]`)).toBeNull();
    expect(embedLinePageId('![[page:9999999999]]')).toBeNull();
    expect(
      extractPageLinkIds('![[page:9999999999]]\n\n![[page:2147483648]]\n\n![[page:5]]')
    ).toEqual([5]);
  });

  it('counts embeds as links, so page_links, backlinks and the graph include them', () => {
    expect(extractPageLinkIds('![[page:7]]\n\nSee [[page:3]] and ![[page:7]] again')).toEqual([
      7, 3,
    ]);
    expect(hasPageLinks('![[page:7]]')).toBe(true);
    expect(extractPageLinkIds(blocksToMarkdown([embed(9), paragraph('[[page:4]]')]))).toEqual([
      9, 4,
    ]);
  });

  it('shows an embed token inside text as a link, without a stray "!"', () => {
    expect(splitPageLinks('a ![[page:1]] b [[page:2]]!')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'link', pageId: 1 },
      { kind: 'text', text: ' b ' },
      { kind: 'link', pageId: 2 },
      { kind: 'text', text: '!' },
    ]);
  });

  it('names embeds without a title in list previews and leaves them out of the TOC', () => {
    expect(toPlainTextPreview('Intro\n\n![[page:3]]\n\nend')).toBe('Intro [링크] end');
    expect(extractHeadings('# Plan\n\n![[page:3]]')).toEqual([
      { id: 'heading-plan', text: 'Plan', level: 1 },
    ]);
  });
});

describe('page_embed blocks and Markdown', () => {
  it('derives only the token from properties.pageId, never the target text', () => {
    expect(blocksToMarkdown([paragraph('Intro', 'a'), embed(12, 'b'), paragraph('End', 'c')])).toBe(
      'Intro\n\n![[page:12]]\n\nEnd'
    );
    expect(blocksToMarkdown([embed('12')])).toBe('![[page:12]]');
    // No valid id: nothing at all.
    for (const pageId of [undefined, null, 0, -1, 1.5, 'x', MAX_PAGE_ID + 1, '9999999999']) {
      expect(blocksToMarkdown([embed(pageId)]), String(pageId)).toBe('');
    }
    // Content or other properties a client might send never reach the derived Markdown.
    expect(
      blocksToMarkdown([
        { ...embed(12), content: 'leaked target text', properties: { pageId: 12, title: 'T' } },
      ])
    ).toBe('![[page:12]]');
  });

  it('reads an embed line as a page_embed block, also where it ends a paragraph', () => {
    const blocks = markdownToBlocks('![[page:5]]\n\nIntro\n![[page:6]]\n   ![[page:7]]\nOutro');
    expect(blocks.map((b) => [b.type, b.content, b.properties])).toEqual([
      ['page_embed', '', { pageId: 5 }],
      ['paragraph', 'Intro', {}],
      ['page_embed', '', { pageId: 6 }],
      ['page_embed', '', { pageId: 7 }],
      ['paragraph', 'Outro', {}],
    ]);
  });

  it('reads a hard break that ends an embed line, or the line before it, as a line break', () => {
    const blocks = markdownToBlocks('Intro\\\n![[page:5]]\\\nOutro  \n![[page:6]]  \nEnd\\');
    expect(blocks.map((b) => [b.type, b.content, b.properties])).toEqual([
      ['paragraph', 'Intro', {}],
      ['page_embed', '', { pageId: 5 }],
      ['paragraph', 'Outro  ', {}],
      ['page_embed', '', { pageId: 6 }],
      // A backslash ending the paragraph is text, kept as written.
      ['paragraph', 'End\\', {}],
    ]);
  });

  it('leaves embed tokens that are not alone on a top-level line as text', () => {
    const cases: Array<[string, string, string]> = [
      ['see ![[page:5]] here', 'paragraph', 'see ![[page:5]] here'],
      ['- item\n![[page:5]]', 'bulleted_list', 'item\n![[page:5]]'], // lazy line of the item
      ['> quote\n![[page:5]]', 'quote', 'quote\n![[page:5]]'],
      ['# ![[page:5]]', 'heading1', '![[page:5]]'],
      ['![[page:5]]\n---', 'heading2', '![[page:5]]'], // setext heading, as Markdown reads it
      ['    ![[page:5]]', 'paragraph', '    ![[page:5]]'],
      ['![[page:9999999999]]', 'paragraph', '![[page:9999999999]]'],
    ];
    for (const [markdown, type, content] of cases) {
      const [first] = markdownToBlocks(markdown);
      expect([first.type, first.content], markdown).toEqual([type, content]);
    }
    const [code] = markdownToBlocks('```\n![[page:5]]\n```');
    expect([code.type, code.content]).toEqual(['code', '![[page:5]]']);
  });

  it('round-trips embed blocks and is a fixed point', () => {
    const blocks = [paragraph('Intro', 'a'), embed(5, 'b'), embed(6, 'c'), paragraph('End', 'd')];
    const markdown = blocksToMarkdown(blocks);
    const parsed = markdownToBlocks(markdown);
    expect(parsed.map((b) => [b.type, b.properties])).toEqual([
      ['paragraph', {}],
      ['page_embed', { pageId: 5 }],
      ['page_embed', { pageId: 6 }],
      ['paragraph', {}],
    ]);
    expect(blocksToMarkdown(parsed)).toBe(markdown);
  });
});

describe('reader rendering of embeds', () => {
  it('turns an embed line into an empty slot, with no id text or title', async () => {
    const html = await markdownToHtml('Intro\n![[page:12]]\nOutro **b**');
    expect(html).toBe(
      '<p>Intro</p>\n<div data-page-embed="12" class="page-embed"></div>\n<p>Outro <strong>b</strong></p>'
    );
  });

  it('shows embed tokens elsewhere as links and leaves code alone', async () => {
    const html = await markdownToHtml(
      '- ![[page:1]]\n\ntext ![[page:2]] more\n\n# ![[page:3]]\n\n`![[page:4]]`\n\n```\n![[page:5]]\n```'
    );
    expect(html).not.toContain('data-page-embed');
    for (const id of [1, 2, 3]) {
      expect(html).toContain(`<span data-page-link="${id}" class="page-link"></span>`);
    }
    expect(html).not.toContain('!<span');
    expect(html).toContain('<code>![[page:4]]</code>');
    expect(html).toContain('![[page:5]]\n</code>');
  });

  it('agrees with the block editor on which lines are embeds', async () => {
    const inputs = [
      '![[page:1]]',
      'a\n![[page:1]]\nb\n\n![[page:2]]',
      'a  \n![[page:1]]',
      '- x\n![[page:1]]',
      '> x\n![[page:1]]',
      '![[page:1]]\n---',
      'a\n![[page:1]]\n===',
      '    ![[page:1]]',
      'a\n      ![[page:1]]',
      'a\n![[page:1]]\n      ![[page:2]]\nb\n  ![[page:3]]',
      'a\n![[page:1]]\n![[page:2]]\n---',
      '![[page:1]]\nb\n---',
      '![[page:1]] ![[page:2]]',
      // Hard breaks (two spaces or a backslash) end an embed line like any line break.
      '![[page:1]]  \ntext',
      'a\n![[page:1]]  \nb',
      '![[page:1]]\t\t\ntext',
      '![[page:1]]  ',
      '![[page:1]]\\\ntext',
      'a\n![[page:1]]\\\nb',
      // A backslash ending a paragraph is text, and an escaped one is not a break.
      '![[page:1]]\\',
      'a\n![[page:1]]\\',
      '![[page:1]]\\\\\ntext',
      'a\\\n![[page:1]]\nb',
    ];
    for (const markdown of inputs) {
      const fromBlocks = markdownToBlocks(markdown)
        .filter((b) => b.type === 'page_embed')
        .map((b) => b.properties.pageId);
      const html = await markdownToHtml(markdown);
      const fromReader = Array.from(html.matchAll(/data-page-embed="(\d+)"/g), (m) => Number(m[1]));
      expect(fromReader, markdown).toEqual(fromBlocks);
    }
  });

  it('shows an embed line that ends in a hard break as the embed, not as a link', async () => {
    for (const markdown of ['![[page:12]]  \nOutro', 'Intro\n![[page:12]]\\\nOutro']) {
      const html = await markdownToHtml(markdown);
      expect(html, markdown).toContain('<div data-page-embed="12" class="page-embed"></div>');
      expect(html, markdown).not.toContain('data-page-link');
      expect(html, markdown).not.toContain('<br>');
      expect(html, markdown).toContain('<p>Outro</p>');
    }
  });

  it('renders the content of an embedded page without heading anchors', async () => {
    expect(await markdownToHtml('## Intro', { embedded: true })).toBe('<h2>Intro</h2>');
    expect(await markdownToHtml('## Intro')).toBe('<h2 id="heading-intro">Intro</h2>');
  });

  it('keeps embedded content data: no raw HTML, no unsafe URLs', async () => {
    const html = await markdownToHtml(
      '<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n![[page:3]]',
      { embedded: true }
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('data-page-embed="3"');
  });
});

describe('embed limits', () => {
  it('stops at depth 2 and at a page already above (a cycle)', () => {
    expect(MAX_EMBED_DEPTH).toBe(2);
    // Viewing page 1: its embed of 2 is depth 1, 2's embed of 3 depth 2, 3's embed of 4 depth 3.
    expect(embedRefusal(2, { ancestors: [1], depth: 1 })).toBeNull();
    expect(embedRefusal(3, { ancestors: [1, 2], depth: 2 })).toBeNull();
    expect(embedRefusal(4, { ancestors: [1, 2, 3], depth: 3 })).toBe('depth');
    // A embeds B embeds A, and a page embedding itself.
    expect(embedRefusal(1, { ancestors: [1, 2], depth: 2 })).toBe('cycle');
    expect(embedRefusal(1, { ancestors: [1], depth: 1 })).toBe('cycle');
    expect(embedRefusal(Number.NaN, { ancestors: [], depth: 1 })).toBe('invalid');
    expect(embedRefusal(MAX_PAGE_ID + 1, { ancestors: [], depth: 1 })).toBe('invalid');
  });

  it('renders at most 20 embeds per page view and gives places back on unmount', () => {
    expect(MAX_EMBEDS_PER_PAGE).toBe(20);
    const budget = createEmbedBudget();
    const keys = Array.from({ length: 25 }, (_, i) => `e${i}`);
    const granted = keys.map((key) => budget.claim(key));
    expect(granted.filter(Boolean)).toHaveLength(20);
    expect(granted.slice(20)).toEqual([false, false, false, false, false]);
    // Asking again keeps the same answer.
    expect(budget.claim('e3')).toBe(true);
    expect(budget.claim('e21')).toBe(false);
    budget.release('e0');
    expect(budget.claim('e21')).toBe(true);
  });

  it('caps the content sent for one embedded page, at a line break when there is one', () => {
    expect(truncateEmbedContent('short')).toEqual({ content: 'short', truncated: false });
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i} ![[page:${i + 1}]]`).join('\n');
    const { content, truncated } = truncateEmbedContent(lines);
    expect(truncated).toBe(true);
    expect(content.length).toBeLessThanOrEqual(MAX_EMBED_CONTENT_CHARS);
    expect(lines.startsWith(content)).toBe(true);
    expect(lines[content.length]).toBe('\n'); // cut before a line break, no half token
    // One long line: a hard cut, never inside a surrogate pair.
    const emoji = '😀'.repeat(MAX_EMBED_CONTENT_CHARS);
    const cut = truncateEmbedContent(emoji).content;
    expect(cut.length).toBeLessThanOrEqual(MAX_EMBED_CONTENT_CHARS);
    expect(cut.length % 2).toBe(0);
    expect(cut).toBe('😀'.repeat(cut.length / 2));
  });
});

describe('hostile embed input stays linear', () => {
  const BOUND_MS = 2000;
  const timed = (run: () => unknown) => {
    const started = performance.now();
    run();
    return performance.now() - started;
  };

  it('parses long runs of embed-like text quickly', () => {
    const inputs = [
      '![[page:1]]\n'.repeat(50_000),
      `${'!'.repeat(200_000)}[[page:1]]`,
      `${'![['.repeat(100_000)}page:1`,
      `${' '.repeat(200_000)}![[page:1]]`,
      `a\n${`${' '.repeat(50)}![[page:1]]x\n`.repeat(20_000)}`,
    ];
    for (const input of inputs) {
      expect(timed(() => markdownToBlocks(input))).toBeLessThan(BOUND_MS);
      expect(timed(() => extractPageLinkIds(input))).toBeLessThan(BOUND_MS);
      expect(timed(() => splitPageLinks(input))).toBeLessThan(BOUND_MS);
      expect(timed(() => truncateEmbedContent(input))).toBeLessThan(BOUND_MS);
    }
    expect(markdownToBlocks('![[page:1]]\n'.repeat(50_000))).toHaveLength(50_000);
  });

  it('renders a page of many embed lines quickly', async () => {
    const started = performance.now();
    const html = await markdownToHtml('![[page:1]]\n'.repeat(5000));
    expect(performance.now() - started).toBeLessThan(5000);
    expect(html.match(/data-page-embed/g)).toHaveLength(5000);
  });
});
