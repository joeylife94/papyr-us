import { describe, expect, it } from 'vitest';
import {
  countTags,
  extractInlineTags,
  isInTagTree,
  isTagBoundary,
  MAX_TAG_DEPTH,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_PAGE,
  normalizeTag,
  pageTags,
  readTagName,
  tagAncestors,
} from '../../shared/tags';
import { markdownToHtml } from '../../client/src/lib/markdown';
import { parseInlineMarkdown, type InlineNode } from '../../client/src/lib/inline-markdown';

// Issue #137: the tag pane counts the tags the chips show. The grammar is shared by the editor
// preview, the reader and the server (shared/tags.ts); the server reads a page's Markdown
// without rendering it, so these tests hold its result to what the reader links.

/** The tags the reader renders as chips, distinct, in order. */
async function readerTags(markdown: string): Promise<string[]> {
  const html = await markdownToHtml(markdown);
  const tags = Array.from(html.matchAll(/data-inline-tag="([^"]*)"/g), (match) =>
    match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  );
  return Array.from(new Set(tags));
}

function previewTags(text: string): string[] {
  const tags: string[] = [];
  const walk = (nodes: InlineNode[]) => {
    for (const node of nodes) {
      if (node.type === 'tag') tags.push(node.tag);
      else if ('children' in node) walk(node.children);
    }
  };
  walk(parseInlineMarkdown(text));
  return Array.from(new Set(tags));
}

describe('tag grammar (shared)', () => {
  it('starts a tag only at the start of the text or after a boundary character', () => {
    expect(isTagBoundary(undefined)).toBe(true);
    for (const char of [' ', '\n', '\t', '(', '[', '"', '*', '_', '~', ',', ';', '>', '|', '「']) {
      expect(isTagBoundary(char)).toBe(true);
    }
    for (const char of ['a', '가', '1', '/', '&', ']', ')', '#', '.', '-']) {
      expect(isTagBoundary(char)).toBe(false);
    }
  });

  it('reads letters, digits, marks, _, - and / with at least one letter', () => {
    expect(readTagName('#회의 x', 0)).toBe('회의');
    expect(readTagName('#project/q3-plan.', 0)).toBe('project/q3-plan');
    expect(readTagName('#2024년', 0)).toBe('2024년');
    expect(readTagName('#a_b', 0)).toBe('a_b');
    expect(readTagName('#113', 0)).toBeNull();
    expect(readTagName('# heading', 0)).toBeNull();
    expect(readTagName('##x', 0)).toBeNull();
    expect(readTagName('x#y', 1, 2)).toBeNull();
  });

  it('is the grammar the editor preview uses', async () => {
    const { isTagBoundary: previewBoundary, readTagName: previewRead } = await import(
      '../../client/src/lib/inline-markdown'
    );
    expect(previewBoundary).toBe(isTagBoundary);
    expect(previewRead).toBe(readTagName);
  });
});

