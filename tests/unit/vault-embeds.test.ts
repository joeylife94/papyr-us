import { describe, expect, it } from 'vitest';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import {
  buildVaultEntries,
  contentWithLinkTitles,
  outsideLinkIds,
  singlePageMarkdown,
  type VaultExportRow,
} from '../../server/services/vault-export';
import {
  normalizeVaultPath,
  planVaultImport,
  renderImportedBodies,
  type VaultSourceFile,
} from '../../server/services/vault-import';
import {
  pageLinkTokenIds,
  parseFrontmatter,
  renderPageLinkTokens,
  replaceWikiLinks,
} from '../../server/services/vault-format';
import { createZip, readZip } from '../../server/services/zip';

// Page embeds at the vault boundary (#135): `![[page:<id>]]` is written `![[Name]]` for a page in
// the export and like a link otherwise (title or "접근할 수 없는 페이지"), never with the
// embedded page's content; `![[Name]]`, `![[Name|alias]]` and `![[path/Name]]` import as embed
// tokens. Code keeps its text in both directions.

const row = (id: number, title: string, parentId: number | null, content = ''): VaultExportRow => ({
  id,
  title,
  slug: `p${id}`,
  icon: null,
  parentId,
  position: null,
  createdAt: new Date(Date.UTC(2026, 0, 1)),
  updatedAt: new Date(Date.UTC(2026, 1, 1)),
  content,
  tags: [],
});

const text = (data: Buffer | string) => (typeof data === 'string' ? data : data.toString('utf8'));
const bodyOf = (data: Buffer | string) => parseFrontmatter(text(data)).body;

const source = (path: string, content: string): VaultSourceFile => {
  const data = Buffer.from(content);
  const segments = normalizeVaultPath(path);
  return { path: segments.join('/'), segments, size: data.length, read: () => data };
};

describe('embed tokens on export', () => {
  it('hands the renderer whole embed tokens, outside code only', () => {
    const content =
      'A ![[page:1]] [[page:2]]\n`![[page:3]]`\n```\n![[page:4]]\n```\n> ~~~\n> ![[page:5]]\n> ~~~';
    expect(renderPageLinkTokens(content, (id, embed) => `<${embed ? 'E' : 'L'}${id}>`)).toBe(
      'A <E1> <L2>\n`![[page:3]]`\n```\n![[page:4]]\n```\n> ~~~\n> ![[page:5]]\n> ~~~'
    );
    expect(pageLinkTokenIds(content)).toEqual([1, 2]);
  });

  it('writes ![[Name]] in the vault, a title or the label outside it, never the content', () => {
    const rows = [
      row(1, 'Home', null, 'Intro\n\n![[page:2]]\n\n![[page:50]]\n\n![[page:60]]\n\n`![[page:2]]`'),
      row(2, 'Plan', null, 'Secret plan body'),
    ];
    expect(outsideLinkIds(rows)).toEqual([50, 60]);
    const [home] = buildVaultEntries(rows, new Map([[50, 'Readable elsewhere']]));
    expect(bodyOf(home.data)).toBe(
      'Intro\n\n![[Plan]]\n\nReadable elsewhere\n\n접근할 수 없는 페이지\n\n`![[page:2]]`\n'
    );
    expect(text(home.data)).not.toContain('Secret plan body');
  });

  it('renders an embed as a link with the title in the single-page export', () => {
    const markdown = singlePageMarkdown(
      {
        ...row(1, 'Page', null, 'A\n\n![[page:2]]\n\n![[page:3]]'),
        author: 'me@example.com',
        folder: 'docs',
      },
      new Map([[2, 'Plan']])
    );
    expect(parseFrontmatter(markdown).body).toBe('A\n\n[[Plan]]\n\n접근할 수 없는 페이지');
  });

  it('renders an embed as the escaped title in the HTML export', async () => {
    const markdown = contentWithLinkTitles('![[page:2]]\n\n![[page:3]]', new Map([[2, '*Plan*']]));
    const html = String(
      await remark().use(remarkGfm).use(remarkRehype).use(rehypeStringify).process(markdown)
    );
    expect(html).toBe('<p>*Plan*</p>\n<p>접근할 수 없는 페이지</p>');
  });
});

describe('embeds on import', () => {
  it('replaces embeds only when asked, outside code', () => {
    const content = '![[A]] [[B]] `![[C]]`\n```\n![[D]]\n```';
    expect(replaceWikiLinks(content, (link) => `{${link.target}}`)).toBe(
      '![[A]] {B} `![[C]]`\n```\n![[D]]\n```'
    );
    expect(
      replaceWikiLinks(
        content,
        (link) => `{${link.target}}`,
        (link, written) => `<${link.target}|${written}>`
      )
    ).toBe('<A|![[A]]> {B} `![[C]]`\n```\n![[D]]\n```');
  });

  it('resolves ![[Title]], ![[Title|alias]] and ![[path/Title]] to embed tokens', () => {
    const plan = planVaultImport([
      source(
        'Home.md',
        [
          '![[Plan]]',
          '![[Plan|shown]]',
          '![[Area/Plan]]',
          '![[Existing]]',
          '![[Plan#Goals]]',
          '![[image.png]]',
          '![[Missing]]',
          '`![[Plan]]`',
          '```',
          '![[Plan]]',
          '```',
        ].join('\n')
      ),
      source('Area/Plan.md', 'plan body'),
    ]);
    const ids = [101, 102, 103]; // Area (folder page), Area/Plan, Home
    const { contents, unresolved } = renderImportedBodies(
      plan,
      [{ id: 7, title: 'Existing' }],
      ids
    );
    expect(contents[2].split('\n')).toEqual([
      '![[page:102]]',
      '![[page:102]]',
      '![[page:102]]',
      '![[page:7]]',
      // Embedding part of a page is not supported: a link to the page instead.
      '[[page:102]]',
      // Attachments and missing notes stay as written.
      '![[image.png]]',
      '![[Missing]]',
      '`![[Plan]]`',
      '```',
      '![[Plan]]',
      '```',
    ]);
    // A missing note is reported; an attachment is not (its file is reported as skipped).
    expect(unresolved).toEqual([{ path: 'Home.md', target: 'Missing' }]);
  });

  it('round-trips embeds through export, zip and import', () => {
    const rows = [
      row(1, 'Hub', null, 'Top\n\n![[page:2]]\n\nSee [[page:2]]'),
      row(2, 'Plan', null, 'Body'),
    ];
    const archive = createZip(buildVaultEntries(rows, new Map()));
    const files = readZip(archive, { maxEntries: 500, maxTotalUncompressed: 20 * 1024 * 1024 })
      .filter((entry) => !entry.isDirectory)
      .map((entry) => {
        const segments = normalizeVaultPath(entry.name);
        return { path: segments.join('/'), segments, size: entry.size, read: entry.read };
      });
    const plan = planVaultImport(files);
    const ids = plan.pages.map((_, index) => 900 + index);
    const { contents, unresolved } = renderImportedBodies(plan, [], ids);
    const at = (title: string) => plan.pages.findIndex((page) => page.title === title);
    const planId = ids[at('Plan')];
    expect(contents[at('Hub')]).toBe(`Top\n\n![[page:${planId}]]\n\nSee [[page:${planId}]]\n`);
    expect(unresolved).toEqual([]);
  });
});
