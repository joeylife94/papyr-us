/**
 * Layer 4: the page icon migration against real Postgres (issue #103 E4).
 *
 * drizzle/0019_add_wiki_pages_icon.sql must be additive: applied to a `wiki_pages` table in the
 * pre-E4 shape, it adds a nullable `icon` column without a default, leaves every existing row and
 * column as it was, and can run again without error. DBStorage then reads and writes the icon.
 *
 * The table lives in its own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'page_icon_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const MIGRATION = readFileSync(
  new URL('../../drizzle/0019_add_wiki_pages_icon.sql', import.meta.url),
  'utf8'
);

let admin: Pool;
let scoped: Pool;
let storage: any;

async function rowSnapshot(id: number) {
  const { rows } = await scoped.query(
    `SELECT id, title, slug, content, blocks, folder, tags, author, team_id, is_published,
            metadata, deleted_at, created_at, updated_at
       FROM wiki_pages WHERE id = $1`,
    [id]
  );
  return rows[0];
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  // `wiki_pages` as it was before E4 (no icon column).
  await scoped.query(`
    CREATE TABLE wiki_pages (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,
      slug         TEXT NOT NULL UNIQUE,
      content      TEXT NOT NULL,
      blocks       JSONB DEFAULT '[]',
      folder       TEXT NOT NULL DEFAULT 'docs',
      tags         TEXT[] NOT NULL DEFAULT '{}',
      author       TEXT NOT NULL,
      parent_id    INTEGER,
      team_id      INTEGER,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      metadata     JSONB DEFAULT '{}',
      deleted_at   TIMESTAMP
    )
  `);
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('0019 page icon migration (real Postgres)', () => {
  it('adds a nullable icon column, keeps existing rows, and is idempotent', async () => {
    const { rows } = await scoped.query(
      `INSERT INTO wiki_pages (title, slug, content, blocks, author, tags, team_id)
       VALUES ('Handbook', 'handbook', 'body', '[{"id":"b1","type":"paragraph","content":"body"}]',
               'alice', '{ops,proof}', 7)
       RETURNING id`
    );
    const id = rows[0].id;
    const before = await rowSnapshot(id);

    await scoped.query(MIGRATION);
    await scoped.query(MIGRATION); // a second run is a no-op

    const { rows: columns } = await scoped.query(
      `SELECT data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'wiki_pages' AND column_name = 'icon'`,
      [SCHEMA]
    );
    expect(columns).toEqual([{ data_type: 'text', is_nullable: 'YES', column_default: null }]);

    expect(await rowSnapshot(id)).toEqual(before);
    const { rows: icons } = await scoped.query(`SELECT icon FROM wiki_pages WHERE id = $1`, [id]);
    expect(icons[0].icon).toBeNull();
  });

  it('DBStorage reads, sets and clears the icon', async () => {
    // DBStorage reads the current schema, which also has the later E5 column.
    await scoped.query(
      readFileSync(
        new URL('../../drizzle/0020_add_wiki_pages_position.sql', import.meta.url),
        'utf8'
      )
    );
    process.env.DATABASE_URL = scopedUrl;
    const { DBStorage } = await import('../../server/storage.js');
    storage = new DBStorage();

    const page = await storage.getWikiPageBySlug('handbook');
    expect(page.icon).toBeNull();

    await storage.updateWikiPage(page.id, { icon: '🚀' });
    expect((await storage.getWikiPage(page.id)).icon).toBe('🚀');

    await storage.updateWikiPage(page.id, { icon: null });
    expect((await storage.getWikiPage(page.id)).icon).toBeNull();
  });
});
