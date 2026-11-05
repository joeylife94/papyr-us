/**
 * Layer 4: the trash list against real Postgres.
 *
 * GET /api/trash listed every trashed page of the instance, body included, to any signed-in
 * user. DBStorage.getTrashPages now applies the listing rule of the live page lists:
 *   - trashed pages of the viewer's teams, team-less pages they can read, and nothing of other
 *     teams, even one with a grant to the viewer;
 *   - live pages never appear, and no row carries `content` or `blocks`;
 *   - a team filter narrows the list and cannot widen it.
 *
 * The viewer is passed in directly, so only the page and permission tables are needed. They live
 * in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'trash_listing_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TEAM = 41;
const OTHER_TEAM = 42;
const MEMBER = { userId: 1, email: 'member@example.com', teamIds: [TEAM] };
const STRANGER = { userId: 2, email: 'stranger@example.com', teamIds: [] as number[] };

let admin: Pool;
let scoped: Pool;
let storage: any;
const ids: Record<string, number> = {};

async function insertPage(
  key: string,
  values: { teamId?: number | null; author?: string; trashed?: boolean }
) {
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, blocks, author, team_id, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN NOW() ELSE NULL END) RETURNING id`,
    [
      key,
      `${key}-slug`,
      `secret body of ${key}`,
      JSON.stringify([{ id: 'b1', type: 'paragraph', content: `secret block of ${key}` }]),
      values.author ?? 'someone@example.com',
      values.teamId ?? null,
      values.trashed ?? true,
    ]
  );
  ids[key] = rows[0].id;
}

async function grant(key: string, entityType: string, entityId: number | null, level: string) {
  await scoped.query(
    `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
     VALUES ($1, $2, $3, $4)`,
    [ids[key], entityType, entityId, level]
  );
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
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
      position     INTEGER,
      icon         TEXT,
      team_id      INTEGER,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      metadata     JSONB DEFAULT '{}',
      deleted_at   TIMESTAMP
    );
    CREATE TABLE page_permissions (
      id          SERIAL PRIMARY KEY,
      page_id     INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id   INTEGER,
      permission  TEXT NOT NULL,
      granted_by  INTEGER,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await insertPage('team-trashed', { teamId: TEAM });
  await insertPage('team-live', { teamId: TEAM, trashed: false });
  await insertPage('other-team-trashed', { teamId: OTHER_TEAM });
  await insertPage('other-team-shared', { teamId: OTHER_TEAM });
  await grant('other-team-shared', 'user', MEMBER.userId, 'owner');
  await insertPage('open-personal', {}); // team-less, no permissions: readable by anyone
  await insertPage('private-personal', { author: STRANGER.email });
  await grant('private-personal', 'user', STRANGER.userId, 'owner');

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

const titles = (rows: Array<{ title: string }>) => rows.map((row) => row.title).sort();

describe('trash listing (real Postgres)', () => {
  it('lists only the trashed pages the viewer may list, without their body', async () => {
    const rows = await storage.getTrashPages(MEMBER);
    expect(titles(rows)).toEqual(['open-personal', 'team-trashed']);
    for (const row of rows) {
      expect(row).not.toHaveProperty('content');
      expect(row).not.toHaveProperty('blocks');
      expect(row.deletedAt).toBeInstanceOf(Date);
    }

    expect(titles(await storage.getTrashPages(STRANGER))).toEqual([
      'open-personal',
      'private-personal',
    ]);
  });

  it('narrows to one team and cannot widen to another', async () => {
    expect(titles(await storage.getTrashPages(MEMBER, TEAM))).toEqual(['team-trashed']);
    expect(await storage.getTrashPages(MEMBER, OTHER_TEAM)).toEqual([]);
    expect(await storage.getTrashPages(STRANGER, TEAM)).toEqual([]);
  });
});
