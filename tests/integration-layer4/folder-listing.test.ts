/**
 * Layer 4: the folder name list against real Postgres (#130).
 *
 * GET /api/folders returned the folder of every live page in the instance to anyone. It now
 * reads DBStorage.getReadableFolders, which applies the listing rule of the folder page list:
 *   - a folder appears when it holds at least one live page the caller may list (their teams'
 *     pages and team-less pages they can read);
 *   - a folder holding only another team's pages (even with a grant to the caller), a private
 *     page with explicit permissions for someone else, or trashed pages does not appear;
 *   - every listed folder has pages in GET /api/folders/:folder/pages for the same caller, and
 *     every folder with pages there is listed;
 *   - leaving a team removes its folders at once.
 *
 * Callers are resolved from real users and team_members rows (DBStorage.getPageViewer). The
 * tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'folder_listing_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TEAM_A = 51;
const TEAM_B = 52;
const ALICE = { id: 1, email: 'alice@example.com' }; // Team A
const BOB = { id: 2, email: 'bob@example.com' }; // Team B
const CAROL = { id: 3, email: 'carol@example.com' }; // no team

let admin: Pool;
let scoped: Pool;
let storage: any;

async function insertPage(
  slug: string,
  folder: string,
  values: { teamId?: number | null; author?: string; trashed?: boolean } = {}
): Promise<number> {
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, folder, author, team_id, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN NOW() ELSE NULL END) RETURNING id`,
    [
      slug,
      slug,
      `body of ${slug}`,
      folder,
      values.author ?? 'someone@example.com',
      values.teamId ?? null,
      values.trashed ?? false,
    ]
  );
  return rows[0].id;
}

async function grant(pageId: number, entityType: string, entityId: number | null, level: string) {
  await scoped.query(
    `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
     VALUES ($1, $2, $3, $4)`,
    [pageId, entityType, entityId, level]
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
    CREATE TABLE wiki_pages (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
      blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs',
      tags TEXT[] NOT NULL DEFAULT '{}', author TEXT NOT NULL, parent_id INTEGER,
      position INTEGER, icon TEXT, team_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE, metadata JSONB DEFAULT '{}',
      deleted_at TIMESTAMP
    );
    CREATE TABLE page_permissions (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL, entity_id INTEGER, permission TEXT NOT NULL, granted_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await scoped.query(
    `INSERT INTO users (id, name, email) VALUES ($1, 'Alice', $2), ($3, 'Bob', $4), ($5, 'Carol', $6)`,
    [ALICE.id, ALICE.email, BOB.id, BOB.email, CAROL.id, CAROL.email]
  );
  await scoped.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [TEAM_A, ALICE.id, TEAM_B, BOB.id]
  );

  // Both teams use the same folder name.
  await insertPage('a-shared', 'shared', { teamId: TEAM_A, author: ALICE.email });
  await insertPage('b-shared', 'shared', { teamId: TEAM_B, author: BOB.email });
  // Folders holding only one team's pages.
  await insertPage('a-only', 'team-a-roadmap', { teamId: TEAM_A, author: ALICE.email });
  await insertPage('b-only', 'team-b-roadmap', { teamId: TEAM_B, author: BOB.email });
  // A Team A page granted to Bob and to Team B: readable by id, but outside Bob's listing scope.
  const granted = await insertPage('a-granted', 'team-a-granted', {
    teamId: TEAM_A,
    author: ALICE.email,
  });
  await grant(granted, 'user', BOB.id, 'viewer');
  await grant(granted, 'team', TEAM_B, 'viewer');
  // A private personal page: its explicit permissions deny everyone but Bob.
  const privatePage = await insertPage('b-private', 'bob-private', { author: BOB.email });
  await grant(privatePage, 'user', BOB.id, 'owner');
  // A personal page shared with the public.
  const publicPage = await insertPage('b-public', 'bob-public', { author: BOB.email });
  await grant(publicPage, 'public', null, 'viewer');
  // An open team-less page (no permissions): readable by anyone signed in.
  await insertPage('open', 'open-notes');
  // Folders holding only trashed pages, even the caller's own team's.
  await insertPage('a-trashed', 'team-a-trash', {
    teamId: TEAM_A,
    author: ALICE.email,
    trashed: true,
  });
  await insertPage('open-trashed', 'open-trash', { trashed: true });
  // A live Team A page next to a trashed Team B page.
  await insertPage('a-mixed', 'mixed', { teamId: TEAM_A, author: ALICE.email });
  await insertPage('b-mixed-trashed', 'mixed', {
    teamId: TEAM_B,
    author: BOB.email,
    trashed: true,
  });

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

async function allFolderNames(): Promise<string[]> {
  const { rows } = await scoped.query('SELECT DISTINCT folder FROM wiki_pages ORDER BY folder');
  return rows.map((row: { folder: string }) => row.folder);
}

describe('folder listing (real Postgres)', () => {
  it('lists only folders holding a live page the caller may list, sorted by name', async () => {
    expect(await storage.getReadableFolders(ALICE.id)).toEqual([
      'bob-public',
      'mixed',
      'open-notes',
      'shared',
      'team-a-granted',
      'team-a-roadmap',
    ]);
    expect(await storage.getReadableFolders(BOB.id)).toEqual([
      'bob-private',
      'bob-public',
      'open-notes',
      'shared',
      'team-b-roadmap',
    ]);
    expect(await storage.getReadableFolders(CAROL.id)).toEqual(['bob-public', 'open-notes']);
  });

  it('leaves out other teams, private pages, grants outside the listing scope and trash', async () => {
    const bob = await storage.getReadableFolders(BOB.id);
    for (const hidden of ['team-a-roadmap', 'team-a-granted', 'team-a-trash', 'mixed']) {
      expect(bob).not.toContain(hidden);
    }
    const alice = await storage.getReadableFolders(ALICE.id);
    for (const hidden of ['team-b-roadmap', 'bob-private', 'team-a-trash', 'open-trash']) {
      expect(alice).not.toContain(hidden);
    }
  });

  it('agrees with the folder page list for every caller and folder', async () => {
    const folders = await allFolderNames();
    for (const user of [ALICE, BOB, CAROL]) {
      const listed = await storage.getReadableFolders(user.id);
      const withPages: string[] = [];
      for (const folder of folders) {
        const pages = await storage.getReadableWikiPagesByFolder(folder, user.id);
        if (pages.length > 0) withPages.push(folder);
      }
      expect(listed, `user ${user.id}`).toEqual(withPages);
    }
  });

  it('drops a team folder as soon as the caller leaves the team', async () => {
    await scoped.query('DELETE FROM team_members WHERE user_id = $1', [ALICE.id]);
    try {
      expect(await storage.getReadableFolders(ALICE.id)).toEqual(['bob-public', 'open-notes']);
    } finally {
      await scoped.query(
        `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [TEAM_A, ALICE.id]
      );
    }
  });
});
