/**
 * Layer 4: page icons against real Postgres (issue #103 E4).
 *
 * Invariants proven here:
 *   - drizzle/0019_add_page_icon.sql is additive: on a table as it was before the migration,
 *     every existing row keeps every value (updated_at and the FTS vector included), gains a
 *     null icon, and running the migration again changes nothing;
 *   - after the migrations, an icon-only autosave stores the emoji through the real save
 *     pipeline and DBStorage without recording a version; a title autosave still records one.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool, type PoolClient } from 'pg';

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

const migration = (file: string) =>
  readFileSync(path.resolve(__dirname, '../../drizzle', file), 'utf8');

let admin: Pool;

/** Run a migration file exactly as written (unqualified table names) inside the test schema. */
async function applyMigration(file: string) {
  const client: PoolClient = await admin.connect();
  try {
    await client.query(`SET search_path TO ${SCHEMA}`);
    await client.query(migration(file));
  } finally {
    await client.query('RESET search_path');
    client.release();
  }
}

/** wiki_pages and page_versions as they were before 0019 (no icon, no tree position). */
async function createPreIconSchema() {
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.wiki_pages (
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
      deleted_at   TIMESTAMP,
      search_vector tsvector
    )
  `);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.page_versions (
      id                 SERIAL PRIMARY KEY,
      page_id            INTEGER NOT NULL REFERENCES ${SCHEMA}.wiki_pages(id) ON DELETE CASCADE,
      title              TEXT NOT NULL,
      content            TEXT NOT NULL,
      blocks             JSONB DEFAULT '[]',
      author             TEXT NOT NULL,
      version_number     INTEGER NOT NULL,
      change_description TEXT,
      created_at         TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await admin.query(`
    CREATE OR REPLACE FUNCTION ${SCHEMA}.wiki_pages_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'B');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);
  await admin.query(`
    CREATE TRIGGER trg_wiki_pages_search_vector
    BEFORE INSERT OR UPDATE OF title, content, tags ON ${SCHEMA}.wiki_pages
    FOR EACH ROW EXECUTE FUNCTION ${SCHEMA}.wiki_pages_search_vector_update()
  `);
}

async function rows() {
  const { rows } = await admin.query(
    `SELECT *, search_vector::text AS search_text FROM ${SCHEMA}.wiki_pages ORDER BY id`
  );
  return rows as Array<Record<string, unknown>>;
}

async function iconColumn() {
  const { rows } = await admin.query(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'wiki_pages' AND column_name = 'icon'`,
    [SCHEMA]
  );
  return rows[0];
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await createPreIconSchema();
});

afterAll(async () => {
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('0019_add_page_icon.sql (real Postgres)', () => {
  it('adds a nullable icon column and leaves existing rows intact', async () => {
    await admin.query(
      `INSERT INTO ${SCHEMA}.wiki_pages
         (title, slug, content, blocks, folder, tags, author, parent_id, team_id, updated_at,
          is_published, metadata, deleted_at)
       VALUES
         ('Handbook', 'handbook', 'alpha body', '[{"id":"b1","type":"paragraph","content":"alpha body"}]',
          'docs', '{ops,guide}', 'alice', NULL, NULL, '2024-01-02 03:04:05', TRUE, '{"k":1}', NULL),
         ('Child', 'child', 'beta', '[]', 'ideas', '{}', 'bob', 1, NULL, '2024-02-03 04:05:06',
          FALSE, '{}', '2024-03-01 00:00:00')`
    );
    const before = await rows();
    expect(before).toHaveLength(2);
    expect(await iconColumn()).toBeUndefined();

    await applyMigration('0019_add_page_icon.sql');

    expect(await iconColumn()).toEqual({
      data_type: 'text',
      is_nullable: 'YES',
      column_default: null,
    });
    const after = await rows();
    expect(after).toEqual(before.map((row) => ({ ...row, icon: null })));

    // Re-running the migration is a no-op.
    await applyMigration('0019_add_page_icon.sql');
    expect(await rows()).toEqual(after);
  });
});

describe('icon saves after the migrations (real Postgres)', () => {
  let storage: any;
  let pipeline: typeof import('../../server/services/page-save.js');
  let store: import('../../server/services/page-save.js').PageSaveStore;

  beforeAll(async () => {
    // DBStorage reads every column of the current schema, tree position (0020) included.
    await applyMigration('0020_add_page_tree_position.sql');
    process.env.DATABASE_URL = scopedUrl;
    const { DBStorage } = await import('../../server/storage.js');
    storage = new DBStorage();
    pipeline = await import('../../server/services/page-save.js');
    store = pipeline.storagePageSaveStore(storage);
  });

  afterEach(() => {
    pipeline.resetEditSessions();
  });

  afterAll(async () => {
    await storage?.pool.end();
  });

  const versionCount = async (pageId: number) =>
    Number(
      (
        await admin.query(`SELECT count(*) FROM ${SCHEMA}.page_versions WHERE page_id = $1`, [
          pageId,
        ])
      ).rows[0].count
    );

  it('stores an icon-only autosave without a version, and clears it with null', async () => {
    const { rows } = await admin.query(
      `SELECT id FROM ${SCHEMA}.wiki_pages WHERE slug = 'handbook'`
    );
    const id = rows[0].id;

    await pipeline.savePage(store, id, { icon: '🧑🏽‍💻' }, 'autosave');
    expect((await storage.getWikiPage(id)).icon).toBe('🧑🏽‍💻');
    expect(await versionCount(id)).toBe(0);
    expect(pipeline.hasOpenEditSession(id)).toBe(false);

    await pipeline.savePage(store, id, { icon: null }, 'autosave');
    expect((await storage.getWikiPage(id)).icon).toBeNull();
    expect(await versionCount(id)).toBe(0);

    // Control: a title autosave records the pre-session version as before.
    await pipeline.savePage(store, id, { title: 'Handbook v2' }, 'autosave');
    expect(await versionCount(id)).toBe(1);
  });
});