describe('inline tags of Markdown content', () => {
  // Each case: Markdown, then the tags the reader links (and the server must find).
  const cases: Array<[string, string[]]> = [
    ['#회의 and **#bold** text', ['회의', 'bold']],
    ['## Plan #draft', ['draft']],
    ['# Title #', []],
    ['- #a\n\n> #b\n\n1. #c', ['a', 'b', 'c']],
    ['- [ ] #todo item\n- [x] #done', ['todo', 'done']],
    ['| x |\n|---|\n| #cell |', ['cell']],
    ['#project/alpha and #project/beta', ['project/alpha', 'project/beta']],
    ['issue #113 and C#sharp and a#b', []],
    ['\\#escaped and &#35;entity and &num;named', []],
    ['&amp;#after-entity', ['after-entity']],
    ['`#code` and ``#co`de`` and #real', ['real']],
    ['```\n#fenced\n```\n\n#after', ['after']],
    ['~~~js\n#tilde\n~~~', []],
    ['````\n```\n#still-code\n```\n````\n#out', ['out']],
    ['> ```\n> #quoted-code\n> ```\n> #quoted', ['quoted']],
    ['- item\n\n  ```\n  #listed-code\n  ```\n- #listed', ['listed']],
    ['text\n\n    #indented code\n\n#after', ['after']],
    ['- item\n\n    #continuation', ['continuation']],
    ['[#linked](https://x.y) [x](#anchor) ![#alt](/i.png)', []],
    ['[x](/y)#after-link and (#paren) "#quoted"', ['paren', 'quoted']],
    ['[#not a link] and [a [#nested](u)]', ['not']],
    ['[text](<dest #a> "title #b") #c', ['c']],
    ['https://x.y/#frag and www.x.y/#frag', []],
    ['<span>#in-html</span>', ['in-html']],
    ['line one #a\nline two #b', ['a', 'b']],
    ['**a**#strong-before and _#em_', ['strong-before', 'em']],
    ['[[page:12]] #after-page-link', ['after-page-link']],
    ['#a #a #b', ['a', 'b']],
  ];

  it.each(cases)('%j', async (markdown, expected) => {
    expect(extractInlineTags(markdown)).toEqual(expected);
    expect(await readerTags(markdown)).toEqual(expected);
  });

  it('finds the tags the editor preview shows in a block', () => {
    for (const text of ['#회의 **#bold** `#code` [#x](y) \\#no (#yes) a#b', '_#em_ ~~#del~~']) {
      expect(extractInlineTags(text)).toEqual(previewTags(text));
    }
  });

  it('stops at the limit and returns distinct names', () => {
    const many = Array.from({ length: 300 }, (_, i) => `#t${i}a`).join(' ');
    const tags = extractInlineTags(many);
    expect(tags).toHaveLength(MAX_TAGS_PER_PAGE);
    expect(tags[0]).toBe('t0a');
    expect(extractInlineTags(many, 3)).toEqual(['t0a', 't1a', 't2a']);
    expect(extractInlineTags('')).toEqual([]);
    expect(extractInlineTags(null as unknown as string)).toEqual([]);
  });
});

describe('tag pane keys', () => {
  it('normalizes a leading #, surrounding space and empty segments', () => {
    expect(normalizeTag('#todo')).toBe('todo');
    expect(normalizeTag('  project / alpha ')).toBe('project/alpha');
    expect(normalizeTag('project//alpha/')).toBe('project/alpha');
    expect(normalizeTag('/x')).toBe('x');
    expect(normalizeTag('Plan')).toBe('Plan');
    expect(normalizeTag('my tag')).toBe('my tag');
    for (const empty of ['', '   ', '#', '/', '#//', null, undefined, 3, ['a']]) {
      expect(normalizeTag(empty)).toBeNull();
    }
  });

  it('leaves out tags longer or deeper than the pane lists', () => {
    expect(normalizeTag('a'.repeat(MAX_TAG_LENGTH))).toBe('a'.repeat(MAX_TAG_LENGTH));
    expect(normalizeTag('a'.repeat(MAX_TAG_LENGTH + 1))).toBeNull();
    const deep = Array.from({ length: MAX_TAG_DEPTH }, () => 'a').join('/');
    expect(normalizeTag(deep)).toBe(deep);
    expect(normalizeTag(`${deep}/a`)).toBeNull();
  });

  it('lists a tag with every parent and tells what nests under a tag', () => {
    expect(tagAncestors('a/b/c')).toEqual(['a', 'a/b', 'a/b/c']);
    expect(tagAncestors('solo')).toEqual(['solo']);
    expect(isInTagTree('project', 'project')).toBe(true);
    expect(isInTagTree('project/alpha', 'project')).toBe(true);
    expect(isInTagTree('projects', 'project')).toBe(false);
    expect(isInTagTree('project', 'project/alpha')).toBe(false);
  });

  it("merges a page's field tags and content tags, normalized and distinct", () => {
    expect(pageTags(['#Plan', 'project/alpha', '', 7], '#project/alpha #idea `#no`')).toEqual([
      'Plan',
      'project/alpha',
      'idea',
    ]);
    expect(pageTags(null, null)).toEqual([]);
    expect(pageTags('not-an-array', '#x/')).toEqual(['x']);
    const field = Array.from({ length: 150 }, (_, i) => `f${i}`);
    expect(pageTags(field, '#extra')).toHaveLength(MAX_TAGS_PER_PAGE);
  });
});

