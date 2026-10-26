/**
 * Layer 4: the page save pipeline against real Postgres (issue #103 E1).
 *
 * Invariants proven here with DBStorage, `page_versions` and the FTS trigger from
 * drizzle/0005_add_wiki_pages_fts.sql:
 *   - autosaves in one editing session record exactly one version (the pre-session state);
 *   - a checkpoint closes the session, so the next autosave records the next version;
 *   - a blocks-only save (what Yjs sends) updates `content`, and therefore FTS;
 *   - a restore keeps the current state as a version before it is overwritten.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'page_save_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let storage: any;
let pipeline: typeof import('../../server/services/page-save.js');
let store: import('../../server/services/page-save.js').PageSaveStore;

async function createSchema() {
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
      position     INTEGER,
      icon         TEXT,
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
        setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
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

async function createPage(slug: string, content: string): Promise<number> {
  const { rows } = await admin.query(
    `INSERT INTO ${SCHEMA}.wiki_pages (title, slug, content, blocks, author, tags)
     VALUES ($1, $2, $3, $4, 'author', '{ops}') RETURNING id`,
    [`Page ${slug}`, slug, content, JSON.stringify([{ id: 'b1', type: 'paragraph', content }])]
  );
  return rows[0].id;
}

async function versions(pageId: number) {
  const { rows } = await admin.query(
    `SELECT version_number, content, change_description
       FROM ${SCHEMA}.page_versions WHERE page_id = $1 ORDER BY version_number`,
    [pageId]
  );
  return rows as Array<{ version_number: number; content: string; change_description: string }>;
}

async function matchesSearch(pageId: number, term: string) {
  const { rows } = await admin.query(
    `SELECT 1 FROM ${SCHEMA}.wiki_pages
      WHERE id = $1 AND search_vector @@ plainto_tsquery('simple', $2)`,
    [pageId, term]
  );
  return rows.length === 1;
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await createSchema();
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
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('page save pipeline (real Postgres)', () => {
  it('records one version per autosave session and another after a checkpoint', async () => {
    const id = await createPage('autosave-session', 'original body');

    await pipeline.savePage(store, id, { blocks: [{ content: 'draft one' }] }, 'autosave');
    await pipeline.savePage(store, id, { blocks: [{ content: 'draft two' }] }, 'autosave');
    await pipeline.savePage(store, id, { blocks: [{ content: 'draft three' }] }, 'autosave');
    expect(await versions(id)).toEqual([
      { version_number: 1, content: 'original body', change_description: 'Before editing session' },
    ]);

    expect(await pipeline.checkpointPage(id)).toBe(true);
    await pipeline.savePage(store, id, { blocks: [{ content: 'next session' }] }, 'autosave');
    expect((await versions(id)).map((v) => [v.version_number, v.content])).toEqual([
      [1, 'original body'],
      [2, 'draft three'],
    ]);
  });

  it('keeps content and FTS in step with a blocks-only (Yjs) save', async () => {
    const id = await createPage('yjs-fts', 'zebra');
    expect(await matchesSearch(id, 'zebra')).toBe(true);

    await pipeline.savePage(
      store,
      id,
      { blocks: [{ content: 'quokka habitat' }, { content: 'notes' }] },
      'autosave'
    );

    const page = await storage.getWikiPage(id);
    expect(page.content).toBe('quokka habitat\n\nnotes');
    expect(await matchesSearch(id, 'quokka')).toBe(true);
    expect(await matchesSearch(id, 'zebra')).toBe(false);
  });

  it('manual saves keep one pre-save version each, numbered after existing versions', async () => {
    const id = await createPage('manual-saves', 'm0');
    await pipeline.savePage(store, id, { content: 'm1' }, 'manual');
    await pipeline.savePage(store, id, { content: 'm2' }, 'manual');
    expect(
      (await versions(id)).map((v) => [v.version_number, v.content, v.change_description])
    ).toEqual([
      [1, 'm0', 'Version 1'],
      [2, 'm1', 'Version 2'],
    ]);
  });

  it('a restore keeps the latest state as a version before it is overwritten', async () => {
    const id = await createPage('restore', 'r0');
    await pipeline.savePage(store, id, { content: 'r1' }, 'manual');
    await pipeline.savePage(store, id, { blocks: [{ content: 'latest edit' }] }, 'autosave');

    await pipeline.snapshotBeforeRestore(store, id);
    const all = await versions(id);
    expect(all.at(-1)).toEqual({
      version_number: 3,
      content: 'latest edit',
      change_description: 'Before restore',
    });
    expect(pipeline.hasOpenEditSession(id)).toBe(false);
  });
});
