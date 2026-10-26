import { describe, expect, it } from 'vitest';
import {
  extractHeadings,
  headingIdsByBlock,
  markdownToHtml,
  takenHeadingIdsByPart,
} from '../../client/src/lib/markdown';
import { blocksToMarkdown } from '../../shared/block-markdown';

// Issue #113 §1: once `content` carries Markdown headings, the table of contents lists them and
// every entry points at the id of a heading the reader rendered.

/** `[tag, id]` of every rendered heading, in document order. */
function renderedHeadings(html: string) {
  return Array.from(html.matchAll(/<(h[1-6])(?: id="([^"]*)")?>/g), (m) => [m[1], m[2]]);
}

describe('table of contents and reader heading ids', () => {
  const doc = [
    '# 개요',
    'Intro with a `# not heading` span.',
    '## Setup **steps** [[page:12]]',
    '```bash\n# install dependencies\nnpm ci\n```',
    '## Setup steps',
    'Plain\n===',
    '> ### Quoted heading',
    '## [[page:9]]',
    '## !!!',
    '#### Deep _one_',
  ].join('\n\n');

  it('lists the headings the reader renders, not code lines, with matching ids', async () => {
    const headings = extractHeadings(doc);
    expect(headings).toEqual([
      { id: 'heading-개요', text: '개요', level: 1 },
      { id: 'heading-setup-steps', text: 'Setup steps', level: 2 },
      { id: 'heading-setup-steps-1', text: 'Setup steps', level: 2 },
      { id: 'heading-plain', text: 'Plain', level: 1 },
      { id: 'heading-quoted-heading', text: 'Quoted heading', level: 3 },
      { id: 'heading-section', text: '!!!', level: 2 },
      { id: 'heading-deep-one', text: 'Deep one', level: 4 },
    ]);

    const html = await markdownToHtml(doc);
    // A heading that is only a link has no text: no id and no TOC entry, its chip still renders.
    expect(renderedHeadings(html)).toEqual([
      ['h1', 'heading-개요'],
      ['h2', 'heading-setup-steps'],
      ['h2', 'heading-setup-steps-1'],
      ['h1', 'heading-plain'],
      ['h3', 'heading-quoted-heading'],
      ['h2', undefined],
      ['h2', 'heading-section'],
      ['h4', 'heading-deep-one'],
    ]);
    expect(html).toContain(
      '<h2 id="heading-setup-steps">Setup <strong>steps</strong> <span data-page-link="12" class="page-link"></span></h2>'
    );
    expect(html).toContain('<h2><span data-page-link="9" class="page-link"></span></h2>');
  });

  it('leaves the footnote label its id and out of the contents', async () => {
    const content = '# Intro\n\nText[^1].\n\n[^1]: A note.\n';
    const html = await markdownToHtml(content);
    expect(html).toContain('aria-describedby="footnote-label"');
    expect(html).toContain('id="footnote-label"');
    expect(extractHeadings(content).map((heading) => heading.text)).toEqual(['Intro']);
  });

  it('finds the headings of derived block content', () => {
    const blocks = [
      { id: 'a', type: 'heading1', content: 'Title' },
      { id: 'b', type: 'paragraph', content: 'Body' },
      { id: 'c', type: 'code', content: '# comment', properties: { language: 'bash' } },
      { id: 'd', type: 'heading2', content: 'Title' },
    ];
    expect(extractHeadings(blocksToMarkdown(blocks))).toEqual([
      { id: 'heading-title', text: 'Title', level: 1 },
      { id: 'heading-title-1', text: 'Title', level: 2 },
    ]);
  });

  it('maps each heading id to the block that writes it, for the editor rows', () => {
    const blocks = [
      { id: 'p0', type: 'paragraph', content: 'Intro' },
      { id: 'h1', type: 'heading1', content: 'Plan' },
      { id: 'l1', type: 'bulleted_list', content: 'item' },
      { id: 'l2', type: 'bulleted_list', content: 'item two' },
      { id: 'p1', type: 'paragraph', content: '## Typed heading' },
      { id: 'c1', type: 'code', content: '# not a heading' },
      { id: 'h2', type: 'heading2', content: 'Plan' },
      { id: 'e', type: 'heading3', content: '' },
    ];
    expect(Object.fromEntries(headingIdsByBlock(blocks))).toEqual({
      h1: 'heading-plan',
      p1: 'heading-typed-heading',
      h2: 'heading-plan-1',
    });
    expect(headingIdsByBlock([]).size).toBe(0);
  });

  it('gives a page rendered in parts the heading ids of the whole page', async () => {
    // A page split around an inline database: the reader renders each run on its own.
    const parts = ['# Repeated\n\nbefore', '', '# Repeated\n\n## Other'];
    const whole = extractHeadings(parts.filter(Boolean).join('\n\n')).map((h) => h.id);
    expect(whole).toEqual(['heading-repeated', 'heading-repeated-1', 'heading-other']);

    const taken = takenHeadingIdsByPart(parts);
    expect(taken).toEqual([[], ['heading-repeated'], ['heading-repeated']]);
    const rendered = await Promise.all(
      parts.map((part, index) => markdownToHtml(part, { takenHeadingIds: taken[index] }))
    );
    const ids = rendered.flatMap((html) =>
      Array.from(html.matchAll(/ id="([^"]+)"/g), (m) => m[1])
    );
    expect(ids).toEqual(whole);
  });
});
