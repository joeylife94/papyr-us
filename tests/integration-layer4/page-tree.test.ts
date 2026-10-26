/**
 * Layer 4: the page tree against real Postgres (issue #103 E5).
 *
 * Proven here with DBStorage and drizzle/0020_add_wiki_pages_position.sql:
 *   - the migration is additive and idempotent (nullable `position`, sibling index, rows kept);
 *   - tree rows list only what the viewer may read, scoped to a team or to personal pages, and a
 *     readable page under an unreadable parent ends up at the root without its parent id;
 *   - descendants are found through any depth, and a move renumbers only the readable siblings;
 *   - a subtree trashed together is restored together, while a page trashed on its own earlier
 *     stays in the trash.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { buildPageTree } from '../../server/services/page-tree';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'page_tree_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const MIGRATION = readFileSync(
  new URL('../../drizzle/0020_add_wiki_pages_position.sql', import.meta.url),
  'utf8'
);

const TEAM = 10;
const ALICE = { id: 1, email: 'alice@example.com' }; // member of TEAM
const BOB = { id: 2, email: 'bob@example.com' }; // no team

let admin: Pool;
let scoped: Pool;
let storage: any;
const ids: Record<string, number> = {};

async function insertPage(
  key: string,
  values: { teamId?: number | null; parentKey?: string; author: string; createdAt?: string }
) {
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, team_id, parent_id, created_at)
     VALUES ($1, $2, '', $3, $4, $5, COALESCE($6::timestamp, NOW())) RETURNING id`,
    [
      key,
      `${key}-slug`,
      values.author,
      values.teamId ?? null,
      values.parentKey ? ids[values.parentKey] : null,
      values.createdAt ?? null,
    ]
  );
  ids[key] = rows[0].id;
  return rows[0].id as number;
}

async function grantOwner(key: string, userId: number) {
  await scoped.query(
    `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
     VALUES ($1, 'user', $2, 'owner')`,
    [ids[key], userId]
  );
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
      entity_id INTEGER, permission TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW()
    );
    -- wiki_pages as it was before E5 (no position column).
    CREATE TABLE wiki_pages (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,
      slug         TEXT NOT NULL UNIQUE,
      content      TEXT NOT NULL,
      blocks       JSONB DEFAULT '[]',
      folder       TEXT NOT NULL DEFAULT 'docs',
      tags         TEXT[] NOT NULL DEFAULT '{}',
      author       TEXT NOT NULL,
      parent_id    INTEGER REFERENCES wiki_pages(id) ON DELETE SET NULL,
      team_id      INTEGER,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      metadata     JSONB DEFAULT '{}',
      deleted_at   TIMESTAMP,
      icon         TEXT
    );
  `);
  await scoped.query(
    `INSERT INTO users (id, name, email) VALUES ($1, 'Alice', $2), ($3, 'Bob', $4)`,
    [ALICE.id, ALICE.email, BOB.id, BOB.email]
  );
  await scoped.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [
    TEAM,
    ALICE.id,
  ]);
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('page tree (real Postgres)', () => {
  it('0020 adds a nullable position column and the sibling index, keeping rows; idempotent', async () => {
    await insertPage('legacy', { author: ALICE.email, teamId: TEAM });
    const before = (await scoped.query(`SELECT * FROM wiki_pages WHERE id = $1`, [ids.legacy]))
      .rows[0];

    await scoped.query(MIGRATION);
    await scoped.query(MIGRATION);

    const { rows: columns } = await scoped.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'wiki_pages' AND column_name = 'position'`,
      [SCHEMA]
    );
    expect(columns).toEqual([{ data_type: 'integer', is_nullable: 'YES', column_default: null }]);
    const { rows: indexes } = await scoped.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'wiki_pages'`,
      [SCHEMA]
    );
    expect(indexes.map((i: any) => i.indexname)).toContain('idx_wiki_pages_parent_position');
    const after = (await scoped.query(`SELECT * FROM wiki_pages WHERE id = $1`, [ids.legacy]))
      .rows[0];
    expect({ ...after, position: undefined }).toEqual({ ...before, position: undefined });
    expect(after.position).toBeNull();
    await scoped.query(`DELETE FROM wiki_pages WHERE id = $1`, [ids.legacy]);

    process.env.DATABASE_URL = scopedUrl;
    const { DBStorage } = await import('../../server/storage.js');
    storage = new DBStorage();
  });

  it('lists only readable pages, by scope, with hidden parents collapsed to the root', async () => {
    await insertPage('teamRoot', { author: ALICE.email, teamId: TEAM, createdAt: '2026-01-01' });
    await insertPage('teamChild', { author: ALICE.email, teamId: TEAM, parentKey: 'teamRoot' });
    await insertPage('teamGrandchild', {
      author: ALICE.email,
      teamId: TEAM,
      parentKey: 'teamChild',
    });
    await insertPage('teamSibling', { author: ALICE.email, teamId: TEAM, createdAt: '2026-02-01' });
    // Bob's private page, and Alice's page created under it.
    await insertPage('bobPrivate', { author: BOB.email });
    await grantOwner('bobPrivate', BOB.id);
    await insertPage('aliceUnderBob', { author: ALICE.email, parentKey: 'bobPrivate' });
    await grantOwner('aliceUnderBob', ALICE.id);
    // An open personal page (no permissions): readable by everyone.
    await insertPage('open', { author: BOB.email });

    const all = await storage.getReadablePageTreeRows(ALICE.id);
    const allIds = all.map((r: any) => r.id);
    for (const key of [
      'teamRoot',
      'teamChild',
      'teamGrandchild',
      'teamSibling',
      'aliceUnderBob',
      'open',
    ]) {
      expect(allIds, key).toContain(ids[key]);
    }
    expect(allIds).not.toContain(ids.bobPrivate);

    const tree = buildPageTree(all);
    const orphan = tree.find((n) => n.id === ids.aliceUnderBob);
    expect(orphan?.parentId).toBeNull();
    expect(JSON.stringify(tree)).not.toContain('bobPrivate');
    const root = tree.find((n) => n.id === ids.teamRoot)!;
    expect(root.children.map((c) => c.id)).toEqual([ids.teamChild]);
    expect(root.children[0].children.map((c) => c.id)).toEqual([ids.teamGrandchild]);

    const teamOnly = (await storage.getReadablePageTreeRows(ALICE.id, { teamId: TEAM })).map(
      (r: any) => r.id
    );
    expect(teamOnly.sort()).toEqual(
      [ids.teamRoot, ids.teamChild, ids.teamGrandchild, ids.teamSibling].sort()
    );
    const personal = (await storage.getReadablePageTreeRows(ALICE.id, { personalOnly: true })).map(
      (r: any) => r.id
    );
    expect(personal.sort()).toEqual([ids.aliceUnderBob, ids.open].sort());

    // Bob is not in the team: no team pages at all.
    const bob = (await storage.getReadablePageTreeRows(BOB.id)).map((r: any) => r.id);
    expect(bob).not.toContain(ids.teamRoot);
    expect(bob).not.toContain(ids.aliceUnderBob);
  });

  it('finds descendants at any depth and renumbers readable siblings on a move', async () => {
    expect((await storage.getLiveDescendantIds(ids.teamRoot)).sort()).toEqual(
      [ids.teamChild, ids.teamGrandchild].sort()
    );

    // Unpositioned siblings follow creation time.
    expect(await storage.getReadableSiblingIds(ALICE.id, null, TEAM)).toEqual([
      ids.teamRoot,
      ids.teamSibling,
    ]);

    await storage.placePageInTree(ids.teamGrandchild, null, [
      ids.teamSibling,
      ids.teamGrandchild,
      ids.teamRoot,
    ]);
    expect(await storage.getReadableSiblingIds(ALICE.id, null, TEAM)).toEqual([
      ids.teamSibling,
      ids.teamGrandchild,
      ids.teamRoot,
    ]);
    const { rows } = await scoped.query(`SELECT parent_id FROM wiki_pages WHERE id = $1`, [
      ids.teamGrandchild,
    ]);
    expect(rows[0].parent_id).toBeNull();
    expect(await storage.getLiveDescendantIds(ids.teamRoot)).toEqual([ids.teamChild]);

    // Put it back under the child for the trash test.
    await storage.placePageInTree(ids.teamGrandchild, ids.teamChild, [ids.teamGrandchild]);
  });

  it('restores a subtree trashed together, but not a page trashed on its own before', async () => {
    // The grandchild goes to the trash alone first, then the root with what is left below it.
    expect(await storage.trashPages([ids.teamGrandchild])).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const subtree = [ids.teamRoot, ...(await storage.getLiveDescendantIds(ids.teamRoot))];
    expect(subtree.sort()).toEqual([ids.teamRoot, ids.teamChild].sort());
    expect(await storage.trashPages(subtree)).toBe(2);

    // Cycle checks see through trashed pages; trash rules only take live ones.
    expect((await storage.getAllDescendantIds(ids.teamRoot)).sort()).toEqual(
      [ids.teamChild, ids.teamGrandchild].sort()
    );
    expect(await storage.getLiveDescendantIds(ids.teamRoot)).toEqual([]);

    const together = await storage.getTrashedTogetherIds(ids.teamRoot);
    expect(together.sort()).toEqual([ids.teamRoot, ids.teamChild].sort());
    expect(await storage.getTrashedTogetherIds(ids.teamSibling)).toEqual([]); // not trashed

    await storage.restorePages(together);
    const { rows } = await scoped.query(
      `SELECT id, deleted_at IS NOT NULL AS trashed FROM wiki_pages WHERE id = ANY($1)`,
      [[ids.teamRoot, ids.teamChild, ids.teamGrandchild]]
    );
    const trashed = Object.fromEntries(rows.map((r: any) => [r.id, r.trashed]));
    expect(trashed[ids.teamRoot]).toBe(false);
    expect(trashed[ids.teamChild]).toBe(false);
    expect(trashed[ids.teamGrandchild]).toBe(true);
  });
});
