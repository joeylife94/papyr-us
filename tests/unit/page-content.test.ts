import { describe, expect, it } from 'vitest';
import { blocksToMarkdown } from '../../shared/page-content';
import { derivePageContent } from '../../server/services/page-save';
import { blocksToContent } from '../../client/src/lib/page-content';
import type { Block } from '../../shared/schema';

const block = (type: string, content: string, properties: Record<string, unknown> = {}) =>
  ({ id: `${type}-${content}`, type, content, properties, order: 0, children: [] }) as Block;

describe('blocksToMarkdown', () => {
  it('writes headings, checkbox and list items, and quotes as Markdown', () => {
    expect(
      blocksToMarkdown([
        block('heading1', 'Handbook'),
        block('heading2', 'Weekly rhythm'),
        block('heading3', 'Details'),
        block('checkbox', 'Review tasks'),
        block('checkbox', 'Ship it', { checked: true }),
        block('bulleted_list', 'One'),
        block('numbered_list', 'Two'),
        block('quote', 'Line a\nLine b'),
        block('paragraph', 'Plain text'),
      ])
    ).toBe(
      [
        '# Handbook',
        '## Weekly rhythm',
        '### Details',
        '- [ ] Review tasks',
        '- [x] Ship it',
        '- One',
        '1. Two',
        '> Line a\n> Line b',
        'Plain text',
      ].join('\n\n')
    );
  });

  it('fences code with its language and a fence longer than any backticks inside', () => {
    expect(blocksToMarkdown([block('code', 'const a = 1;', { language: 'ts' })])).toBe(
      '```ts\nconst a = 1;\n```'
    );
    expect(blocksToMarkdown([block('code', 'use ``` here')])).toBe('````\nuse ``` here\n````');
  });

  it('keeps multi-line items together and headings on one line', () => {
    expect(blocksToMarkdown([block('bulleted_list', 'first\nsecond')])).toBe('- first\n  second');
    expect(blocksToMarkdown([block('heading2', 'split\nheading')])).toBe('## split heading');
  });

  it('leaves paragraphs, typed heading marks and other blocks as written', () => {
    // A content-only page is seeded as one paragraph holding its Markdown.
    const seeded = '## Already markdown\n\n- item';
    expect(blocksToMarkdown([block('paragraph', seeded)])).toBe(seeded);
    expect(blocksToMarkdown([block('heading2', '## Typed marks')])).toBe('## Typed marks');
    expect(blocksToMarkdown([block('callout', 'Note'), block('math', 'x^2')])).toBe('Note\n\nx^2');
  });

  it('drops empty headings and code, and tolerates malformed input', () => {
    expect(
      blocksToMarkdown([block('heading1', '  '), block('code', ''), block('paragraph', '')])
    ).toBe('\n\n\n\n');
    expect(blocksToMarkdown([{ type: 'image' }, { content: 'x' }, null])).toBe('\n\nx\n\n');
    expect(blocksToMarkdown(undefined)).toBe('');
    expect(blocksToMarkdown({})).toBe('');
  });

  it('is what both the server and the editor derive', () => {
    const blocks = [block('heading2', 'Title'), block('checkbox', 'Do', { checked: true })];
    expect(derivePageContent(blocks)).toBe(blocksToMarkdown(blocks));
    expect(blocksToContent(blocks)).toBe(blocksToMarkdown(blocks));
  });
});
