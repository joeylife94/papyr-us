import { describe, expect, it } from 'vitest';
import {
  buildVaultEntries,
  outsideLinkIds,
  singlePageMarkdown,
  vaultArchiveName,
  type VaultExportRow,
} from '../../server/services/vault-export';
import {
  VaultInputError,
  importSlugs,
  normalizeVaultPath,
  planVaultImport,
  renderImportedBodies,
  type VaultSourceFile,
} from '../../server/services/vault-import';
import { parseFrontmatter } from '../../server/services/vault-format';
import { createZip, readZip } from '../../server/services/zip';

// #113 P2-D2: vault export paths and links, import hierarchy and links, and the round trip.

const row = (
  id: number,
  title: string,
  parentId: number | null,
  content = '',
  extra: Partial<VaultExportRow> = {}
): VaultExportRow => ({
  id,
  title,
  slug: `p${id}`,
  icon: null,
  parentId,
  position: null,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, id)),
  updatedAt: new Date(Date.UTC(2026, 1, 1)),
  content,
  tags: [],
  ...extra,
});

const text = (data: Buffer | string) => (typeof data === 'string' ? data : data.toString('utf8'));

const source = (path: string, content: string | Buffer): VaultSourceFile => {
  const data = Buffer.from(content);
  const segments = normalizeVaultPath(path);
  return { path: segments.join('/'), segments, size: data.length, read: () => data };
};

describe('buildVaultEntries', () => {
  it('lays files out like the tree: a page with sub-pages also gets a folder', () => {
    const entries = buildVaultEntries(
      [
        row(1, 'Projects', null),
        row(2, 'Plan', 1),
        row(3, 'Notes', 2),
        row(4, 'Inbox', null),
        // Parent 99 is not readable (not in the rows): a root page, like the tree shows it (D4).
        row(5, 'Orphan', 99),
      ],
      new Map()
    );
    expect(entries.map((entry) => entry.name)).toEqual([
      'Projects.md',
      'Projects/Plan.md',
      'Projects/Plan/Notes.md',
      'Inbox.md',
      'Orphan.md',
    ]);
  });

  it('writes quoted frontmatter and keeps the body', () => {
    const [entry] = buildVaultEntries(
      [
        row(7, 'Say "hi": now', null, '# Heading\n\nBody', {
          tags: ['a', 'b c'],
          icon: '🙂',
        }),
      ],
      new Map()
    );
    const { data, body } = parseFrontmatter(text(entry.data));
    expect(data).toMatchObject({
      title: 'Say "hi": now',
      tags: ['a', 'b c'],
      icon: '🙂',
      created: '2026-01-01T00:00:07.000Z',
      updated: '2026-02-01T00:00:00.000Z',
      papyrus_id: '7',
    });
    expect(body).toBe('# Heading\n\nBody\n');
    expect(entry.name).toBe('Say hi now.md');
  });

  it('de-duplicates names per folder and qualifies links to repeated names', () => {
    const entries = buildVaultEntries(
      [
        row(1, 'Notes', null, 'Links: [[page:2]] [[page:4]] [[page:5]]'),
        row(2, 'notes', null),
        row(3, 'Area', null),
        row(4, 'Notes', 3),
        row(5, 'Unique', 3),
      ],
      new Map()
    );
    expect(entries.map((entry) => entry.name)).toEqual([
      'Notes.md',
      'notes (2).md',
      'Area.md',
      'Area/Notes.md',
      'Area/Unique.md',
    ]);
    expect(text(entries[0].data)).toContain('Links: [[notes (2)]] [[Area/Notes]] [[Unique]]');
  });

  it('writes readable outside titles as text and never an unreadable title', () => {
    const rows = [
      row(1, 'Home', null, 'In [[page:2]], out [[page:50]], hidden [[page:60]] `[[page:60]]`'),
    ];
    rows.push(row(2, 'Here', null));
    expect(outsideLinkIds(rows)).toEqual([50, 60]);
    const [home] = buildVaultEntries(rows, new Map([[50, 'Readable elsewhere']]));
    expect(text(home.data)).toContain(
      'In [[Here]], out Readable elsewhere, hidden 접근할 수 없는 페이지 `[[page:60]]`'
    );
  });

  it('names the archive after the scope and the date', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(vaultArchiveName(null, now)).toBe('papyrus-personal-2026-10-26.zip');
    expect(vaultArchiveName('design team', now)).toBe('papyrus-design-team-2026-10-26.zip');
  });
});

