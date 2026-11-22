import { describe, expect, it } from 'vitest';
import {
  blocksToMarkdown,
  blocksToMarkdownWithRanges,
  markdownToBlocks,
  splitFrontmatter,
} from '../../shared/block-markdown';

// Issue #113 §1 (decision P2-D1): blocks derive Markdown `content`, and Markdown opens as blocks.

const block = (type: string, content = '', properties: Record<string, unknown> = {}) => ({
  id: `b_${type}_${content.length}`,
  type,
  content,
  properties,
  order: 0,
  children: [],
});

/** What the editor and server derived before Markdown fidelity: texts joined by blank lines. */
const legacyJoin = (blocks: unknown[]) =>
  blocks
    .map((b) =>
      b && typeof (b as { content?: unknown }).content === 'string'
        ? (b as { content: string }).content
        : ''
    )
    .join('\n\n');

/** The parts of a block the round trip must preserve. */
const essence = (blocks: Array<{ type: string; content: string; properties?: any }>) =>
  blocks.map((b) => ({
    type: b.type,
    content: b.content,
    ...(b.type === 'checkbox' ? { checked: !!b.properties?.checked } : {}),
    ...(b.type === 'code' && b.properties?.language ? { language: b.properties.language } : {}),
  }));

describe('blocksToMarkdown', () => {
  it('writes each structural block type as Markdown', () => {
    expect(
      blocksToMarkdown([
        block('heading1', 'Title'),
        block('heading2', 'Section'),
        block('heading3', 'Detail'),
        block('paragraph', 'Body with **bold** and [[page:7]].'),
        block('quote', 'Quoted'),
        block('code', 'const x = 1;', { language: 'typescript' }),
        block('divider'),
      ])
    ).toBe(
      [
        '# Title',
        '## Section',
        '### Detail',
        'Body with **bold** and [[page:7]].',
        '> Quoted',
        '```typescript\nconst x = 1;\n```',
        '---',
      ].join('\n\n')
    );
  });

  it('joins consecutive items of one list with single newlines and numbers each run from 1', () => {
    expect(
      blocksToMarkdown([
        block('bulleted_list', 'a'),
        block('bulleted_list', 'b'),
        block('numbered_list', 'one'),
        block('numbered_list', 'two'),
        block('numbered_list', 'three'),
        block('paragraph', 'between'),
        block('numbered_list', 'again'),
        block('checkbox', 'todo'),
        block('checkbox', 'done', { checked: true }),
      ])
    ).toBe(
      [
        '- a\n- b',
        '1. one\n2. two\n3. three',
        'between',
        '1. again',
        '- [ ] todo\n- [x] done',
      ].join('\n\n')
    );
  });

  it('switches the bullet when a to-do run follows a bulleted run, so they stay two lists', () => {
    expect(
      blocksToMarkdown([
        block('bulleted_list', 'a'),
        block('checkbox', 'b'),
        block('checkbox', 'c'),
        block('bulleted_list', 'd'),
        block('paragraph', 'p'),
        block('checkbox', 'e'),
      ])
    ).toBe(['- a', '* [ ] b\n* [ ] c', '- d', 'p', '- [ ] e'].join('\n\n'));
  });

  it('keeps multi-line text inside its block', () => {
    expect(blocksToMarkdown([block('bulleted_list', 'first\nsecond\n\nthird')])).toBe(
      '- first\n  second\n\n  third'
    );
    expect(blocksToMarkdown([block('checkbox', 'task\nnote')])).toBe('- [ ] task\n  note');
    const numbered = Array.from({ length: 10 }, (_, i) => block('numbered_list', `n${i}\nmore`));
    // Item 10 has a wider marker, so its continuation is indented further.
    expect(blocksToMarkdown(numbered).split('\n').slice(-2)).toEqual(['10. n9', '    more']);
    expect(blocksToMarkdown([block('quote', 'line one\n\nline two')])).toBe(
      '> line one\n>\n> line two'
    );
  });

  it('turns line breaks in a heading into spaces, since a Markdown heading is one line', () => {
    expect(blocksToMarkdown([block('heading2', ' Two\nlines \n')])).toBe('## Two lines');
  });

  it('writes bare markers for empty list items and quotes, and nothing for empty headings and code', () => {
    expect(
      blocksToMarkdown([
        block('heading2'),
        block('bulleted_list'),
        block('paragraph', 'x'),
        block('checkbox'),
        block('paragraph', 'y'),
        block('quote'),
        block('code'),
      ])
    ).toBe(['', '-', 'x', '- [ ]', 'y', '>', ''].join('\n\n'));
  });

  it('fences code with a longer fence than any backtick run inside it', () => {
    const code = 'echo ```\n````';
    expect(blocksToMarkdown([block('code', code, { language: 'bash' })])).toBe(
      `\`\`\`\`\`bash\n${code}\n\`\`\`\`\``
    );
  });

  it('writes only one safe word of the language into the fence', () => {
    expect(blocksToMarkdown([block('code', 'x', { language: 'js\n# injected' })])).toBe(
      '```js\nx\n```'
    );
    expect(blocksToMarkdown([block('code', 'x', { language: 'a`b' })])).toBe('```ab\nx\n```');
    expect(blocksToMarkdown([block('code', 'x', { language: 42 })])).toBe('```\nx\n```');
  });

  it('derives paragraph-only pages exactly as the legacy join', () => {
    const texts = [
      '',
      'plain',
      'two\nlines',
      '# looks like a heading',
      '- looks like a list',
      '  indented',
      '```',
      '[[page:3]] link',
      '\n\nblank lines\n\n',
    ];
    for (let size = 0; size <= texts.length; size++) {
      const blocks = texts.slice(0, size).map((text) => block('paragraph', text));
      expect(blocksToMarkdown(blocks)).toBe(legacyJoin(blocks));
    }
    // Other text-only types, typeless and malformed blocks keep the legacy derivation too.
    const mixed = [
      block('image', ''),
      block('callout', 'Note'),
      block('table'),
      { content: 'typeless' },
      { type: 'paragraph', content: 7 },
      null,
      block('math', 'x^2'),
    ];
    expect(blocksToMarkdown(mixed)).toBe(legacyJoin(mixed));
  });

  it('reports where each block sits in the document', () => {
    const { markdown, ranges } = blocksToMarkdownWithRanges([
      block('heading1', 'A'),
      block('bulleted_list', 'x'),
      block('bulleted_list', 'y'),
    ]);
    expect(ranges.map(({ start, end }) => markdown.slice(start, end))).toEqual([
      '# A',
      '- x',
      '- y',
    ]);
  });
});

