/**
 * Layer 4: saves based on a revision against real Postgres (WP1).
 *
 * Invariants proven here with DBStorage, `page_versions` and the row lock taken by the guarded
 * write:
 *   - of several saves based on the same revision, started together, exactly one is written; the
 *     others are refused with a conflict and leave the winner's page as it is;
 *   - a save based on an older revision is refused before anything is written, and the refused
 *     text and the page as it was are kept as versions (once, however often it is retried);
 *   - the revision a read gives is the revision the guarded write compares, so a save based on
 *     what was just read succeeds and advances it;
 *   - a save without a base is unchanged.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'page_revision_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let storage: any;
let pipeline: typeof import('../../server/services/page-save.js');
let store: import('../../server/services/page-save.js').PageSaveStore;
let revision: typeof import('../../server/services/page-revision.js');

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
      team_id      INTEGER,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      metadata     JSONB DEFAULT '{}',
      deleted_at   TIMESTAMP,
      icon         TEXT,
      position     INTEGER,
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

const blocks = (content: string) => [{ id: 'b1', type: 'paragraph', content }];

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await createSchema();
  process.env.DATABASE_URL = scopedUrl;
  await addOrganizations(admin, SCHEMA);
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
  pipeline = await import('../../server/services/page-save.js');
  revision = await import('../../server/services/page-revision.js');
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

describe('saves based on a revision (real Postgres)', () => {
  it('lets exactly one of several saves based on the same revision through', async () => {
    for (let round = 0; round < 8; round += 1) {
      const id = await createPage(`race-${round}`, 'original');
      const base = revision.pageRevision(await storage.getWikiPage(id));
      const writers = ['a', 'b', 'c', 'd', 'e'].map((name) => `${name} wrote this`);

      const outcomes = await Promise.allSettled(
        writers.map((text) =>
          pipeline.savePage(store, id, { blocks: blocks(text) }, 'autosave', { baseRevision: base })
        )
      );

      const winners = outcomes.filter((o) => o.status === 'fulfilled');
      const refused = outcomes.filter((o) => o.status === 'rejected');
      expect(winners).toHaveLength(1);
      expect(refused).toHaveLength(writers.length - 1);
      for (const outcome of refused) {
        expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(
          revision.PageRevisionConflictError
        );
      }
      const stored = await storage.getWikiPage(id);
      const winner = (winners[0] as PromiseFulfilledResult<any>).value;
      expect(stored.content).toBe(winner.after.content);
      expect(writers).toContain(stored.content);
      pipeline.resetEditSessions();
    }
  });

  it('refuses a stale base without writing, and keeps the refused text and the latest page as versions', async () => {
    const id = await createPage('stale', 'original');
    const stale = revision.pageRevision(await storage.getWikiPage(id));
    await pipeline.savePage(store, id, { blocks: blocks('theirs') }, 'autosave', {
      baseRevision: stale,
    });
    const afterTheirs = await storage.getWikiPage(id);
    const versionsBefore = await versions(id);

    await expect(
      pipeline.savePage(store, id, { blocks: blocks('mine') }, 'autosave', { baseRevision: stale })
    ).rejects.toBeInstanceOf(revision.PageRevisionConflictError);

    expect(await storage.getWikiPage(id)).toEqual(afterTheirs);
    const added = (await versions(id)).slice(versionsBefore.length);
    expect(added.map((v) => [v.content, v.change_description])).toEqual([
      ['theirs', 'Latest when a save was refused'],
      ['mine', 'Not saved: based on an older revision'],
    ]);

    // The same refusal again records nothing new.
    await expect(
      pipeline.savePage(store, id, { blocks: blocks('mine') }, 'autosave', { baseRevision: stale })
    ).rejects.toBeInstanceOf(revision.PageRevisionConflictError);
    expect(await versions(id)).toHaveLength(versionsBefore.length + 2);
  });

  it('accepts the revision a read gave and advances it; a save that changes nothing does not', async () => {
    const id = await createPage('equal', 'original');
    const read = await storage.getWikiPage(id);
    const base = revision.pageRevision(read);

    const saved = await pipeline.savePage(store, id, { blocks: blocks('next') }, 'autosave', {
      baseRevision: base,
    });
    const next = revision.pageRevision(saved!.after);
    expect(next).not.toBe(base);
    // What the next read answers with is what the write answered with.
    expect(revision.pageRevision(await storage.getWikiPage(id))).toBe(next);

    const echo = await pipeline.savePage(store, id, { blocks: blocks('next') }, 'autosave', {
      baseRevision: next,
    });
    expect(revision.pageRevision(echo!.after)).toBe(next);
    expect(revision.pageRevision(await storage.getWikiPage(id))).toBe(next);
  });

  it('keeps a save without a base as it was', async () => {
    const id = await createPage('no-base', 'original');
    await pipeline.savePage(store, id, { blocks: blocks('one') }, 'autosave');
    await pipeline.savePage(store, id, { blocks: blocks('two') }, 'autosave');
    expect((await storage.getWikiPage(id)).content).toBe('two');
  });
});
