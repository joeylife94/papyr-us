import { describe, expect, it } from 'vitest';
import { matchMarkdownShortcut } from '../../client/src/lib/markdown-shortcuts';

// Issue #111 §6: typing a Markdown prefix at the start of a paragraph converts the block.
// `type(previous, char, at)` is the input event the textarea reports when `char` is typed at
// offset `at` of `previous`: the new text and the caret after it.
const type = (previous: string, char: string, at = previous.length) =>
  matchMarkdownShortcut(previous, previous.slice(0, at) + char + previous.slice(at), at + 1);

describe('matchMarkdownShortcut', () => {
  it.each([
    ['#', ' ', 'heading1', '# '],
    ['##', ' ', 'heading2', '## '],
    ['###', ' ', 'heading3', '### '],
    ['-', ' ', 'bulleted_list', '- '],
    ['*', ' ', 'bulleted_list', '* '],
    ['1.', ' ', 'numbered_list', '1. '],
    ['[]', ' ', 'checkbox', '[] '],
    ['[ ]', ' ', 'checkbox', '[ ] '],
    ['>', ' ', 'quote', '> '],
    ['``', '`', 'code', '```'],
    ['--', '-', 'divider', '---'],
  ])('converts "%s" + "%s" to %s', (previous, char, blockType, prefix) => {
    expect(type(previous, char)).toEqual({ type: blockType, prefix, content: '' });
  });

  it('keeps the text after the caret as the new block content', () => {
    // "#|Title" + space → heading "Title"; "``|const x" + backtick → code "const x".
    expect(type('#Title', ' ', 1)).toEqual({ type: 'heading1', prefix: '# ', content: 'Title' });
    expect(type('``const x', '`', 2)).toEqual({
      type: 'code',
      prefix: '```',
      content: 'const x',
    });
    expect(type('-\n두 줄', ' ', 1)).toEqual({
      type: 'bulleted_list',
      prefix: '- ',
      content: '\n두 줄',
    });
  });

  it('converts `---` to a divider only in an otherwise empty paragraph (#113)', () => {
    // A divider has no text, so text after the caret keeps the paragraph as it is.
    expect(type('--', '-')).toEqual({ type: 'divider', prefix: '---', content: '' });
    expect(type('--text', '-', 2)).toBeNull();
    expect(type('-- ', '-', 2)).toBeNull();
    expect(type('--\nmore', '-', 2)).toBeNull();
    expect(type('a--', '-')).toBeNull();
    expect(type('---', '-')).toBeNull();
    // Pasting the whole rule is not typing it.
    expect(matchMarkdownShortcut('', '---', 3)).toBeNull();
  });

  it('does not convert a prefix that is not at the very start of the block', () => {
    expect(type('a#', ' ')).toBeNull();
    expect(type(' #', ' ')).toBeNull();
    expect(type('line\n#', ' ')).toBeNull();
    expect(type('Title #', ' ')).toBeNull();
  });

  it('does not convert when the caret is not right after the prefix', () => {
    // A space typed after other text that follows the prefix.
    expect(type('# Title', ' ')).toBeNull();
    expect(type('#a', ' ')).toBeNull();
  });

  it('only converts on the input that completes the prefix', () => {
    // Deleting back to a prefix ("# x" → "# ") is not typing it.
    expect(matchMarkdownShortcut('# x', '# ', 2)).toBeNull();
    // Pasting several characters at once.
    expect(matchMarkdownShortcut('', '# ', 2)).toBeNull();
    expect(matchMarkdownShortcut('', '- 항목', 4)).toBeNull();
    // Replacing a selection keeps the length but changes the text.
    expect(matchMarkdownShortcut('ab', '# ', 2)).toBeNull();
  });

  it('ignores text that is not a shortcut', () => {
    expect(type('', ' ')).toBeNull();
    expect(type('#', '#')).toBeNull();
    expect(type('-', '-')).toBeNull();
    expect(type('2.', ' ')).toBeNull();
    expect(type('[x]', ' ')).toBeNull();
    expect(type('`', '`')).toBeNull();
    expect(type('####', ' ')).toBeNull();
  });
});
