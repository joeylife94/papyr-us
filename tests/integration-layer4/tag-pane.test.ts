/**
 * Layer 4: the tag pane (#137) against real Postgres.
 *
 * GET /api/tags/tree and /api/tags/pages count a page's `tags` field and the inline `#tags` of
 * its content, read at query time from the pages of one scope the viewer can list
 * (DBStorage.getTagPaneRows / getTagPaneContent, both on `readablePagesInScope`). Proven here:
 *   - a tag used only on other teams' pages, on private pages of other users or on trashed pages
 *     never appears, and no count includes such a page, even when the tag also exists in scope;
 *   - inline tags count (code does not), and the content query re-applies the read rule;
 *   - the scope is respected: a team's tags are not the personal tags, and a viewer outside the
 *     team gets nothing even when asking storage directly.
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

const SCHEMA = 'tag_pane_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TEAM = 51;
const OTHER_TEAM = 52;
const MEMBER = { userId: 1, email: 'member@example.com', teamIds: [TEAM] };
const STRANGER = { userId: 2, email: 'stranger@example.com', teamIds: [] as number[] };

let admin: Pool;
let scoped: Pool;
let storage: any;
let tagPane: typeof import('../../server/services/tag-pane.js');
const ids: Record<string, number> = {};

async function insertPage(
  key: string,
  values: {
    teamId?: number | null;
    author?: string;
    trashed?: boolean;
    tags?: string[];
    content?: string;
    minutesAgo?: number;
  }
) {
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, team_id, tags, deleted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN NOW() ELSE NULL END,
             NOW() - make_interval(mins => $8))
     RETURNING id`,
    [
      key,
      `${key}-slug`,
      values.content ?? '',
      values.author ?? 'someone@example.com',
      values.teamId ?? null,
      values.tags ?? [],
      values.trashed ?? false,
      values.minutesAgo ?? 0,
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

  // The team's pages: field tags, inline tags (one in code), and a trashed page.
  await insertPage('team-plan', {
    teamId: TEAM,
    tags: ['project/alpha'],
    content: 'Plan with #project/beta and #shared.\n\n```\n#in-code\n```',
    minutesAgo: 1,
  });
  await insertPage('team-inline', {
    teamId: TEAM,
    content: '# Notes\n\n- [ ] #inline-only follow-up',
    minutesAgo: 2,
  });
  await insertPage('team-headings', { teamId: TEAM, content: '# Only a heading', minutesAgo: 3 });
  await insertPage('team-trashed', {
    teamId: TEAM,
    tags: ['trashed-only', 'project/alpha'],
    content: '#trashed-inline',
    trashed: true,
  });
  // Another team's pages, one of them granted to the member: never listed in any scope.
  await insertPage('other-team', {
    teamId: OTHER_TEAM,
    tags: ['other-team-only', 'project/alpha'],
    content: '#other-inline #shared',
  });
  await insertPage('other-team-granted', { teamId: OTHER_TEAM, tags: ['granted-other-team'] });
  await grant('other-team-granted', 'user', MEMBER.userId, 'owner');
  // Team-less pages: open to everyone, private to the stranger, and the member's own.
  await insertPage('personal-open', { content: '#personal-open #shared', minutesAgo: 5 });
  await insertPage('stranger-private', {
    author: STRANGER.email,
    tags: ['private-only'],
    content: '#private-inline #shared',
  });
  await grant('stranger-private', 'user', STRANGER.userId, 'owner');
  await insertPage('member-own', {
    author: MEMBER.email,
    tags: ['mine'],
    content: 'a #mine/sub tag',
    minutesAgo: 4,
  });
  await grant('member-own', 'user', MEMBER.userId, 'owner');

  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
  tagPane = await import('../../server/services/tag-pane.js');
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

const counts = (list: { tags: Array<{ name: string; count: number }> }) =>
  Object.fromEntries(list.tags.map((tag) => [tag.name, tag.count]));

describe('tag pane (real Postgres)', () => {
  it("counts a team's field and inline tags, never other teams', private or trashed pages", async () => {
    const list = await tagPane.getTagPaneList(storage, MEMBER, TEAM);
    expect(counts(list)).toEqual({
      project: 1,
      'project/alpha': 1,
      'project/beta': 1,
      shared: 1,
      'inline-only': 1,
    });
    expect(list.scannedPages).toBe(3);
    expect(list.truncated).toEqual({ pages: false, tags: false });
  });

  it('lists the pages of a tag in scope only, newest first', async () => {
    const project = await tagPane.getTagPanePages(storage, MEMBER, TEAM, 'project');
    expect(project.pages.map((page) => page.title)).toEqual(['team-plan']);
    expect(project.pages[0].tags).toEqual(['project/alpha', 'project/beta']);
    expect(project.total).toBe(1);

    const shared = await tagPane.getTagPanePages(storage, MEMBER, TEAM, 'shared');
    expect(shared.pages.map((page) => page.title)).toEqual(['team-plan']);
    for (const tag of ['other-team-only', 'other-inline', 'trashed-only', 'trashed-inline']) {
      expect((await tagPane.getTagPanePages(storage, MEMBER, TEAM, tag)).pages).toEqual([]);
    }
    expect(JSON.stringify(project)).not.toContain('Plan with');
  });

  it("keeps the personal scope to the viewer's readable team-less pages", async () => {
    expect(counts(await tagPane.getTagPaneList(storage, MEMBER, null))).toEqual({
      mine: 1,
      'mine/sub': 1,
      'personal-open': 1,
      shared: 1,
    });
    expect(counts(await tagPane.getTagPaneList(storage, STRANGER, null))).toEqual({
      'personal-open': 1,
      'private-only': 1,
      'private-inline': 1,
      shared: 2,
    });
    const shared = await tagPane.getTagPanePages(storage, STRANGER, null, 'shared');
    expect(shared.pages.map((page) => page.title).sort()).toEqual([
      'personal-open',
      'stranger-private',
    ]);
  });

  it('gives a viewer outside the team nothing, even asking storage directly', async () => {
    expect((await tagPane.getTagPaneList(storage, STRANGER, TEAM)).tags).toEqual([]);
    expect(await tagPane.getTagPaneList(storage, MEMBER, OTHER_TEAM)).toMatchObject({
      tags: [],
      scannedPages: 0,
    });
    // The content query applies the read rule on its own, whatever ids it is given.
    const leaked = await storage.getTagPaneContent(
      MEMBER,
      TEAM,
      [ids['other-team'], ids['stranger-private'], ids['team-trashed']],
      1000
    );
    expect(leaked).toEqual([]);
  });

  it('reads only the start of the content, and none of a page without a possible tag', async () => {
    const rows = await storage.getTagPaneContent(
      MEMBER,
      TEAM,
      [ids['team-plan'], ids['team-headings'], ids['team-inline']],
      12
    );
    expect(rows.map((row: { id: number }) => row.id).sort()).toEqual(
      [ids['team-plan'], ids['team-inline']].sort()
    );
    for (const row of rows) expect(row.content.length).toBeLessThanOrEqual(12);
  });
});
