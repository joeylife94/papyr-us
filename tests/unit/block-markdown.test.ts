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

  it('writes bare markers for empty structural blocks', () => {
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
    ).toBe(['##', '-', 'x', '- [ ]', 'y', '>', '```\n```'].join('\n\n'));
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

  it('keeps continuation lines, nested items and lazy lines in their item or quote', () => {
    expect(
      essence(markdownToBlocks('- parent\n  - child\n  more\n\n  after blank\nlazy\n- next'))
    ).toEqual([
      { type: 'bulleted_list', content: 'parent\n- child\nmore\n\nafter blank\nlazy' },
      { type: 'bulleted_list', content: 'next' },
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

describe('round trip', () => {
  it('markdownToBlocks(blocksToMarkdown(blocks)) keeps types, text, checked and language', () => {
    const next = random(113);
    for (let run = 0; run < 400; run++) {
      const blocks = Array.from({ length: 1 + Math.floor(next() * 8) }, () => randomBlock(next));
      const markdown = blocksToMarkdown(blocks);
      expect(essence(markdownToBlocks(markdown)), markdown).toEqual(essence(blocks));
    }
  });

  it('derived Markdown is a fixed point: deriving the parsed blocks gives it back', () => {
    const next = random(7);
    for (let run = 0; run < 200; run++) {
      const blocks = Array.from({ length: 1 + Math.floor(next() * 8) }, () => randomBlock(next));
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
