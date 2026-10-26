import { describe, expect, it } from 'vitest';
import {
  FolderNames,
  mapOutsideCode,
  normalizeTags,
  pageLinkTokenIds,
  parseFrontmatter,
  parseWikiLink,
  renderPageLinkTokens,
  replaceWikiLinks,
  sanitizeFileName,
  serializeFrontmatter,
  wikiLinkText,
} from '../../server/services/vault-format';

// #113 P2-D2: file names, frontmatter and the link syntax at the vault boundary.

const BOM = String.fromCharCode(0xfeff);

describe('sanitizeFileName', () => {
  it('replaces characters file systems and Obsidian links reject', () => {
    expect(sanitizeFileName('Q&A: plans/ideas')).toBe('Q&A plans ideas');
    expect(sanitizeFileName('a*b?c"d<e>f|g\\h')).toBe('a b c d e f g h');
    expect(sanitizeFileName('Heading #1 [draft] ^x')).toBe('Heading 1 draft x');
    expect(sanitizeFileName('tab\there\nnew\u0000line')).toBe('tab here new line');
  });

  it('never yields hidden, relative or empty names', () => {
    expect(sanitizeFileName('.')).toBe('Untitled');
    expect(sanitizeFileName('..')).toBe('Untitled');
    expect(sanitizeFileName('...hidden')).toBe('hidden');
    expect(sanitizeFileName('  ')).toBe('Untitled');
    expect(sanitizeFileName('///')).toBe('Untitled');
    expect(sanitizeFileName('trailing dots...')).toBe('trailing dots');
    expect(sanitizeFileName('con')).toBe('con_');
    expect(sanitizeFileName('LPT1.txt')).toBe('LPT1.txt_');
  });

  it('keeps Korean and emoji, caps the length in UTF-8 bytes', () => {
    expect(sanitizeFileName('회의록 🙂')).toBe('회의록 🙂');
    const long = sanitizeFileName('가'.repeat(200));
    expect(Buffer.byteLength(long, 'utf8')).toBeLessThanOrEqual(150);
    expect(long).toBe('가'.repeat(50));
    // A cut never splits a surrogate pair.
    expect(sanitizeFileName(`${'a'.repeat(148)}🙂`)).toBe('a'.repeat(148));
  });
});

describe('FolderNames', () => {
  it('de-duplicates case-insensitively per folder', () => {
    const names = new FolderNames();
    expect(names.claim('', 'Note')).toBe('Note');
    expect(names.claim('', 'note')).toBe('note (2)');
    expect(names.claim('', 'NOTE')).toBe('NOTE (3)');
    expect(names.claim('A/', 'Note')).toBe('Note');
    expect(names.claim('', 'Note (2)')).toBe('Note (2) (2)');
  });
});

describe('frontmatter', () => {
  it('round-trips tricky strings through the serializer and the parser', () => {
    const title = 'He said "hi": \\ #not-a-comment\n---\nnext line\t ';
    const tags = ['a b', '"quoted"', "it's", '#hash', '- dash', '[x]'];
    const text = serializeFrontmatter([
      ['title', title],
      ['tags', tags],
      ['icon', '🙂'],
      ['empty', []],
    ]);
    const parsed = parseFrontmatter(`${text}Body [[Link]]\n`);
    expect(parsed.data.title).toBe(title);
    expect(parsed.data.tags).toEqual(tags);
    expect(parsed.data.icon).toBe('🙂');
    expect(parsed.data.empty).toEqual([]);
    expect(parsed.body).toBe('Body [[Link]]\n');
  });

  it('quotes every scalar so YAML reads it as a string', () => {
    const text = serializeFrontmatter([
      ['title', 'true'],
      ['papyrus_id', '12'],
    ]);
    expect(text).toBe('---\ntitle: "true"\npapyrus_id: "12"\n---\n');
  });

  it('reads plain, quoted and list values of the YAML subset', () => {
    const { data, body } = parseFrontmatter(
      [
        '---',
        'title: Plain title # comment',
        "alias: 'it''s'",
        'quoted: "a\\tb \\u00e9"',
        'tags: [one, "two, three", \'four\']',
        'list:',
        '  - first',
        '  - "second"',
        '# a comment line',
        'nested:',
        '  key: value',
        'bad: "unterminated',
        '---',
        '# Heading',
      ].join('\n')
    );
    expect(data.title).toBe('Plain title');
    expect(data.alias).toBe("it's");
    expect(data.quoted).toBe('a\tb é');
    expect(data.tags).toEqual(['one', 'two, three', 'four']);
    expect(data.list).toEqual(['first', 'second']);
    expect(data.nested).toEqual([]);
    expect(data.bad).toBeUndefined();
    expect(body).toBe('# Heading');
  });

  it('never evaluates YAML features outside the subset', () => {
    const { data } = parseFrontmatter(
      [
        '---',
        'anchor: &a value',
        'alias: *a',
        'tagged: !!python/object:os.system ls',
        'block: |',
        '  text',
        '__proto__: polluted',
        'constructor: x',
        '---',
        '',
      ].join('\n')
    );
    expect(data.anchor).toBeUndefined();
    expect(data.alias).toBeUndefined();
    expect(data.tagged).toBeUndefined();
    expect(data.block).toBeUndefined();
    expect(Object.getPrototypeOf(data)).toBeNull();
    expect(data.__proto__).toBe('polluted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('accepts CRLF, a BOM and the `...` end marker', () => {
    const parsed = parseFrontmatter(`${BOM}---\r\ntitle: Win\r\n...\r\nBody\r\n`);
    expect(parsed.data.title).toBe('Win');
    expect(parsed.body).toBe('Body\r\n');
  });

  it('treats text without a closed block as body', () => {
    expect(parseFrontmatter('---\ntitle: x\nno end').body).toBe('---\ntitle: x\nno end');
    expect(parseFrontmatter('# Just text\n').data).toEqual({});
    expect(parseFrontmatter('text\n---\ntitle: x\n---\n').body).toBe('text\n---\ntitle: x\n---\n');
  });
});

describe('normalizeTags', () => {
  it('accepts lists and strings, drops # and duplicates', () => {
    expect(normalizeTags(['#a', 'b', 'a', ' ', 'c'])).toEqual(['a', 'b', 'c']);
    expect(normalizeTags('one, two #three')).toEqual(['one', 'two', 'three']);
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(Array.from({ length: 80 }, (_, i) => `t${i}`))).toHaveLength(50);
  });
});

