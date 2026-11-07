/**
 * Layer 4: page links against real Postgres (issue #103 E6).
 *
 * Proven here with DBStorage and drizzle/0021_add_page_links.sql:
 *   - the migration is additive and idempotent (a new table and index, existing rows untouched);
 *   - creating and updating a page keeps page_links in step with its `[[page:<id>]]` tokens,
 *     skipping unknown ids and self-links; rows go when a page is deleted for good;
 *   - backlinks and the link picker list only pages the viewer may read, never trashed ones;
 *   - the picker (and the #111 quick switcher) ranks an exact title first, then prefixes.
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

const SCHEMA = 'page_links_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const MIGRATION = readFileSync(
  new URL('../../drizzle/0021_add_page_links.sql', import.meta.url),
  'utf8'
);

const ALICE = { id: 1, email: 'alice@example.com' };
const BOB = { id: 2, email: 'bob@example.com' };

let admin: Pool;
let scoped: Pool;
let storage: any;

const page = (title: string, author: string, content = '') => ({
  title,
  slug: `${title.toLowerCase().replace(/\W+/g, '-')}`,
  content,
  blocks: [],
  folder: 'docs',
  tags: [],
  author,
});

async function linksFrom(sourceId: number): Promise<number[]> {
  const { rows } = await scoped.query(
    'SELECT target_page_id FROM page_links WHERE source_page_id = $1 ORDER BY target_page_id',
    [sourceId]
  );
  return rows.map((r: any) => r.target_page_id);
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
      hashed_password TEXT, provider VARCHAR(50), provider_id VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE members (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
      team_id INTEGER, avatar_url TEXT, bio TEXT, github_username TEXT,
      skills TEXT[] NOT NULL DEFAULT '{}', joined_date TIMESTAMP NOT NULL DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE team_members (
      id SERIAL PRIMARY KEY, team_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', invited_by INTEGER,
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(), created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE page_permissions (
      id SERIAL PRIMARY KEY, page_id INTEGER NOT NULL, entity_type TEXT NOT NULL,
      entity_id INTEGER, permission TEXT NOT NULL, granted_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE wiki_pages (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
      blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs',
      tags TEXT[] NOT NULL DEFAULT '{}', author TEXT NOT NULL,
      parent_id INTEGER REFERENCES wiki_pages(id) ON DELETE SET NULL, team_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE, metadata JSONB DEFAULT '{}',
      deleted_at TIMESTAMP, icon TEXT, position INTEGER
    );
  `);
  await scoped.query(
    `INSERT INTO users (id, name, email) VALUES ($1, 'Alice', $2), ($3, 'Bob', $4)`,
    [ALICE.id, ALICE.email, BOB.id, BOB.email]
  );
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('page links (real Postgres)', () => {
  it('0021 adds page_links and its index without touching pages; idempotent', async () => {
    await scoped.query(
      `INSERT INTO wiki_pages (title, slug, content, author) VALUES ('Old', 'old', 'x', 'a')`
    );
    const before = (await scoped.query(`SELECT * FROM wiki_pages WHERE slug = 'old'`)).rows[0];
    await scoped.query(MIGRATION);
    await scoped.query(MIGRATION);
    const { rows: tables } = await scoped.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'page_links' ORDER BY column_name`,
      [SCHEMA]
    );
    expect(tables).toEqual([
      { column_name: 'source_page_id', is_nullable: 'NO' },
      { column_name: 'target_page_id', is_nullable: 'NO' },
    ]);
    const { rows: indexes } = await scoped.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'page_links'`,
      [SCHEMA]
    );
    expect(indexes.map((i: any) => i.indexname)).toContain('idx_page_links_target');
    expect((await scoped.query(`SELECT * FROM wiki_pages WHERE slug = 'old'`)).rows[0]).toEqual(
      before
    );
    await scoped.query(`DELETE FROM wiki_pages WHERE slug = 'old'`);

    process.env.DATABASE_URL = scopedUrl;
    const { DBStorage } = await import('../../server/storage.js');
    storage = new DBStorage();
  });

  it('keeps links in step with content on create and update, skipping unknown and self ids', async () => {
    const target = await storage.createWikiPage(page('Target', ALICE.email, 'body'), ALICE.id);
    const other = await storage.createWikiPage(page('Other', ALICE.email, 'body'), ALICE.id);
    const source = await storage.createWikiPage(
      page('Source', ALICE.email, `see [[page:${target.id}]] and [[page:99999]]`),
      ALICE.id
    );
    expect(await linksFrom(source.id)).toEqual([target.id]);

    await storage.updateWikiPage(source.id, {
      content: `now [[page:${other.id}]] [[page:${other.id}]] [[page:${source.id}]]`,
    });
    expect(await linksFrom(source.id)).toEqual([other.id]);

    // An update that leaves content alone keeps the links.
    await storage.updateWikiPage(source.id, { tags: ['t'] });
    expect(await linksFrom(source.id)).toEqual([other.id]);

    await storage.updateWikiPage(source.id, { content: 'no links' });
    expect(await linksFrom(source.id)).toEqual([]);

    // Deleting a page for good removes its rows on both sides.
    await storage.updateWikiPage(source.id, { content: `[[page:${target.id}]]` });
    await scoped.query('DELETE FROM wiki_pages WHERE id = $1', [target.id]);
    expect(await linksFrom(source.id)).toEqual([]);
  });

  it('an id beyond the page id column breaks neither the index nor the title lookup', async () => {
    const target = await storage.createWikiPage(page('Big id target', ALICE.email), ALICE.id);
    const source = await storage.createWikiPage(
      page('Big id source', ALICE.email, `[[page:${target.id}]] [[page:9999999999]]`),
      ALICE.id
    );
    expect(await linksFrom(source.id)).toEqual([target.id]);

    const viewer = await storage.getPageViewer(ALICE.id);
    const found = await storage.resolveReadablePageLinks(viewer, [9999999999, target.id]);
    expect(found.map((p: any) => p.id)).toEqual([target.id]);
  });

  it('concurrent saves leave the index matching the content that won', async () => {
    const a = await storage.createWikiPage(page('Race A', ALICE.email, 'a'), ALICE.id);
    const b = await storage.createWikiPage(page('Race B', ALICE.email, 'b'), ALICE.id);
    const source = await storage.createWikiPage(page('Race source', ALICE.email, ''), ALICE.id);
    for (let round = 0; round < 5; round += 1) {
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          storage.updateWikiPage(source.id, {
            content: `round ${round} save ${i} [[page:${i % 2 === 0 ? a.id : b.id}]]`,
          })
        )
      );
      const { rows } = await scoped.query('SELECT content FROM wiki_pages WHERE id = $1', [
        source.id,
      ]);
      const winner = rows[0].content as string;
      const expected = winner.includes(`[[page:${a.id}]]`) ? [a.id] : [b.id];
      expect(await linksFrom(source.id), `round ${round}: ${winner}`).toEqual(expected);
    }
  });

  it('lists backlinks and picker results only from pages the viewer may read', async () => {
    const target = await storage.createWikiPage(page('Shared Plan', ALICE.email, 'x'), ALICE.id);
    // Creating a page makes its creator the explicit owner, so personal pages are private.
    const { rows: owners } = await scoped.query(
      `SELECT entity_id FROM page_permissions WHERE page_id = $1 AND permission = 'owner'`,
      [target.id]
    );
    expect(owners).toEqual([{ entity_id: ALICE.id }]);
    const aliceSource = await storage.createWikiPage(
      page('Alice notes', ALICE.email, `[[page:${target.id}]]`),
      ALICE.id
    );
    const bobSource = await storage.createWikiPage(
      page('Bob secret', BOB.email, `[[page:${target.id}]]`),
      BOB.id
    );
    const trashed = await storage.createWikiPage(
      page('Old draft', ALICE.email, `[[page:${target.id}]]`),
      ALICE.id
    );
    await storage.trashPages([trashed.id]);

    const aliceBacklinks = (await storage.getReadableBacklinks(ALICE.id, target.id)).map(
      (p: any) => p.id
    );
    expect(aliceBacklinks).toEqual([aliceSource.id]);
    expect(aliceBacklinks).not.toContain(bobSource.id);
    const bobBacklinks = (await storage.getReadableBacklinks(BOB.id, target.id)).map(
      (p: any) => p.id
    );
    expect(bobBacklinks).toEqual([bobSource.id]);

    const aliceSearch = await storage.searchLinkTargets(ALICE.id, { personalOnly: true }, 'secret');
    expect(aliceSearch).toEqual([]);
    const bobSearch = await storage.searchLinkTargets(BOB.id, { personalOnly: true }, 'secret');
    expect(bobSearch.map((p: any) => p.id)).toEqual([bobSource.id]);
    expect(
      (await storage.searchLinkTargets(ALICE.id, { personalOnly: true }, 'draft')).length
    ).toBe(0);
    // LIKE wildcards in a query match literally.
    expect(await storage.searchLinkTargets(ALICE.id, { personalOnly: true }, '%')).toEqual([]);
  });

  it('ranks an exact title first, then titles starting with the query (#111 switcher)', async () => {
    // Created oldest first, so recency alone would list the exact title last.
    const exact = await storage.createWikiPage(page('Roadmap', ALICE.email), ALICE.id);
    const prefix = await storage.createWikiPage(page('Roadmap notes', ALICE.email), ALICE.id);
    const contains = await storage.createWikiPage(page('Old roadmap', ALICE.email), ALICE.id);

    const found = await storage.searchLinkTargets(ALICE.id, { personalOnly: true }, 'ROADMAP');
    expect(found.map((p: any) => p.id)).toEqual([exact.id, prefix.id, contains.id]);
    expect(found[0].updatedAt).toBeInstanceOf(Date);
  });
});
