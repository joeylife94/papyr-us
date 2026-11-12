/**
 * Layer 4: page-derived reads against real Postgres (issue #124 X1b, package P1).
 *
 * Dashboard and overview stats, favorites and the activity feed derived their rows from pages,
 * tasks and comments of the whole instance. They now follow the listing rule of the page lists
 * (DBStorage.listableBy), so a caller only ever reads:
 *   - stats: pages they may list (and the comments on them), tasks of their own teams, the
 *     accounts of their own organization; trashed pages never count on the dashboard;
 *   - favorites: rows whose page is live and listable for them;
 *   - activity: rows of their teams, and team-less rows whose target is a page they may list.
 *
 * Callers are resolved from real users, team_members and organization_members rows
 * (DBStorage.getPageViewer). The tables live in their own schema so this file can run next to
 * the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'page_reads_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TEAM_A = 71;
const TEAM_B = 72;
const ALICE = { id: 1, email: 'alice@example.com' }; // Team A
const BOB = { id: 2, email: 'bob@example.com' }; // Team B
const CAROL = { id: 3, email: 'carol@example.com' }; // no team
const DAVE = { id: 4, email: 'dave@example.com' }; // another organization
const EVE = { id: 5, email: 'eve@example.com' }; // in no organization

let admin: Pool;
let scoped: Pool;
let storage: any;
const page: Record<string, number> = {};

async function insertPage(
  slug: string,
  values: {
    teamId?: number | null;
    author?: string;
    trashed?: boolean;
    organizationId?: number;
  } = {}
): Promise<number> {
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, team_id, deleted_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN NOW() ELSE NULL END) RETURNING id`,
    [
      `Title of ${slug}`,
      slug,
      `body of ${slug}`,
      values.author ?? 'someone@example.com',
      values.teamId ?? null,
      values.trashed ?? false,
    ]
  );
  if (values.organizationId !== undefined) {
    await scoped.query(`UPDATE wiki_pages SET organization_id = $1 WHERE id = $2`, [
      values.organizationId,
      rows[0].id,
    ]);
  }
  page[slug] = rows[0].id;
  return rows[0].id;
}

async function grant(pageId: number, entityType: string, entityId: number | null, level: string) {
  await scoped.query(
    `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
     VALUES ($1, $2, $3, $4)`,
    [pageId, entityType, entityId, level]
  );
}

async function comment(pageId: number) {
  await scoped.query(`INSERT INTO comments (content, author, page_id) VALUES ('c', 'x', $1)`, [
    pageId,
  ]);
}

async function task(teamId: string, status: string, doneAgoDays = 0) {
  await scoped.query(
    `INSERT INTO tasks (title, status, team_id, updated_at)
     VALUES ('t', $1, $2, NOW() - MAKE_INTERVAL(days => $3))`,
    [status, teamId, doneAgoDays]
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
    CREATE TABLE page_views (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      user_id INTEGER, viewed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE page_favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE comments (
      id SERIAL PRIMARY KEY, content TEXT NOT NULL, author TEXT NOT NULL,
      author_user_id INTEGER, page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      parent_id INTEGER, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE tasks (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT,
      status TEXT NOT NULL DEFAULT 'todo', priority INTEGER NOT NULL DEFAULT 3,
      assigned_to INTEGER, team_id TEXT NOT NULL, due_date TIMESTAMP,
      estimated_hours INTEGER, actual_hours INTEGER, progress INTEGER NOT NULL DEFAULT 0,
      tags TEXT[] NOT NULL DEFAULT '{}', linked_page_id INTEGER, created_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE activity_feed (
      id SERIAL PRIMARY KEY, actor_id INTEGER, actor_name TEXT NOT NULL, action TEXT NOT NULL,
      target_type TEXT NOT NULL, target_id INTEGER, target_title TEXT, team_id INTEGER,
      metadata JSONB DEFAULT '{}', created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await scoped.query(
    `INSERT INTO users (id, name, email)
     VALUES ($1, 'Alice', $2), ($3, 'Bob', $4), ($5, 'Carol', $6), ($7, 'Dave', $8), ($9, 'Eve', $10)`,
    [
      ALICE.id,
      ALICE.email,
      BOB.id,
      BOB.email,
      CAROL.id,
      CAROL.email,
      DAVE.id,
      DAVE.email,
      EVE.id,
      EVE.email,
    ]
  );
  await scoped.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [TEAM_A, ALICE.id, TEAM_B, BOB.id]
  );

  // Organizations (issue #124 X1a): the tables as 0022 leaves them, data in the default one.
  await addOrganizations(scoped, undefined, { teams: [TEAM_A, TEAM_B] });
  // A second organization, with Dave as its only member; Eve belongs to none.
  const { rows: acme } = await scoped.query(
    `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
  );
  const ACME = Number(acme[0].id);
  await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
    ACME,
    DAVE.id,
  ]);
  await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [EVE.id]);

  // Pages. Alice's team: two live pages and a trashed one.
  await insertPage('a-one', { teamId: TEAM_A, author: ALICE.email });
  await insertPage('a-two', { teamId: TEAM_A, author: ALICE.email });
  await insertPage('a-trashed', { teamId: TEAM_A, author: ALICE.email, trashed: true });
  // Bob's team, and a private team-less page only Bob may read.
  await insertPage('b-team', { teamId: TEAM_B, author: BOB.email });
  const bPrivate = await insertPage('b-private', { author: BOB.email });
  await grant(bPrivate, 'user', BOB.id, 'owner');
  // A team-less page shared with the public, and an open team-less page.
  const bPublic = await insertPage('b-public', { author: BOB.email });
  await grant(bPublic, 'public', null, 'viewer');
  await insertPage('open', { author: CAROL.email });
  // Another organization: an open page and a publicly shared one.
  await insertPage('acme-open', { author: DAVE.email, organizationId: ACME });
  const acmePublic = await insertPage('acme-public', { author: DAVE.email, organizationId: ACME });
  await grant(acmePublic, 'public', null, 'viewer');

  // Comments: on a live page of Alice's team, on Bob's team page, on an open page, on the
  // trashed page and on another organization's page.
  for (const slug of ['a-one', 'b-team', 'open', 'a-trashed', 'acme-open']) {
    await comment(page[slug]);
  }
  // Tasks: team ids are text. Team A: three open, one finished this week and one long ago.
  await task(String(TEAM_A), 'todo');
  await task(String(TEAM_A), 'todo');
  await task(String(TEAM_A), 'todo');
  await task(String(TEAM_A), 'done');
  await task(String(TEAM_A), 'done', 20);
  await task(String(TEAM_B), 'todo');
  await task('general', 'in_progress'); // belongs to no team of anyone
  await task('99', 'review'); // a team of another organization

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

const viewerOf = (user: { id: number }) => storage.getPageViewer(user.id);

describe('dashboard stats (real Postgres)', () => {
  it('counts live pages the caller may list, their comments and their teams tasks', async () => {
    const stats = await storage.getDashboardStats(await viewerOf(ALICE));

    // a-one, a-two, b-public and open; never the trashed page, Bob's team or the other organization
    expect(stats.totals).toEqual({ pages: 4, tasks: 5, comments: 2, users: 3 });
    expect(stats.recent).toEqual({ pagesThisWeek: 4, tasksCompletedThisWeek: 1 });
    expect(stats.taskBreakdown).toEqual([
      { status: 'todo', count: 3 },
      { status: 'done', count: 2 },
    ]);
    expect(stats.pageGrowth.map((row: { count: number }) => row.count)).toEqual([4]);
    expect(typeof stats.totals.pages).toBe('number');
  });

  it('lists top contributors only from pages the caller may list', async () => {
    const alice = await storage.getDashboardStats(await viewerOf(ALICE));
    expect(alice.topContributors).toEqual([
      { author: ALICE.email, pages_created: 2 },
      { author: BOB.email, pages_created: 1 }, // b-public
      { author: CAROL.email, pages_created: 1 },
    ]);

    const bob = await storage.getDashboardStats(await viewerOf(BOB));
    expect(bob.topContributors).toEqual([
      { author: BOB.email, pages_created: 3 }, // b-team, b-private, b-public
      { author: CAROL.email, pages_created: 1 },
    ]);
    expect(bob.totals).toMatchObject({ pages: 4, tasks: 1, comments: 2 });
  });

  it('gives a caller without a team only the team-less pages and no tasks', async () => {
    const stats = await storage.getDashboardStats(await viewerOf(CAROL));

    expect(stats.totals).toEqual({ pages: 2, tasks: 0, comments: 1, users: 3 });
    expect(stats.taskBreakdown).toEqual([]);
    expect(stats.recent.tasksCompletedThisWeek).toBe(0);
    expect(stats.topContributors.map((row: { author: string }) => row.author).sort()).toEqual(
      [BOB.email, CAROL.email].sort()
    );
  });

  it('shows another organization nothing of the default one, public pages included', async () => {
    const stats = await storage.getDashboardStats(await viewerOf(DAVE));

    expect(stats.totals).toEqual({ pages: 2, tasks: 0, comments: 1, users: 1 });
    expect(stats.topContributors).toEqual([{ author: DAVE.email, pages_created: 2 }]);
    expect(stats.taskBreakdown).toEqual([]);
    const text = JSON.stringify(stats);
    for (const email of [ALICE.email, BOB.email, CAROL.email]) expect(text).not.toContain(email);
  });

  it('answers zeros and empty lists for an account in no organization and for no session', async () => {
    for (const who of [await viewerOf(EVE), await storage.getPageViewer(undefined)]) {
      const stats = await storage.getDashboardStats(who);
      expect(stats.totals).toEqual({ pages: 0, tasks: 0, comments: 0, users: 0 });
      expect(stats.recent).toEqual({ pagesThisWeek: 0, tasksCompletedThisWeek: 0 });
      expect(stats.pageGrowth).toEqual([]);
      expect(stats.topContributors).toEqual([]);
      expect(stats.taskBreakdown).toEqual([]);
    }
  });
});

describe('stats overview (real Postgres)', () => {
  it('counts what the caller may list, trashed pages and their comments included', async () => {
    const overview = await storage.getStatsOverview(await viewerOf(ALICE));

    expect(overview).toEqual({
      totalPages: 5, // a-one, a-two, a-trashed, b-public, open
      totalUsers: 3,
      totalTasks: 5,
      totalComments: 3, // a-one, a-trashed, open
      pagesThisWeek: 5,
      tasksByStatus: { todo: 3, done: 2 },
    });
  });

  it('scopes every caller the same way as the dashboard', async () => {
    expect(await storage.getStatsOverview(await viewerOf(BOB))).toEqual({
      totalPages: 4,
      totalUsers: 3,
      totalTasks: 1,
      totalComments: 2,
      pagesThisWeek: 4,
      tasksByStatus: { todo: 1 },
    });
    expect(await storage.getStatsOverview(await viewerOf(CAROL))).toEqual({
      totalPages: 2,
      totalUsers: 3,
      totalTasks: 0,
      totalComments: 1,
      pagesThisWeek: 2,
      tasksByStatus: {},
    });
    expect(await storage.getStatsOverview(await viewerOf(DAVE))).toEqual({
      totalPages: 2,
      totalUsers: 1,
      totalTasks: 0,
      totalComments: 1,
      pagesThisWeek: 2,
      tasksByStatus: {},
    });
  });

  it('answers zeros for an account in no organization and for no session', async () => {
    for (const who of [await viewerOf(EVE), await storage.getPageViewer(undefined)]) {
      expect(await storage.getStatsOverview(who)).toEqual({
        totalPages: 0,
        totalUsers: 0,
        totalTasks: 0,
        totalComments: 0,
        pagesThisWeek: 0,
        tasksByStatus: {},
      });
    }
  });
});

describe('per-page view counts (real Postgres)', () => {
  it('records views of a page and counts them in the windows the route reports', async () => {
    const target = await insertPage('viewed', { teamId: TEAM_A, author: ALICE.email });
    const other = await insertPage('viewed-other', { teamId: TEAM_A, author: ALICE.email });
    await storage.recordPageView(target, ALICE.id);
    await storage.recordPageView(target, ALICE.id);
    await storage.recordPageView(target, null);
    await storage.recordPageView(other, BOB.id);
    await scoped.query(
      `INSERT INTO page_views (page_id, user_id, viewed_at)
       VALUES ($1, $2, NOW() - INTERVAL '10 days'), ($1, $3, NOW() - INTERVAL '40 days')`,
      [target, BOB.id, CAROL.id]
    );

    const stats = await storage.getPageViewStats(target);

    expect(stats.totalViews).toBe(5);
    expect(stats.uniqueViewers).toBe(3); // Alice, Bob, Carol; a signed-out view is not a viewer
    expect(stats.viewsLast7Days).toBe(3);
    expect(stats.dailyViews.map((row: { count: number }) => Number(row.count))).toEqual([1, 3]);
    expect(await storage.getPageViewStats(2147483000)).toEqual({
      totalViews: 0,
      uniqueViewers: 0,
      viewsLast7Days: 0,
      dailyViews: [],
    });
  });
});

describe('favorites (real Postgres)', () => {
  const favorite = (userId: number, slug: string) =>
    scoped.query(`INSERT INTO page_favorites (user_id, page_id) VALUES ($1, $2)`, [
      userId,
      page[slug],
    ]);
  const slugsOf = async (user: { id: number }) =>
    (await storage.getFavoritePages(await viewerOf(user))).map(
      (row: { pageSlug: string }) => row.pageSlug
    );

  beforeAll(async () => {
    // Rows a caller could only have created before the rule, or before losing access.
    for (const slug of ['a-one', 'a-trashed', 'b-team', 'acme-open', 'acme-public', 'b-private']) {
      await favorite(ALICE.id, slug);
    }
    await favorite(ALICE.id, 'open');
    await favorite(ALICE.id, 'b-public');
    await favorite(DAVE.id, 'a-one');
    await favorite(DAVE.id, 'b-public');
    await favorite(DAVE.id, 'acme-open');
    await favorite(CAROL.id, 'a-one');
    await favorite(CAROL.id, 'open');
    await favorite(BOB.id, 'a-one'); // Bob has another team's page and a granted one
  });

  it('lists only favorites whose page is live and listable for the caller', async () => {
    // never the trashed page, Bob's team page, a private page, or another organization's page
    expect((await slugsOf(ALICE)).sort()).toEqual(['a-one', 'b-public', 'open']);
    expect((await slugsOf(CAROL)).sort()).toEqual(['open']);
    expect(await slugsOf(BOB)).toEqual([]);
  });

  it('shows another organization only its own pages, a public page of the default one never', async () => {
    expect(await slugsOf(DAVE)).toEqual(['acme-open']);
  });

  it('lists nothing for an account in no organization and for no session', async () => {
    await favorite(EVE.id, 'open');
    expect(await storage.getFavoritePages(await viewerOf(EVE))).toEqual([]);
    expect(await storage.getFavoritePages(await storage.getPageViewer(undefined))).toEqual([]);
  });

  it('keeps the newest-first order and the row shape', async () => {
    await scoped.query(
      `UPDATE page_favorites SET created_at = NOW() - INTERVAL '1 day'
                        WHERE user_id = $1 AND page_id = $2`,
      [ALICE.id, page['a-one']]
    );
    const rows = await storage.getFavoritePages(await viewerOf(ALICE));
    expect(rows.map((row: { pageSlug: string }) => row.pageSlug).at(-1)).toBe('a-one');
    expect(Object.keys(rows[0]).sort()).toEqual([
      'createdAt',
      'id',
      'pageFolder',
      'pageId',
      'pageSlug',
      'pageTitle',
      'pageUpdatedAt',
    ]);
  });

  it('hides rows without deleting them', async () => {
    const { rows } = await scoped.query(
      `SELECT count(*)::int AS n FROM page_favorites WHERE user_id = $1`,
      [ALICE.id]
    );
    expect(rows[0].n).toBe(8);
  });

  it('allows a favorite only for a live page the caller may list', async () => {
    const alice = await viewerOf(ALICE);
    for (const slug of ['a-one', 'a-two', 'open', 'b-public']) {
      expect(await storage.isPageListableBy(alice, page[slug]), slug).toBe(true);
    }
    for (const slug of ['a-trashed', 'b-team', 'b-private', 'acme-open', 'acme-public']) {
      expect(await storage.isPageListableBy(alice, page[slug]), slug).toBe(false);
    }
    expect(await storage.isPageListableBy(alice, 2147483000)).toBe(false);

    const carol = await viewerOf(CAROL);
    expect(await storage.isPageListableBy(carol, page['a-one'])).toBe(false);
    expect(await storage.isPageListableBy(carol, page['open'])).toBe(true);
    const dave = await viewerOf(DAVE);
    expect(await storage.isPageListableBy(dave, page['b-public'])).toBe(false);
    expect(await storage.isPageListableBy(dave, page['acme-public'])).toBe(true);
    expect(await storage.isPageListableBy(await viewerOf(EVE), page['open'])).toBe(false);
    expect(
      await storage.isPageListableBy(await storage.getPageViewer(undefined), page['b-public'])
    ).toBe(false);
  });

  it('adds a favorite once per user and page', async () => {
    const first = await storage.addPageFavorite(CAROL.id, page['b-public']);
    expect(first).toMatchObject({ userId: CAROL.id, pageId: page['b-public'] });
    expect(await storage.addPageFavorite(CAROL.id, page['b-public'])).toBeNull();
    expect((await slugsOf(CAROL)).sort()).toEqual(['b-public', 'open']);
  });

  it('honours team revocation at once', async () => {
    await scoped.query(`DELETE FROM team_members WHERE user_id = $1`, [ALICE.id]);
    expect((await slugsOf(ALICE)).sort()).toEqual(['b-public', 'open']);
    await scoped.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [TEAM_A, ALICE.id]
    );
    expect((await slugsOf(ALICE)).sort()).toEqual(['a-one', 'b-public', 'open']);
  });
});

describe('activity feed (real Postgres)', () => {
  let minutes = 0;
  /** One row; `label` is stored as the target title so assertions can name rows. Later rows are older. */
  const activity = (
    label: string,
    values: { type: string; targetId?: number | null; teamId?: number | null; action?: string }
  ) =>
    scoped.query(
      `INSERT INTO activity_feed (actor_name, action, target_type, target_id, target_title, team_id, created_at)
       VALUES ('Someone', $1, $2, $3, $4, $5, NOW() - MAKE_INTERVAL(mins => $6))`,
      [
        values.action ?? 'page_updated',
        values.type,
        values.targetId ?? null,
        label,
        values.teamId ?? null,
        ++minutes,
      ]
    );
  const labelsOf = async (
    who: { id: number } | undefined,
    options: { limit?: number; offset?: number; action?: string; targetType?: string } = {}
  ) =>
    (
      await storage.getActivityFeed(await storage.getPageViewer(who?.id), {
        limit: options.limit ?? 100,
        offset: options.offset ?? 0,
        action: options.action,
        targetType: options.targetType,
      })
    ).map((row: { targetTitle: string }) => row.targetTitle);

  beforeAll(async () => {
    await activity('team-a', { type: 'page', teamId: TEAM_A, targetId: page['a-one'] });
    await activity('team-b', { type: 'task', teamId: TEAM_B, action: 'task_completed' });
    // Team-less rows about pages
    await activity('page-open', { type: 'page', targetId: page['open'] });
    await activity('page-a-one', { type: 'page', targetId: page['a-one'] });
    await activity('page-b-private', { type: 'page', targetId: page['b-private'] });
    await activity('page-b-public', { type: 'page', targetId: page['b-public'] });
    await activity('page-a-trashed', { type: 'page', targetId: page['a-trashed'] });
    await activity('page-acme-open', { type: 'page', targetId: page['acme-open'] });
    await activity('page-acme-public', { type: 'page', targetId: page['acme-public'] });
    await activity('page-no-target', { type: 'page', targetId: null });
    await activity('page-unknown-target', { type: 'page', targetId: 2147483000 });
    // Team-less rows about anything else, even when the id happens to be a listable page's id
    await activity('task-open-id', {
      type: 'task',
      targetId: page['open'],
      action: 'task_completed',
    });
    await activity('team-row', { type: 'team', targetId: page['open'], action: 'team_created' });
    await activity('comment-open-id', { type: 'comment', targetId: page['open'] });
  });

  it('shows a caller their teams rows and team-less rows about pages they may list', async () => {
    expect(await labelsOf(ALICE)).toEqual(['team-a', 'page-open', 'page-a-one', 'page-b-public']);
    expect(await labelsOf(BOB)).toEqual(['team-b', 'page-open', 'page-b-private', 'page-b-public']);
  });

  it('gives a caller without a team only team-less rows about pages they may list', async () => {
    expect(await labelsOf(CAROL)).toEqual(['page-open', 'page-b-public']);
  });

  it('hides every team-less row that is not about a listable page, from everyone', async () => {
    const hidden = [
      'task-open-id',
      'team-row',
      'comment-open-id',
      'page-no-target',
      'page-unknown-target',
      'page-a-trashed',
    ];
    for (const user of [ALICE, BOB, CAROL, DAVE, EVE]) {
      const seen = await labelsOf(user);
      for (const label of hidden) expect(seen, `user ${user.id} ${label}`).not.toContain(label);
    }
    expect(await labelsOf(undefined)).toEqual([]);
  });

  it('shows another organization nothing of the default one', async () => {
    expect(await labelsOf(DAVE)).toEqual(['page-acme-open', 'page-acme-public']);
    expect(await labelsOf(EVE)).toEqual([]);
    for (const user of [ALICE, BOB, CAROL]) {
      const seen = await labelsOf(user);
      expect(seen).not.toContain('page-acme-open');
      expect(seen).not.toContain('page-acme-public');
    }
  });

  it('keeps the filters, the newest-first order and the paging', async () => {
    expect(await labelsOf(ALICE, { action: 'page_updated' })).toEqual([
      'team-a',
      'page-open',
      'page-a-one',
      'page-b-public',
    ]);
    expect(await labelsOf(BOB, { targetType: 'task' })).toEqual(['team-b']);
    expect(await labelsOf(BOB, { action: 'team_created' })).toEqual([]);
    expect(await labelsOf(ALICE, { limit: 2 })).toEqual(['team-a', 'page-open']);
    expect(await labelsOf(ALICE, { limit: 2, offset: 2 })).toEqual(['page-a-one', 'page-b-public']);
    expect(await labelsOf(ALICE, { offset: -5 })).toHaveLength(4);
  });

  it('honours team revocation at once', async () => {
    await scoped.query(`DELETE FROM team_members WHERE user_id = $1`, [ALICE.id]);
    expect(await labelsOf(ALICE)).toEqual(['page-open', 'page-b-public']);
    await scoped.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [TEAM_A, ALICE.id]
    );
    expect(await labelsOf(ALICE)).toHaveLength(4);
  });

  it('returns whole rows, as the route answered before', async () => {
    const [row] = await storage.getActivityFeed(await viewerOf(ALICE), { limit: 1, offset: 0 });
    expect(Object.keys(row).sort()).toEqual([
      'action',
      'actorId',
      'actorName',
      'createdAt',
      'id',
      'metadata',
      'targetId',
      'targetTitle',
      'targetType',
      'teamId',
    ]);
  });
});