describe('nested grouping and counts', () => {
  it('counts distinct pages per tag, a parent once per page across its children', () => {
    const { tags, truncated } = countTags(
      [
        ['project/alpha', 'project/beta'],
        ['project/alpha'],
        ['project'],
        ['idea'],
        ['project/alpha/x', 'project/alpha/x'],
      ],
      100
    );
    expect(truncated).toBe(false);
    expect(tags).toEqual([
      { name: 'project', count: 4, direct: 1 },
      { name: 'project/alpha', count: 3, direct: 2 },
      { name: 'idea', count: 1, direct: 1 },
      { name: 'project/alpha/x', count: 1, direct: 1 },
      { name: 'project/beta', count: 1, direct: 1 },
    ]);
  });

  it('cuts the list without ever dropping the parent of a tag it keeps', () => {
    const pages = [['a/b/c'], ['a/b/c'], ['z'], ['z'], ['m/n']];
    const { tags, truncated } = countTags(pages, 4);
    expect(truncated).toBe(true);
    expect(tags.map((tag) => tag.name)).toEqual(['a', 'a/b', 'a/b/c', 'z']);
    for (const tag of countTags(pages, 2).tags) {
      for (const parent of tagAncestors(tag.name)) {
        expect(countTags(pages, 2).tags.map((t) => t.name)).toContain(parent);
      }
    }
  });
});

describe('hostile input stays linear', () => {
  const BOUND_MS = 2000;
  const timed = (run: () => unknown) => {
    const started = performance.now();
    run();
    return performance.now() - started;
  };

  it.each([
    ['unmatched brackets', '['.repeat(500_000)],
    ['brackets before a far link close', `${'[a '.repeat(150_000)}](x)`],
    ['link closes without destinations', '](['.repeat(300_000)],
    ['unbalanced destinations', '[a](('.repeat(150_000)],
    [
      'backtick runs of every length',
      Array.from({ length: 900 }, (_, i) => '`'.repeat(i)).join('x'),
    ],
    ['hashes', '#'.repeat(1_000_000)],
    ['boundary hashes', '(#'.repeat(500_000)],
    ['digits after a hash', `#${'1'.repeat(1_000_000)}`],
    ['a long tag', `#${'a'.repeat(1_000_000)}`],
    ['fences', '```\n'.repeat(250_000)],
    ['quote and list markers', `${'> - '.repeat(250_000)}#x`],
    ['indented lines', `x\n\n${'    #a\n'.repeat(150_000)}`],
    ['many short blocks with a far link close', `${'[x #a\n\n'.repeat(100_000)}](y)`],
    ['entities', '&#35;'.repeat(200_000)],
  ])('%s', (_name, text) => {
    expect(timed(() => extractInlineTags(text))).toBeLessThan(BOUND_MS);
  });

  it('a long tag is left out of the pane, not cut', () => {
    expect(pageTags([], `#${'a'.repeat(10_000)} #ok`)).toEqual(['ok']);
  });
});

describe('the server finds what the reader links', () => {
  // Random Markdown from pieces the editor writes. Left out on purpose (documented in
  // shared/tags.ts): HTML, literal autolinks, escapes inside a tag name and indented code inside
  // a quote or list item.
  const pieces = [
    '#a',
    '#b_',
    '_',
    '__',
    '*',
    '**',
    '`',
    '``',
    '[',
    ']',
    '(',
    ')',
    '](',
    ' ',
    '\n',
    '\n\n',
    '> ',
    '- ',
    '1. ',
    '```',
    '~~~',
    '&#35;',
    '&amp;',
    'x',
    '#',
    '!',
    '"',
    '~~',
    '#c/d',
    '|',
    '#가',
    '# ',
    '---',
    '\\#',
    '\\*',
    '\t',
  ];

  it('on generated Markdown', async () => {
    let seed = 20261107;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const mismatches: string[] = [];
    for (let n = 0; n < 1500; n++) {
      let text = '';
      const length = 2 + Math.floor(random() * 10);
      for (let i = 0; i < length; i++) text += pieces[Math.floor(random() * pieces.length)];
      const server = [...extractInlineTags(text)].sort();
      const reader = [...(await readerTags(text))].sort();
      if (JSON.stringify(server) !== JSON.stringify(reader)) {
        mismatches.push(`${JSON.stringify(text)}: ${server} vs ${reader}`);
      }
    }
    expect(mismatches).toEqual([]);
  }, 60_000);
});
