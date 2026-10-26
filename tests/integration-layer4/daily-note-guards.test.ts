/**
 * Layer 4: guards around team daily notes (#111) against real Postgres.
 *
 *   - Only the daily-note route may use a daily note's slug: an ordinary create gets the next
 *     slug candidate, and an update to such a slug is refused, so nobody can take another team's
 *     or user's note address ahead of time.
 *   - getUserPagePermission (used by the collaboration servers) honours a grant to the user's
 *     team, as checkPagePermission does, so members can edit a team daily note live.
 *
 * Team membership is stubbed on the storage instance; the page and permission SQL is real.
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'daily_note_guards_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TEAM = 301;
const MEMBER = 7;
const OUTSIDER = 8;

let admin: Pool;
let storage: any;

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
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
      deleted_at   TIMESTAMP
    )
  `);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.page_permissions (
      id          SERIAL PRIMARY KEY,
      page_id     INTEGER NOT NULL REFERENCES ${SCHEMA}.wiki_pages(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id   INTEGER,
      permission  TEXT NOT NULL,
      granted_by  INTEGER,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
  storage.getUserTeamIds = async (userId: number) => (userId === MEMBER ? [TEAM] : []);
  storage.getUserTeamRole = async (userId: number, teamId: number) =>
    userId === MEMBER && teamId === TEAM ? 'member' : null;
});

afterAll(async () => {
  await storage?.pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

const page = (slug: string, teamId: number | null = null) => ({
  title: slug,
  slug,
  content: '',
  folder: 'logs',
  tags: [],
  author: 'someone@example.com',
  teamId,
});

describe('daily note guards (real Postgres)', () => {
  it('never lets an ordinary create take a daily note slug', async () => {
    const team = await storage.createWikiPage(page(`daily-2026-10-27-t${TEAM}`, TEAM));
    const personal = await storage.createWikiPage(page('daily-2026-10-27-u42'));
    expect(team.slug).toBe(`daily-2026-10-27-t${TEAM}-2`);
    expect(personal.slug).toBe('daily-2026-10-27-u42-2');

    // Slugs that only look similar are left alone.
    const similar = await storage.createWikiPage(page('daily-standup-notes'));
    expect(similar.slug).toBe('daily-standup-notes');
  });

  it('refuses to rename a page to a daily note slug', async () => {
    const created = await storage.createWikiPage(page('plain-page'));
    await expect(
      storage.updateWikiPage(created.id, { slug: `daily-2026-10-27-t${TEAM}` })
    ).rejects.toThrow(/reserved/);
    const { rows } = await admin.query(`SELECT slug FROM ${SCHEMA}.wiki_pages WHERE id = $1`, [
      created.id,
    ]);
    expect(rows[0].slug).toBe('plain-page');
  });

  it('counts a grant to the user’s team in getUserPagePermission', async () => {
    const note = await storage.createWikiPage(page('team-note', TEAM));
    await admin.query(
      `INSERT INTO ${SCHEMA}.page_permissions (page_id, entity_type, entity_id, permission)
       VALUES ($1, 'team', $2, 'editor'), ($1, 'team', 999, 'owner')`,
      [note.id, TEAM]
    );

    expect(await storage.getUserPagePermission(MEMBER, note.id)).toBe('editor');
    // A grant to a team the user is not in, and a non-member of the page's team, get nothing.
    expect(await storage.getUserPagePermission(OUTSIDER, note.id)).toBeNull();
  });
});