describe('singlePageMarkdown', () => {
  it('links readable pages by file name and hides the rest', () => {
    const markdown = singlePageMarkdown(
      {
        ...row(1, 'Page', null, 'A [[page:2]] B [[page:3]]', { tags: ['x'] }),
        author: 'me@example.com',
        folder: 'docs',
      },
      new Map([[2, 'Q&A: plans']])
    );
    const { data, body } = parseFrontmatter(markdown);
    expect(data).toMatchObject({
      title: 'Page',
      slug: 'p1',
      author: 'me@example.com',
      folder: 'docs',
      tags: ['x'],
      papyrus_id: '1',
    });
    expect(body).toBe('A [[Q&A plans]] B 접근할 수 없는 페이지');
  });
});

describe('normalizeVaultPath', () => {
  it('normalizes separators and dot segments', () => {
    expect(normalizeVaultPath('a//./b/c.md')).toEqual(['a', 'b', 'c.md']);
    expect(normalizeVaultPath('dir/')).toEqual(['dir']);
  });

  it.each([
    '../evil.md',
    'a/../../evil.md',
    '/etc/passwd',
    'C:/evil.md',
    'c:evil.md',
    'a\\..\\evil.md',
    'a\\b.md',
    'bad\u0000name.md',
    'line\nbreak.md',
  ])('refuses %j', (path) => {
    expect(() => normalizeVaultPath(path)).toThrow(VaultInputError);
  });
});

describe('planVaultImport', () => {
  it('rebuilds the hierarchy from folders and adds pages for bare folders', () => {
    const plan = planVaultImport([
      source('A/B.md', 'b'),
      source('A.md', 'a'),
      source('Z/Y/X.md', 'x'),
      source('C.md', 'c'),
    ]);
    expect(plan.pages.map((page) => [page.path, page.title, page.parent])).toEqual([
      ['A.md', 'A', null],
      ['A/B.md', 'B', 0],
      ['C.md', 'C', null],
      ['Z/', 'Z', null],
      ['Z/Y/', 'Y', 3],
      ['Z/Y/X.md', 'X', 4],
    ]);
    expect(plan.pages[3].body).toBe('');
  });

  it('reads title, tags and icon from frontmatter', () => {
    const plan = planVaultImport([
      source('file-name.md', '---\ntitle: "Real: title"\ntags: [a, "#b"]\nicon: 🙂\n---\nBody'),
      source('bad-icon.md', '---\nicon: not an emoji\ntags: one\n---\n'),
    ]);
    expect(plan.pages[0]).toMatchObject({ title: 'bad-icon', icon: null, tags: ['one'], body: '' });
    expect(plan.pages[1]).toMatchObject({
      title: 'Real: title',
      tags: ['a', 'b'],
      icon: '🙂',
      body: 'Body',
    });
  });

  it('skips non-Markdown, oversized, duplicate and too deep files; ignores hidden ones', () => {
    const deep = `${Array.from({ length: 32 }, (_, i) => `d${i}`).join('/')}/deep.md`;
    const plan = planVaultImport([
      source('image.png', 'png'),
      source('big.md', Buffer.alloc(1024 * 1024 + 1, 97)),
      source('Note.md', 'one'),
      source('note.md', 'two'),
      source(deep, 'deep'),
      source('.obsidian/app.json', '{}'),
      source('.trash/Old.md', 'old'),
      source('__MACOSX/._Note.md', 'junk'),
      source('folder/.DS_Store', ''),
    ]);
    expect(plan.pages.map((page) => page.path)).toEqual(['Note.md']);
    expect(plan.skipped).toEqual([
      { path: 'image.png', reason: 'not-markdown' },
      { path: 'big.md', reason: 'too-large' },
      { path: 'note.md', reason: 'duplicate' },
      { path: deep, reason: 'too-deep' },
    ]);
  });

  it('refuses an import that would create too many pages', () => {
    // 40 notes, each 30 folders deep in its own branch: 1240 pages.
    const files = Array.from({ length: 40 }, (_, i) =>
      source(`${Array.from({ length: 30 }, (_, d) => `b${i}-${d}`).join('/')}/n.md`, 'x')
    );
    expect(() => planVaultImport(files)).toThrow(VaultInputError);
  });
});

