import { describe, expect, it } from 'vitest';
import {
  hasInlineMarkup,
  isTagBoundary,
  parseInlineMarkdown,
  readTagName,
  tagHref,
  type InlineNode,
} from '../../client/src/lib/inline-markdown';

// Issue #113 §2: the editor's live preview renders a block's inline Markdown from this tokenizer.
// The tree is rendered as React elements, never as HTML.

/** A compact, offset-free view of the tree: strings for text, tuples for the rest. */
type Shape = string | [string, ...unknown[]];
function shape(nodes: InlineNode[]): Shape[] {
  return nodes.map((node): Shape => {
    switch (node.type) {
      case 'text':
        return node.text;
      case 'code':
        return ['code', node.text];
      case 'link':
        return ['link', node.href, ...shape(node.children)];
      case 'pageLink':
        return ['page', node.pageId];
      case 'tag':
        return ['tag', node.tag];
      default:
        return [node.type, ...shape(node.children)];
    }
  });
}
const parse = (text: string) => shape(parseInlineMarkdown(text));

describe('parseInlineMarkdown', () => {
  it('parses the inline syntax a text block holds', () => {
    expect(parse('**굵게** _기울임_ `code` [링크](https://example.com) #태그')).toEqual([
      ['strong', '굵게'],
      ' ',
      ['em', '기울임'],
      ' ',
      ['code', 'code'],
      ' ',
      ['link', 'https://example.com', '링크'],
      ' ',
      ['tag', '태그'],
    ]);
  });

  it.each([
    ['**a**', [['strong', 'a']]],
    ['__a__', [['strong', 'a']]],
    ['*a*', [['em', 'a']]],
    ['_a_', [['em', 'a']]],
    ['~~a~~', [['strike', 'a']]],
    ['***a***', [['em', ['strong', 'a']]]],
    ['a*b*c', ['a', ['em', 'b'], 'c']],
  ])('emphasis %s', (text, expected) => {
    expect(parse(text)).toEqual(expected);
  });

  it('nests emphasis', () => {
    expect(parse('*a **b** c*')).toEqual([['em', 'a ', ['strong', 'b'], ' c']]);
    expect(parse('**a _b_ c**')).toEqual([['strong', 'a ', ['em', 'b'], ' c']]);
    expect(parse('**[x](/p) `y`**')).toEqual([['strong', ['link', '/p', 'x'], ' ', ['code', 'y']]]);
  });

  it.each([
    '**unclosed',
    'a ** b ** c',
    '2 * 3 * 4',
    'snake_case_name',
    '~single~',
    '`unclosed',
    '[text](unclosed',
    '[text] (spaced)',
    '[[Title]]',
    '#',
    '# heading text',
    '##',
    '#113',
    'a#b',
    'https://example.com/#frag',
    '&#35;x',
  ])('keeps %s literal', (text) => {
    const nodes = parseInlineMarkdown(text);
    expect(shape(nodes)).toEqual([text]);
    expect(hasInlineMarkup(nodes, text)).toBe(false);
  });

  it('treats a backslash before punctuation as an escape', () => {
    expect(parse('\\*not em\\*')).toEqual(['*not em', '*']);
    expect(parse('\\#tag and \\[x](y)')).toEqual(['#tag and ', '[x](y)']);
    expect(parse('\\`code\\`')).toEqual(['`code', '`']);
    // Not before other characters: a Windows path keeps its backslashes.
    expect(parse('C:\\Users\\me')).toEqual(['C:\\Users\\me']);
    expect(hasInlineMarkup(parseInlineMarkdown('\\*'), '\\*')).toBe(true);
  });

  it('parses nothing inside code', () => {
    expect(parse('`**a** #tag [x](y) [[page:3]]`')).toEqual([
      ['code', '**a** #tag [x](y) [[page:3]]'],
    ]);
    expect(parse('``a ` b``')).toEqual([['code', 'a ` b']]);
    expect(parse('` a `')).toEqual([['code', 'a']]);
    expect(parse('*a `*` b*')).toEqual([['em', 'a ', ['code', '*'], ' b']]);
  });

  it('turns page link tokens into chips, also inside emphasis', () => {
    expect(parse('See [[page:12]] and **[[page:3]]**')).toEqual([
      'See ',
      ['page', 12],
      ' and ',
      ['strong', ['page', 3]],
    ]);
    // Ten digits, like the reader's pattern: the editor and the reader agree on what a chip is.
    expect(parse('[[page:1234567890]]')).toEqual([['page', 1234567890]]);
  });

  it('keeps only safe link URLs', () => {
    expect(parse('[x](javascript:alert(1))')).toEqual([['link', null, 'x']]);
    expect(parse('[x](JAVA\tSCRIPT:alert(1))')).toEqual(['[x](JAVA\tSCRIPT:alert(1))']);
    expect(parse('[x](&#106;avascript:alert(1))')).toEqual([['link', null, 'x']]);
    expect(parse('[x](javascript&colon;alert(1))')).toEqual([['link', null, 'x']]);
    expect(parse('[x](data:text/html,hi)')).toEqual([['link', null, 'x']]);
    expect(parse('[x](mailto:team@example.com)')).toEqual([
      ['link', 'mailto:team@example.com', 'x'],
    ]);
    expect(parse('[x](/page/a "Title")')).toEqual([['link', '/page/a', 'x']]);
    expect(parse('[x](<a b>)')).toEqual([['link', 'a b', 'x']]);
    expect(parse('[x](https://e.com/a_(b))')).toEqual([['link', 'https://e.com/a_(b)', 'x']]);
  });

  it('does not nest links, chips or tags inside link text', () => {
    expect(parse('[**a** #b [[page:1]]](https://x.y)')).toEqual([
      ['link', 'https://x.y', ['strong', 'a'], ' #b [[page:1]]'],
    ]);
  });

  it('shows images as written', () => {
    expect(parse('![alt](/a.png) *b*')).toEqual(['![alt](/a.png) ', ['em', 'b']]);
  });

  it('reads tags with Unicode letters, digits, _, - and /', () => {
    expect(parse('#회의 #project/q3-plan #a_b #2024년')).toEqual([
      ['tag', '회의'],
      ' ',
      ['tag', 'project/q3-plan'],
      ' ',
      ['tag', 'a_b'],
      ' ',
      ['tag', '2024년'],
    ]);
    expect(parse('(#tag), "#quoted" **#bold**')).toEqual([
      '(',
      ['tag', 'tag'],
      '), "',
      ['tag', 'quoted'],
      '" ',
      ['strong', ['tag', 'bold']],
    ]);
    expect(parse('[x](y)#no [[page:1]]#no')).toEqual([
      ['link', 'y', 'x'],
      '#no ',
      ['page', 1],
      '#no',
    ]);
  });

  it('records source offsets for placing the caret', () => {
    const nodes = parseInlineMarkdown('a **bc** \\*d `e`');
    expect(nodes).toEqual([
      { type: 'text', text: 'a ', from: 0 },
      { type: 'strong', children: [{ type: 'text', text: 'bc', from: 4 }] },
      { type: 'text', text: ' ', from: 8 },
      { type: 'text', text: '*d ', from: 10 },
      { type: 'code', text: 'e', from: 14 },
    ]);
  });

  it('stays fast on hostile input', () => {
    const started = performance.now();
    for (const text of [
      '['.repeat(20000),
      '*a '.repeat(7000),
      '_a '.repeat(7000),
      '~~a '.repeat(5000),
    ]) {
      parseInlineMarkdown(text);
    }
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('tags', () => {
  it('needs a boundary before the #', () => {
    expect(isTagBoundary(undefined)).toBe(true);
    expect(isTagBoundary(' ')).toBe(true);
    expect(isTagBoundary('\n')).toBe(true);
    expect(isTagBoundary('(')).toBe(true);
    expect(isTagBoundary('a')).toBe(false);
    expect(isTagBoundary('가')).toBe(false);
    expect(isTagBoundary('/')).toBe(false);
    expect(isTagBoundary('&')).toBe(false);
    expect(isTagBoundary(']')).toBe(false);
  });

  it('reads a name with at least one letter', () => {
    expect(readTagName('#태그.', 0)).toBe('태그');
    expect(readTagName('#113', 0)).toBeNull();
    expect(readTagName('# x', 0)).toBeNull();
    expect(readTagName('x', 0)).toBeNull();
  });

  it('links to the tag filter of the document list', () => {
    expect(tagHref('태그')).toBe('/?tag=%ED%83%9C%EA%B7%B8');
    expect(tagHref('a/b&c')).toBe('/?tag=a%2Fb%26c');
  });
});
