/**
 * Layer 4: page search with `sort=rank` against real Postgres (#131).
 *
 * DBStorage.searchWikiPages selected `ts_rank(...)` without an alias and ordered by the raw SQL
 * `rank DESC`, so every full-text search with `sort=rank` failed with `column "rank" does not
 * exist`. Proven here with the FTS column, index and trigger of drizzle/0005_add_wiki_pages_fts.sql:
 *   - `sort=rank` orders matches by ts_rank relevance (title weight A over content B over tags C),
 *     ties by updatedAt desc;
 *   - it finds the same pages, with the same total and pagination, as the default sort;
 *   - folder, tag, team, trash and read filters apply as before;
 *   - rows keep the shape of the default sort: no extra `rank` field;
 *   - the query text stays a bound parameter.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'search_rank_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const FTS_MIGRATION = readFileSync(
  new URL('../../drizzle/0005_add_wiki_pages_fts.sql', import.meta.url),
  'utf8'
);

const TEAM = 61;
const OTHER_TEAM = 62;
const READER = { userId: 1, email: 'reader@example.com', teamIds: [TEAM] };

let admin: Pool;
let scoped: Pool;
let storage: any;

async function insertPage(
  slug: string,
  values: {
    title: string;
    content: string;
    tags?: string[];
    folder?: string;
    teamId?: number | null;
    updatedAt: string;
    trashed?: boolean;
  }
): Promise<number> {
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, folder, tags, author, team_id, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, 'author@example.com', $6, $7, CASE WHEN $8 THEN NOW() ELSE NULL END)
     RETURNING id`,
    [
      values.title,
      slug,
      values.content,
      values.folder ?? 'docs',
      values.tags ?? [],
      values.teamId ?? null,
      values.updatedAt,
      values.trashed ?? false,
    ]
  );
  return rows[0].id;
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(`
    CREATE TABLE wiki_pages (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
      blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs',
      tags TEXT[] NOT NULL DEFAULT '{}', author TEXT NOT NULL, parent_id INTEGER,
      position INTEGER, team_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE, deleted_at TIMESTAMP,
      metadata JSONB DEFAULT '{}', icon TEXT
    );
    CREATE TABLE page_permissions (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL, entity_id INTEGER, permission TEXT NOT NULL, granted_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await scoped.query(FTS_MIGRATION);

  // Relevance for "zephyr": two title hits > title hit > two content hits > one content hit
  // > tag hit. Update times are shuffled, so neither update order matches relevance.
  await insertPage('title-twice', {
    title: 'Zephyr zephyr guide',
    content: 'zephyr setup',
    updatedAt: '2026-01-03T00:00:00Z',
  });
  await insertPage('title-once', {
    title: 'Zephyr notes',
    content: 'setup steps',
    updatedAt: '2026-01-06T00:00:00Z',
  });
  await insertPage('content-twice', {
    title: 'Weekly sync',
    content: 'zephyr came up; zephyr again',
    updatedAt: '2026-01-01T00:00:00Z',
  });
  // Same text as content-once-old, newer: equal rank, so the newer one comes first.
  await insertPage('content-once-old', {
    title: 'Retro',
    content: 'we talked about zephyr',
    updatedAt: '2026-01-02T00:00:00Z',
  });
  await insertPage('content-once-new', {
    title: 'Retro',
    content: 'we talked about zephyr',
    updatedAt: '2026-01-05T00:00:00Z',
  });
  await insertPage('tag-only', {
    title: 'Lunch menu',
    content: 'soup and bread',
    tags: ['zephyr'],
    updatedAt: '2026-01-04T00:00:00Z',
  });
  // Not a match, trashed, another folder, or not readable: never in the open-folder results.
  await insertPage('no-match', {
    title: 'Unrelated',
    content: 'nothing here',
    updatedAt: '2026-01-07T00:00:00Z',
  });
  await insertPage('trashed', {
    title: 'Zephyr zephyr zephyr',
    content: 'zephyr zephyr',
    updatedAt: '2026-01-08T00:00:00Z',
    trashed: true,
  });
  await insertPage('other-folder', {
    title: 'Zephyr zephyr zephyr',
    content: 'zephyr',
    folder: 'archive',
    updatedAt: '2026-01-09T00:00:00Z',
  });
  const privatePage = await insertPage('private', {
    title: 'Zephyr zephyr zephyr',
    content: 'zephyr',
    updatedAt: '2026-01-10T00:00:00Z',
  });
  await scoped.query(
    `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
     VALUES ($1, 'user', 99, 'owner')`,
    [privatePage]
  );
  // Team pages for the team filter.
  await insertPage('team-title', {
    title: 'Zephyr plan',
    content: 'team plan',
    teamId: TEAM,
    updatedAt: '2026-01-01T00:00:00Z',
  });
  await insertPage('team-content', {
    title: 'Team sync',
    content: 'zephyr status',
    teamId: TEAM,
    updatedAt: '2026-01-02T00:00:00Z',
  });
  await insertPage('other-team', {
    title: 'Zephyr zephyr',
    content: 'zephyr',
    teamId: OTHER_TEAM,
    updatedAt: '2026-01-03T00:00:00Z',
  });

  process.env.DATABASE_URL = scopedUrl;
  process.env.SEARCH_USE_FTS = 'true';
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

const slugs = (result: { pages: Array<{ slug: string }> }) => result.pages.map((p) => p.slug);
const teamless = { teamId: 'null', folder: 'docs' };
const RANKED = [
  'title-twice',
  'title-once',
  'content-twice',
  'content-once-new',
  'content-once-old',
  'tag-only',
];

describe('search with sort=rank (real Postgres)', () => {
  it('orders matches by ts_rank relevance, ties by the newest update', async () => {
    const result = await storage.searchWikiPages(
      { ...teamless, query: 'zephyr', sort: 'rank', limit: 20, offset: 0 },
      { readableBy: READER }
    );
    expect(slugs(result)).toEqual(RANKED);
    expect(result.total).toBe(RANKED.length);

    // The expected order is Postgres's own ts_rank order, not an assumption of this test.
    const { rows } = await scoped.query(
      `SELECT slug, ts_rank(search_vector, plainto_tsquery('simple', 'zephyr')) AS score
         FROM wiki_pages WHERE slug = ANY($1) ORDER BY score DESC, updated_at DESC`,
      [RANKED]
    );
    expect(rows.map((row: { slug: string }) => row.slug)).toEqual(RANKED);
    const scores = rows.map((row: { score: number }) => row.score);
    expect(new Set(scores).size).toBe(RANKED.length - 1); // one tie: the two identical pages
  });

  it('finds the same pages and total as the default sort, in a different order', async () => {
    const byUpdate = await storage.searchWikiPages(
      { ...teamless, query: 'zephyr', limit: 20, offset: 0 },
      { readableBy: READER }
    );
    const byRank = await storage.searchWikiPages(
      { ...teamless, query: 'zephyr', sort: 'rank', limit: 20, offset: 0 },
      { readableBy: READER }
    );
    expect(byRank.total).toBe(byUpdate.total);
    expect([...slugs(byRank)].sort()).toEqual([...slugs(byUpdate)].sort());
    expect(slugs(byUpdate)).toEqual([
      'title-once',
      'content-once-new',
      'tag-only',
      'title-twice',
      'content-once-old',
      'content-twice',
    ]);
  });

  it('pages through the ranked list with limit and offset; the total stays the full count', async () => {
    const pages = [];
    for (const offset of [0, 2, 4]) {
      const result = await storage.searchWikiPages(
        { ...teamless, query: 'zephyr', sort: 'rank', limit: 2, offset },
        { readableBy: READER }
      );
      expect(result.total).toBe(RANKED.length);
      pages.push(...slugs(result));
    }
    expect(pages).toEqual(RANKED);
  });

  it('keeps the team, tag and folder filters', async () => {
    const team = await storage.searchWikiPages({
      query: 'zephyr',
      sort: 'rank',
      teamId: String(TEAM),
      limit: 20,
      offset: 0,
    });
    expect(slugs(team)).toEqual(['team-title', 'team-content']);
    expect(team.total).toBe(2);

    const tagged = await storage.searchWikiPages(
      { ...teamless, query: 'zephyr', sort: 'rank', tags: ['zephyr'], limit: 20, offset: 0 },
      { readableBy: READER }
    );
    expect(slugs(tagged)).toEqual(['tag-only']);
    expect(tagged.total).toBe(1);

    const archive = await storage.searchWikiPages(
      { teamId: 'null', folder: 'archive', query: 'zephyr', sort: 'rank', limit: 20, offset: 0 },
      { readableBy: READER }
    );
    expect(slugs(archive)).toEqual(['other-folder']);
  });

  it('returns rows of the same shape as the default sort, without a rank field', async () => {
    const [byRank, byUpdate] = await Promise.all(
      ['rank', 'updated'].map((sort) =>
        storage.searchWikiPages(
          { ...teamless, query: 'zephyr', sort, limit: 1, offset: 0 },
          { readableBy: READER }
        )
      )
    );
    expect(byRank.pages[0]).not.toHaveProperty('rank');
    expect(Object.keys(byRank.pages[0]).sort()).toEqual(Object.keys(byUpdate.pages[0]).sort());
  });

  it('binds the query text as a parameter', async () => {
    await insertPage('quoted', {
      title: "O'Reilly zephyr",
      content: 'quote test',
      folder: 'quotes',
      updatedAt: '2026-02-01T00:00:00Z',
    });
    const result = await storage.searchWikiPages(
      {
        teamId: 'null',
        folder: 'quotes',
        query: "o'reilly'); DROP TABLE wiki_pages; --",
        sort: 'rank',
        limit: 20,
        offset: 0,
      },
      { readableBy: READER }
    );
    expect(result.total).toBe(0);
    const quoted = await storage.searchWikiPages(
      { teamId: 'null', folder: 'quotes', query: "O'Reilly", sort: 'rank', limit: 20, offset: 0 },
      { readableBy: READER }
    );
    expect(slugs(quoted)).toEqual(['quoted']);
    const { rows } = await scoped.query('SELECT count(*)::int AS n FROM wiki_pages');
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