describe('renderImportedBodies', () => {
  const plan = planVaultImport([
    source(
      'Home.md',
      [
        '[[Plan]] [[plan]] [[Area/Plan|shown]] [[Plan#Goals]] [[Plan.md]]',
        '[[Existing]] [[existing page]] [[Missing|Alias]] [[Missing]] [[#Local]]',
        '`[[Plan]]` ![[Plan]] [[page:999]] [[Q&A plans]]',
      ].join('\n')
    ),
    source('Area/Plan.md', '---\ntitle: The Plan\n---\n[[The Plan]] [[home]]'),
  ]);
  const ids = [101, 102, 103]; // Area (folder page), Area/Plan, Home in plan order

  it('resolves within the import first, then the scope, else leaves text', () => {
    expect(plan.pages.map((page) => page.key)).toEqual(['Area', 'Area/Plan', 'Home']);
    const { contents, unresolved } = renderImportedBodies(
      plan,
      [
        { id: 7, title: 'Existing' },
        { id: 8, title: 'Existing Page' },
        { id: 9, title: 'Q&A: plans' },
        { id: 10, title: 'Plan' }, // the import's own Plan wins
      ],
      ids
    );
    expect(contents[2].split('\n')).toEqual([
      '[[page:102]] [[page:102]] [[page:102]] [[page:102]] [[page:102]]',
      '[[page:7]] [[page:8]] Alias Missing Local',
      '`[[Plan]]` ![[Plan]] page:999 [[page:9]]',
    ]);
    expect(contents[1]).toBe('[[page:102]] [[page:103]]');
    expect(contents[0]).toBe('');
    expect(unresolved).toEqual([
      { path: 'Home.md', target: 'Missing' },
      { path: 'Home.md', target: 'page:999' },
    ]);
  });
});

describe('renderImportedBodies with repeated names', () => {
  it('prefers the root-level file for a bare name, like an exact vault path', () => {
    const plan = planVaultImport([
      source('A/Plan.md', 'nested'),
      source('Z.md', '[[Plan]] [[A/Plan]] [[a/plan]]'),
      source('Plan.md', 'root'),
    ]);
    expect(plan.pages.map((page) => page.key)).toEqual(['A', 'A/Plan', 'Plan', 'Z']);
    const { contents } = renderImportedBodies(plan, [], [1, 2, 3, 4]);
    expect(contents[3]).toBe('[[page:3]] [[page:2]] [[page:2]]');
  });
});

describe('importSlugs', () => {
  it('keeps slugs unique within one import', () => {
    expect(importSlugs(['Plan', 'plan', '회의 록', '!!!'], 'k1')).toEqual([
      'plan-k1',
      'plan-k1-2',
      '회의-록-k1',
      'page-k1',
    ]);
  });
});

describe('export, zip, import round trip', () => {
  it('keeps titles, hierarchy, tags, icons and links', () => {
    const rows = [
      row(1, 'Projects', null, 'Index: [[page:2]] and [[page:3]]', { tags: ['hub'], icon: '📁' }),
      row(2, 'Plan: Q1', 1, 'Back to [[page:1]]. Elsewhere: [[page:40]].', {
        tags: ['q1', 'plan'],
      }),
      row(3, 'Plan: Q1', null, 'A namesake at the root links [[page:2]].'),
    ];
    const archive = createZip(buildVaultEntries(rows, new Map([[40, 'Outside page']])));

    const files = readZip(archive, { maxEntries: 500, maxTotalUncompressed: 20 * 1024 * 1024 })
      .filter((entry) => !entry.isDirectory)
      .map((entry) => {
        const segments = normalizeVaultPath(entry.name);
        return { path: segments.join('/'), segments, size: entry.size, read: entry.read };
      });
    const plan = planVaultImport(files);
    expect(plan.skipped).toEqual([]);
    const ids = plan.pages.map((_, index) => 500 + index);
    const { contents, unresolved } = renderImportedBodies(plan, [], ids);
    const byTitle = (title: string, parent: number | null) =>
      plan.pages.findIndex((page) => page.title === title && page.parent === parent);

    const projects = byTitle('Projects', null);
    const child = byTitle('Plan: Q1', projects);
    const root = byTitle('Plan: Q1', null);
    expect([projects, child, root].every((index) => index >= 0)).toBe(true);
    expect(plan.pages).toHaveLength(3);
    expect(plan.pages[projects]).toMatchObject({ tags: ['hub'], icon: '📁' });
    expect(plan.pages[child].tags).toEqual(['q1', 'plan']);

    expect(contents[projects]).toBe(`Index: [[page:${ids[child]}]] and [[page:${ids[root]}]]\n`);
    expect(contents[child]).toBe(`Back to [[page:${ids[projects]}]]. Elsewhere: Outside page.\n`);
    expect(contents[root]).toBe(`A namesake at the root links [[page:${ids[child]}]].\n`);
    expect(unresolved).toEqual([]);
  });
});
