/**
 * Layer 4: database errors as drizzle-orm really throws them.
 *
 * drizzle wraps every pg error in a DrizzleQueryError whose `cause` holds the SQLSTATE code and
 * constraint. Code that read `error.code` never matched, so createWikiPage's slug retry failed
 * on the first taken slug (a 500 instead of `slug-2`), and deleteTeam could not recognize the
 * foreign key that keeps a team with pages. Proven here against real Postgres:
 *   - the error a drizzle query throws carries its code on the cause, and postgresErrorOf reads it;
 *   - createWikiPage moves on to the next slug when one is taken, also by a trashed page;
 *   - deleteTeam answers `has-pages` when the foreign key refuses the delete.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { postgresErrorOf } from '../../server/db-errors';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'db_errors_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let scoped: Pool;
let storage: any;

const page = (slug: string) => ({
  title: 'Same title',
  slug,
  content: 'body',
  blocks: [],
  folder: 'docs',
  tags: [],
  author: 'a@example.com',
});

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(`
    CREATE TABLE teams (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      description TEXT, password TEXT, icon TEXT, color TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE, "order" INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE wiki_pages (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL,
      content TEXT NOT NULL, blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs',
      tags TEXT[] NOT NULL DEFAULT '{}', author TEXT NOT NULL, parent_id INTEGER, position INTEGER,
      icon TEXT,
      team_id INTEGER CONSTRAINT wiki_pages_team_id_teams_id_fk REFERENCES teams(id) ON DELETE RESTRICT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE, metadata JSONB DEFAULT '{}',
      deleted_at TIMESTAMP,
      CONSTRAINT wiki_pages_slug_unique UNIQUE (slug)
    );
  `);

  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('database errors through drizzle (real Postgres)', () => {
  it('a drizzle query error carries the SQLSTATE on its cause', async () => {
    const error = await storage.db
      .execute(
        sql`INSERT INTO wiki_pages (title, slug, content, author) VALUES ('a', 'x', '', 'a'),
                                                                       ('b', 'x', '', 'a')`
      )
      .catch((caught: unknown) => caught);
    expect((error as { code?: string }).code).toBeUndefined();
    expect(postgresErrorOf(error)).toEqual({ code: '23505', constraint: 'wiki_pages_slug_unique' });
  });

  it('createWikiPage takes the next slug when one is taken, also by a trashed page', async () => {
    const first = await storage.createWikiPage(page('plan'));
    const second = await storage.createWikiPage(page('plan'));
    expect([first.slug, second.slug]).toEqual(['plan', 'plan-2']);

    await scoped.query('UPDATE wiki_pages SET deleted_at = NOW() WHERE id = $1', [second.id]);
    const third = await storage.createWikiPage(page('plan'));
    expect(third.slug).toBe('plan-3');
  });

  it('deleteTeam answers has-pages when the foreign key refuses the delete', async () => {
    const { rows } = await scoped.query(
      `INSERT INTO teams (name, display_name) VALUES ('t', 'T') RETURNING id`
    );
    const teamId = rows[0].id as number;
    await scoped.query(
      `INSERT INTO wiki_pages (title, slug, content, author, team_id) VALUES ('p', 'team-p', '', 'a', $1)`,
      [teamId]
    );
    // The page check runs first; a page added after it is caught by the foreign key. Hide the
    // page from that check for one call, so the delete itself meets the foreign key.
    const select = storage.db.select.bind(storage.db);
    storage.db.select = () => {
      storage.db.select = select;
      return { from: () => ({ where: () => ({ limit: async () => [] }) }) };
    };
    expect(await storage.deleteTeam(teamId)).toBe('has-pages');
    expect((await scoped.query('SELECT id FROM teams WHERE id = $1', [teamId])).rowCount).toBe(1);
  });
});