describe('markdownToBlocks', () => {
  it('reads headings, lists, tasks, quotes, code and dividers', () => {
    const blocks = markdownToBlocks(
      [
        '# One',
        '## Two ##',
        '#### Deep',
        '- a',
        '* b',
        '+ c',
        '',
        '3. three',
        '4) four',
        '',
        '- [ ] open',
        '- [X] closed',
        '',
        '> quoted',
        '> more',
        '',
        '~~~python extra',
        'print(1)',
        '~~~',
        '',
        '***',
        '',
        '_ _ _',
      ].join('\n')
    );
    expect(essence(blocks)).toEqual([
      { type: 'heading1', content: 'One' },
      { type: 'heading2', content: 'Two' },
      { type: 'heading3', content: 'Deep' },
      { type: 'bulleted_list', content: 'a' },
      { type: 'bulleted_list', content: 'b' },
      { type: 'bulleted_list', content: 'c' },
      { type: 'numbered_list', content: 'three' },
      { type: 'numbered_list', content: 'four' },
      { type: 'checkbox', content: 'open', checked: false },
      { type: 'checkbox', content: 'closed', checked: true },
      { type: 'quote', content: 'quoted\nmore' },
      { type: 'code', content: 'print(1)', language: 'python' },
      { type: 'divider', content: '' },
      { type: 'divider', content: '' },
    ]);
  });

  it('keeps inline Markdown and page link tokens in the text', () => {
    expect(
      essence(markdownToBlocks('## See [[page:12]] and **this**\n\n- `code` [[page:3]]'))
    ).toEqual([
      { type: 'heading2', content: 'See [[page:12]] and **this**' },
      { type: 'bulleted_list', content: '`code` [[page:3]]' },
    ]);
  });

  it('splits everything else into verbatim paragraphs on blank lines', () => {
    const table = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    expect(
      essence(markdownToBlocks(`Intro line\nsecond line\n\n${table}\n\n    indented code`))
    ).toEqual([
      { type: 'paragraph', content: 'Intro line\nsecond line' },
      { type: 'paragraph', content: table },
      { type: 'paragraph', content: '    indented code' },
    ]);
  });

  it('reads setext headings and lets headings, quotes and lists interrupt a paragraph', () => {
    expect(essence(markdownToBlocks('Title\n===\n\nSub\n---\n\npara\n# H\npara\n- item'))).toEqual([
      { type: 'heading1', content: 'Title' },
      { type: 'heading2', content: 'Sub' },
      { type: 'paragraph', content: 'para' },
      { type: 'heading1', content: 'H' },
      { type: 'paragraph', content: 'para' },
      { type: 'bulleted_list', content: 'item' },
    ]);
    // An ordered list must start at 1 to interrupt a paragraph; `#tag` is not a heading.
    expect(essence(markdownToBlocks('In 2024\n2. not a list\n#tag'))).toEqual([
      { type: 'paragraph', content: 'In 2024\n2. not a list\n#tag' },
    ]);
  });

  it('keeps continuation lines and lazy lines in their item or quote, and nests items', () => {
    // Nesting (WP11): an item two columns in is a nested item (its own block, one level deeper);
    // text indented to a list's content, a blank line later, stays in the list.
    expect(
      markdownToBlocks('- parent\n  - child\n  more\n\n  after blank\nlazy\n- next').map(
        ({ type, content, indent }) => ({ type, content, indent })
      )
    ).toEqual([
      { type: 'bulleted_list', content: 'parent', indent: undefined },
      { type: 'bulleted_list', content: 'child\nmore\n\nafter blank\nlazy', indent: 1 },
      { type: 'bulleted_list', content: 'next', indent: undefined },
    ]);
    expect(essence(markdownToBlocks('> quote\nlazy\n\nafter'))).toEqual([
      { type: 'quote', content: 'quote\nlazy' },
      { type: 'paragraph', content: 'after' },
    ]);
  });

  it('treats an unclosed fence as code to the end and keeps C# in a heading', () => {
    expect(essence(markdownToBlocks('```\nline\n# not a heading'))).toEqual([
      { type: 'code', content: 'line\n# not a heading' },
    ]);
    expect(essence(markdownToBlocks('# C#\n\n# #'))).toEqual([
      { type: 'heading1', content: 'C#' },
      { type: 'heading1', content: '' },
    ]);
  });

  it('keeps a leading frontmatter block verbatim instead of reading it as dividers', () => {
    const md = '---\ntitle: Plan\ntags: [a]\n---\n\n# Body';
    expect(essence(markdownToBlocks(md))).toEqual([
      { type: 'paragraph', content: '---\ntitle: Plan\ntags: [a]\n---' },
      { type: 'heading1', content: 'Body' },
    ]);
    expect(splitFrontmatter(md)).toEqual({
      frontmatter: 'title: Plan\ntags: [a]',
      body: '\n# Body',
    });
    expect(splitFrontmatter('﻿---\na: 1\n...\nx').frontmatter).toBe('a: 1');
    // A document that starts with a divider is not frontmatter.
    expect(splitFrontmatter('---\n\ntext\n\n---').frontmatter).toBeNull();
    expect(essence(markdownToBlocks('---\n\ntext\n\n---'))).toEqual([
      { type: 'divider', content: '' },
      { type: 'paragraph', content: 'text' },
      { type: 'divider', content: '' },
    ]);
  });

  it('returns one empty paragraph for empty content and numbers the ids', () => {
    expect(markdownToBlocks('')).toEqual([
      {
        id: 'block_md_0',
        type: 'paragraph',
        content: '',
        properties: {},
        order: 0,
        children: [],
      },
    ]);
    expect(markdownToBlocks('  \n\n').map((b) => b.content)).toEqual(['']);
    expect(markdownToBlocks('a\n\nb', { idPrefix: 'block_seed_9' }).map((b) => b.id)).toEqual([
      'block_seed_9_0',
      'block_seed_9_1',
    ]);
  });

  it('stays linear on long pathological lines', () => {
    const long = `#${' '.repeat(50_000)}x${'#'.repeat(50_000)}`;
    const started = Date.now();
    markdownToBlocks(`${long}\n\n- ${' '.repeat(50_000)}\n\n${'-'.repeat(50_000)}a`);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

// A small seeded generator: the round trip must hold for every supported block type.
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

const WORDS = ['alpha', 'Beta', '문서', '**bold**', '`code`', '[[page:42]]', 'x_y', '#tag', 'C#'];

function sentence(next: () => number) {
  const count = 1 + Math.floor(next() * 4);
  // Start with a plain word so a line never begins with Markdown syntax.
  const words = ['word'];
  for (let i = 0; i < count; i++) words.push(WORDS[Math.floor(next() * WORDS.length)]);
  return words.join(' ');
}

function lines(next: () => number, allowBlank: boolean) {
  const count = 1 + Math.floor(next() * 3);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(allowBlank && i > 0 && i < count - 1 && next() < 0.3 ? '' : sentence(next));
  }
  return out.join('\n');
}

function randomBlock(next: () => number) {
  const kinds = [
    'paragraph',
    'heading1',
    'heading2',
    'heading3',
    'bulleted_list',
    'numbered_list',
    'checkbox',
    'quote',
    'code',
    'divider',
  ];
  const type = kinds[Math.floor(next() * kinds.length)];
  switch (type) {
    case 'paragraph':
      return block(type, lines(next, false));
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return block(type, next() < 0.1 ? '' : sentence(next));
    case 'bulleted_list':
    case 'numbered_list':
    case 'quote':
      return block(type, next() < 0.1 ? '' : lines(next, true));
    case 'checkbox':
      return block(type, next() < 0.1 ? '' : lines(next, true), { checked: next() < 0.5 });
    case 'code': {
      const code = ['# comment', '```', '', '  indented', '- not a list', 'const a = `b`;'];
      const picked = code.filter(() => next() < 0.5).join('\n');
      return block(type, picked, next() < 0.7 ? { language: 'ts' } : {});
    }
    default:
      return block(type);
  }
}

/** Empty headings and code derive nothing (#123), so the round trip leaves them out. */
const derivable = (blocks: Array<{ type: string; content: string }>) =>
  blocks.filter(
    (b) => !(/^heading[123]$/.test(b.type) || b.type === 'code') || b.content.trim() !== ''
  );

describe('round trip', () => {
  it('markdownToBlocks(blocksToMarkdown(blocks)) keeps types, text, checked and language', () => {
    const next = random(113);
    for (let run = 0; run < 400; run++) {
      const blocks = Array.from({ length: 1 + Math.floor(next() * 8) }, () => randomBlock(next));
      const markdown = blocksToMarkdown(blocks);
      // Content with nothing derivable opens as one empty paragraph, like any empty content.
      const kept = derivable(blocks);
      expect(essence(markdownToBlocks(markdown)), markdown).toEqual(
        essence(kept.length > 0 ? kept : [{ type: 'paragraph', content: '' }])
      );
    }
  });

  it('derived Markdown is a fixed point: deriving the parsed blocks gives it back', () => {
    const next = random(7);
    for (let run = 0; run < 200; run++) {
      const blocks = derivable(
        Array.from({ length: 1 + Math.floor(next() * 8) }, () => randomBlock(next))
      );
      const markdown = blocksToMarkdown(blocks);
      expect(blocksToMarkdown(markdownToBlocks(markdown))).toBe(markdown);
    }
  });

  it('imported Markdown settles after one pass', () => {
    const documents = [
      '# Title\n\nSome *text*.\n\n* one\n* two\n\n1) a\n2) b\n\n> q\nlazy\n\n```\ncode\n```',
      'Setext\n======\n\n- [x] done\n- [ ] open\n  more\n\n***\n\n| t | a |\n|---|---|',
      '---\nkey: value\n---\n\nbody\n\n####### seven hashes',
    ];
    for (const md of documents) {
      const once = blocksToMarkdown(markdownToBlocks(md));
      expect(blocksToMarkdown(markdownToBlocks(once))).toBe(once);
    }
  });
});

// WP11 (owner decision O5): nesting in the flat list. Lists and to-dos nest as Markdown lists,
// toggles as <details>, and both read back as the same blocks.
describe('nested blocks and toggles', () => {
  const nested = (
    type: string,
    content: string,
    indent = 0,
    properties: Record<string, unknown> = {}
  ) => ({ ...block(type, content, properties), ...(indent ? { indent } : {}) });

  /** The parts of a block the nesting round trip must preserve. */
  const shape = (blocks: any[]) =>
    blocks.map((b) => ({
      type: b.type,
      content: b.content,
      indent: b.indent ?? 0,
      ...(b.type === 'checkbox' ? { checked: !!b.properties?.checked } : {}),
    }));

  const roundTrip = (blocks: any[]) => markdownToBlocks(blocksToMarkdown(blocks));

  it('writes nested list items at the parent content column, two spaces per level for bullets', () => {
    expect(
      blocksToMarkdown([
        nested('bulleted_list', 'a'),
        nested('bulleted_list', 'b', 1),
        nested('checkbox', 'c', 2),
        nested('bulleted_list', 'd', 1),
        nested('bulleted_list', 'e'),
      ])
    ).toBe('- a\n  - b\n    - [ ] c\n  - d\n- e');
  });

  it('nests under a numbered item at its wider marker, and numbers each level on its own', () => {
    expect(
      blocksToMarkdown([
        nested('numbered_list', 'a'),
        nested('numbered_list', 'b', 1),
        nested('numbered_list', 'c', 1),
        nested('numbered_list', 'd'),
        nested('bulleted_list', 'e', 1),
        nested('numbered_list', 'f', 1),
      ])
    ).toBe('1. a\n   1. b\n   2. c\n2. d\n   - e\n\n   1. f');
  });

  it('writes a toggle as <details> holding its nested blocks, closed after the last one', () => {
    expect(
      blocksToMarkdown([
        nested('toggle', 'Open me'),
        nested('paragraph', 'inside', 1),
        nested('toggle', 'deeper', 1),
        nested('paragraph', 'deepest', 2),
        nested('paragraph', 'outside'),
      ])
    ).toBe(
      [
        '<details>\n<summary>Open me</summary>',
        'inside',
        '<details>\n<summary>deeper</summary>',
        'deepest',
        '</details>',
        '</details>',
        'outside',
      ].join('\n\n')
    );
    expect(blocksToMarkdown([nested('toggle', 'empty')])).toBe(
      '<details>\n<summary>empty</summary>\n\n</details>'
    );
  });

  it('escapes markup in a toggle summary and keeps it on one line', () => {
    const md = blocksToMarkdown([nested('toggle', '<script>alert(1)</script> & "x"\nsecond')]);
    expect(md).toBe(
      '<details>\n<summary>&lt;script&gt;alert(1)&lt;/script&gt; &amp; "x" second</summary>\n\n</details>'
    );
    expect(md).not.toContain('<script>');
    expect(markdownToBlocks(md)[0].content).toBe('<script>alert(1)</script> & "x" second');
  });

  it('reads a summary that is already escaped literally, so text such as &lt; survives a round trip', () => {
    const blocks = [nested('toggle', 'a &lt; b &amp;amp; c')];
    expect(roundTrip(blocks)[0].content).toBe('a &lt; b &amp;amp; c');
  });

  it('round-trips lists and to-dos nested at mixed depths', () => {
    const blocks = [
      nested('paragraph', 'intro'),
      nested('bulleted_list', 'a'),
      nested('numbered_list', 'one', 1),
      nested('numbered_list', 'two', 1),
      nested('checkbox', 'todo', 2, { checked: true }),
      nested('bulleted_list', 'b', 1),
      nested('bulleted_list', 'c'),
      nested('checkbox', 'x'),
      nested('checkbox', 'y', 1),
      nested('numbered_list', 'top'),
      nested('numbered_list', 'next'),
    ];
    const back = roundTrip(blocks);
    expect(shape(back)).toEqual(shape(blocks));
    expect(blocksToMarkdown(back)).toBe(blocksToMarkdown(blocks));
    // The parent links come back too.
    expect((back[4] as any).parentId).toBe(back[3].id);
  });

  it('round-trips toggles, nested toggles and lists inside toggles', () => {
    const blocks = [
      nested('toggle', 'Q & A'),
      nested('paragraph', 'answer', 1),
      nested('bulleted_list', 'point', 1),
      nested('bulleted_list', 'sub point', 2),
      nested('toggle', 'more', 1),
      nested('heading2', 'Inside', 2),
      nested('checkbox', 'task', 2, { checked: false }),
      nested('paragraph', 'after toggles'),
      nested('toggle', 'second'),
      nested('paragraph', 'last', 1),
    ];
    const back = roundTrip(blocks);
    expect(shape(back)).toEqual(shape(blocks));
    expect(blocksToMarkdown(back)).toBe(blocksToMarkdown(blocks));
  });

  it('writes a nested block that Markdown cannot nest without its nesting, in order', () => {
    const md = blocksToMarkdown([
      nested('bulleted_list', 'a'),
      nested('paragraph', 'under a list item', 1),
      nested('bulleted_list', 'b'),
    ]);
    expect(md).toBe('- a\n\nunder a list item\n\n- b');
    expect(shape(markdownToBlocks(md)).map((b) => b.indent)).toEqual([0, 0, 0]);
  });

  it('reads nested lists written by other tools, with tabs or four-space indents', () => {
    expect(shape(markdownToBlocks('- a\n\t- b\n\t\t- c\n- d'))).toEqual([
      { type: 'bulleted_list', content: 'a', indent: 0 },
      { type: 'bulleted_list', content: 'b', indent: 1 },
      { type: 'bulleted_list', content: 'c', indent: 2 },
      { type: 'bulleted_list', content: 'd', indent: 0 },
    ]);
    expect(shape(markdownToBlocks('1. a\n    - b\n        1. c'))).toEqual([
      { type: 'numbered_list', content: 'a', indent: 0 },
      { type: 'bulleted_list', content: 'b', indent: 1 },
      { type: 'numbered_list', content: 'c', indent: 2 },
    ]);
  });

  it('keeps fenced code inside a list item as the item text', () => {
    const blocks = markdownToBlocks('- run\n  ```\n  - not an item\n  ```\n- next');
    expect(shape(blocks)).toEqual([
      { type: 'bulleted_list', content: 'run\n```\n- not an item\n```', indent: 0 },
      { type: 'bulleted_list', content: 'next', indent: 0 },
    ]);
  });

  it('leaves <details> that is not a toggle as text, and a stray closing line as text', () => {
    const html = '<details>\nplain html\n</details>';
    expect(essence(markdownToBlocks(html))).toEqual([{ type: 'paragraph', content: html }]);
    expect(essence(markdownToBlocks('</details>'))).toEqual([
      { type: 'paragraph', content: '</details>' },
    ]);
    // An opening line with other markup in the summary is not the shape the editor writes.
    const rich = '<details>\n<summary><b>x</b></summary>\n\nbody\n\n</details>';
    expect(markdownToBlocks(rich).every((b) => b.type !== 'toggle')).toBe(true);
  });

  it('reads <summary> on the same line as <details>, and an unclosed toggle to the end', () => {
    expect(shape(markdownToBlocks('<details><summary>Hi</summary>\n\nbody'))).toEqual([
      { type: 'toggle', content: 'Hi', indent: 0 },
      { type: 'paragraph', content: 'body', indent: 1 },
    ]);
  });

  it('does not read <details> inside a code fence as a toggle', () => {
    expect(
      essence(markdownToBlocks('```html\n<details>\n<summary>x</summary>\n</details>\n```'))
    ).toEqual([
      { type: 'code', content: '<details>\n<summary>x</summary>\n</details>', language: 'html' },
    ]);
  });

  it('derives text for nested blocks and for the children of a collapsed or open toggle', () => {
    const md = blocksToMarkdown([
      nested('toggle', 'Secrets'),
      nested('paragraph', 'hidden words', 1),
      nested('bulleted_list', 'nested item', 1),
    ]);
    expect(md).toContain('hidden words');
    expect(md).toContain('nested item');
    expect(md).toContain('Secrets');
  });

  it('leaves the content of pages without nesting exactly as before', () => {
    const flat = [
      block('heading1', 'T'),
      block('numbered_list', 'a'),
      block('numbered_list', 'b'),
      block('paragraph', 'p'),
      block('bulleted_list', 'c'),
      block('checkbox', 'd'),
    ];
    expect(blocksToMarkdown(flat)).toBe('# T\n\n1. a\n2. b\n\np\n\n- c\n\n* [ ] d');
  });

  it('keeps ranges pointing at each block when toggles close between them', () => {
    const blocks = [nested('toggle', 'T'), nested('heading2', 'In', 1), nested('heading2', 'Out')];
    const { markdown, ranges } = blocksToMarkdownWithRanges(blocks);
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('## In');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('## Out');
  });
});