describe('code-aware transforms', () => {
  const upper = (text: string) => text.toUpperCase();

  it('leaves fenced blocks and inline code alone', () => {
    const text = 'a `b` c\n```js\nd\n```\ne ``f ` g`` h\n~~~\ni\n~~~\nj';
    expect(mapOutsideCode(text, upper)).toBe(
      'A `b` C\n```js\nd\n```\nE ``f ` g`` H\n~~~\ni\n~~~\nJ'
    );
  });

  it('treats an unclosed backtick as text and keeps code spans inside one paragraph', () => {
    expect(mapOutsideCode('a ` b\n\nc ` d', upper)).toBe('A ` B\n\nC ` D');
  });

  it('runs an unclosed fence to the end', () => {
    expect(mapOutsideCode('a\n```\nb', upper)).toBe('A\n```\nb');
  });

  it('leaves fences inside blockquotes and list items alone', () => {
    // An Obsidian callout is a blockquote; its code block keeps the `>` prefix.
    expect(mapOutsideCode('> [!note] a\n> ~~~\n> b\n> ~~~\n> c\nd', upper)).toBe(
      '> [!NOTE] A\n> ~~~\n> b\n> ~~~\n> C\nD'
    );
    expect(mapOutsideCode('>> ```\n>> b\n>> ```\nc', upper)).toBe('>> ```\n>> b\n>> ```\nC');
    expect(mapOutsideCode('- a\n\n    ```\n    b\n    ```\n- c', upper)).toBe(
      '- A\n\n    ```\n    b\n    ```\n- C'
    );
  });

  it('ends a fence with its blockquote or list item', () => {
    expect(mapOutsideCode('> ```\n> b\n\nc', upper)).toBe('> ```\n> b\n\nC');
    expect(mapOutsideCode('1. a\n\n    ```\n    b\n\nc', upper)).toBe(
      '1. A\n\n    ```\n    b\n\nC'
    );
  });
});

describe('page link tokens on export', () => {
  it('replaces tokens outside code only', () => {
    const text = 'See [[page:1]] and [[page:22]].\n`[[page:3]]`\n```\n[[page:4]]\n```\n';
    expect(renderPageLinkTokens(text, (id) => `<${id}>`)).toBe(
      'See <1> and <22>.\n`[[page:3]]`\n```\n[[page:4]]\n```\n'
    );
    expect(pageLinkTokenIds(`${text} [[page:1]]`)).toEqual([1, 22]);
  });

  it('keeps tokens in the code block of a callout', () => {
    expect(renderPageLinkTokens('> ~~~\n> [[page:1]]\n> ~~~\n[[page:2]]', (id) => `<${id}>`)).toBe(
      '> ~~~\n> [[page:1]]\n> ~~~\n<2>'
    );
  });

  it('collects only ids that can name a page, so lookups never see out-of-range ids', () => {
    expect(pageLinkTokenIds('[[page:9999999999]] [[page:2147483648]] [[page:5]]')).toEqual([5]);
  });
});

describe('wikilinks on import', () => {
  it('parses targets, headings and aliases', () => {
    expect(parseWikiLink('Title')).toEqual({ target: 'Title', heading: null, alias: null });
    expect(parseWikiLink('Title|alias')).toEqual({
      target: 'Title',
      heading: null,
      alias: 'alias',
    });
    expect(parseWikiLink('Title\\|alias')).toEqual({
      target: 'Title',
      heading: null,
      alias: 'alias',
    });
    expect(parseWikiLink('path/Title.md#Heading')).toEqual({
      target: 'path/Title',
      heading: 'Heading',
      alias: null,
    });
    expect(parseWikiLink('Title#^block')).toEqual({
      target: 'Title',
      heading: 'block',
      alias: null,
    });
    expect(parseWikiLink('#Local')).toEqual({ target: '', heading: 'Local', alias: null });
    expect(parseWikiLink('./Rel')).toEqual({ target: 'Rel', heading: null, alias: null });
  });

  it('replaces links outside code and leaves embeds', () => {
    const text = '[[A]] ![[B]] `[[C]]` [[D|dee]]\n```\n[[E]]\n```';
    expect(replaceWikiLinks(text, (link) => `{${link.target}}`)).toBe(
      '{A} ![[B]] `[[C]]` {D}\n```\n[[E]]\n```'
    );
    // A code sample in a callout shows the syntax; it is not a link.
    expect(replaceWikiLinks('> ~~~\n> [[F]]\n> ~~~\n> [[G]]', (link) => `{${link.target}}`)).toBe(
      '> ~~~\n> [[F]]\n> ~~~\n> {G}'
    );
  });

  it('gives the alias, else the note name, as the text of an unresolved link', () => {
    expect(wikiLinkText(parseWikiLink('a/b/Note#H|Shown'))).toBe('Shown');
    expect(wikiLinkText(parseWikiLink('a/b/Note#H'))).toBe('Note');
    expect(wikiLinkText(parseWikiLink('#Heading'))).toBe('Heading');
  });
});
