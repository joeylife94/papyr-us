/**
 * Page-derived reads follow the page read boundary (issue #124 X1b, package P1), end to end
 * against the real server, authentication, organizations and PostgreSQL. Synthetic users,
 * teams and pages only. The route-level rules are in server/tests/page-reads-scope-route.test.ts
 * and the SQL rules in tests/integration-layer4/page-reads-scope.test.ts.
 *
 * There is no API to create an organization yet (#124 X1c), so the spec creates a second one in
 * the database (DATABASE_URL) and moves one freshly registered account into it, as
 * tests/security-organizations.spec.ts does.
 *
 * Rules under test:
 * - dashboard and overview stats need a session and count only what the caller may list;
 * - per-page analytics follow the page read rule: recording a view and reading the counts are
 *   refused for a page the caller cannot read, and a refused view is not recorded;
 * - favorites: a page the caller may not list cannot be favorited and never appears;
 * - activity feed: only rows of the caller's teams and team-less rows about pages they may list.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const DATABASE_URL = process.env.DATABASE_URL;

type Account = { email: string; password: string };

/**
 * Two organizations: the default one holds ownerA (team A), memberA (admitted to team A) and
 * solo (no team); `outsider` is alone in a second organization with its own team X.
 */
async function arrange(request: APIRequestContext, prefix: string) {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
  const db = new Pool({ connectionString: DATABASE_URL });
  const stamp = Date.now();

  const accounts: Record<'ownerA' | 'memberA' | 'solo' | 'outsider', Account> = {
    ownerA: await registerTestUser(request, `${prefix}-owner-a`),
    memberA: await registerTestUser(request, `${prefix}-member-a`),
    solo: await registerTestUser(request, `${prefix}-solo`),
    outsider: await registerTestUser(request, `${prefix}-outsider`),
  };
  const ctx = {
    ownerA: await createAuthenticatedApiContext(accounts.ownerA.email, accounts.ownerA.password),
    memberA: await createAuthenticatedApiContext(accounts.memberA.email, accounts.memberA.password),
    solo: await createAuthenticatedApiContext(accounts.solo.email, accounts.solo.password),
    outsider: await createAuthenticatedApiContext(
      accounts.outsider.email,
      accounts.outsider.password
    ),
    anonymous: await playwrightRequest.newContext({ baseURL: BASE_URL }),
  };

  const idOf = async (c: APIRequestContext) =>
    Number((await (await c.get('/api/auth/me')).json()).id);
  const createTeam = async (c: APIRequestContext, name: string) => {
    const response = await c.post('/api/teams', {
      data: { name: `${name}-${stamp}`, displayName: `${name} ${stamp}` },
    });
    expect(response.status(), `create team ${name}`).toBe(201);
    return (await response.json()) as { id: number };
  };
  const createPage = async (
    c: APIRequestContext,
    author: string,
    slug: string,
    teamId?: number
  ) => {
    const response = await c.post('/api/pages', {
      data: {
        title: `Reads check ${slug}`,
        content: `content of ${slug}`,
        folder: `${prefix}-${stamp}`,
        tags: [],
        slug,
        author,
        teamId,
      },
    });
    expect(response.status(), `create ${slug}`).toBe(201);
    return (await response.json()) as { id: number; slug: string };
  };

  const teamA = await createTeam(ctx.ownerA, `${prefix}-team-a`);
  const admit = await ctx.ownerA.post(`/api/teams/${teamA.id}/memberships`, {
    data: { email: accounts.memberA.email },
  });
  expect(admit.status()).toBe(201);
  const memberAUserId = Number((await admit.json()).userId);

  const org = await db.query(
    `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
    [`${prefix}-org-${stamp}`]
  );
  await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
    org.rows[0].id,
    await idOf(ctx.outsider),
  ]);
  const teamX = await createTeam(ctx.outsider, `${prefix}-team-x`);

  const slug = (name: string) => `${prefix}-${name}-${stamp}`;
  const pages = {
    aTeam: await createPage(ctx.ownerA, accounts.ownerA.email, slug('a-team'), teamA.id),
    // team-less, shared with the public
    aPublic: await createPage(ctx.ownerA, accounts.ownerA.email, slug('a-public')),
    // team-less, no explicit permissions: open to the organization
    aOpen: await createPage(ctx.ownerA, accounts.ownerA.email, slug('a-open')),
    xTeam: await createPage(ctx.outsider, accounts.outsider.email, slug('x-team'), teamX.id),
  };
  const share = await ctx.ownerA.post(`/api/pages/${pages.aPublic.id}/permissions`, {
    data: { entityType: 'public', permission: 'viewer' },
  });
  expect(share.status()).toBe(201);
  await db.query('DELETE FROM page_permissions WHERE page_id = $1', [pages.aOpen.id]);

  const close = async () => {
    for (const c of Object.values(ctx)) await c.dispose();
    await db.end();
  };
  return { accounts, ctx, pages, teamA, teamX, memberAUserId, db, stamp, close };
}

test.describe('Page-derived reads follow the page read boundary', () => {
  test('stats need a session and count only what the caller may list', async ({ request }) => {
    test.setTimeout(240_000);
    const world = await arrange(request, 'secpr-stats');
    const { ctx, accounts } = world;
    try {
      // ── 1. No session, no figures, whatever the write-auth setting ──
      for (const path of ['/api/stats/dashboard', '/api/stats/overview']) {
        const anonymous = await ctx.anonymous.get(path);
        expect(anonymous.status(), `anonymous ${path}`).toBe(401);
        const forged = await ctx.anonymous.get(path, {
          headers: { Cookie: 'accessToken=not-a-valid-token' },
        });
        expect(forged.status(), `invalid token ${path}`).toBe(401);
      }

      // ── 2. The outsider's figures hold nothing of the default organization ──
      const outsiderDashboard = await ctx.outsider.get('/api/stats/dashboard');
      expect(outsiderDashboard.status()).toBe(200);
      const dashboard = await outsiderDashboard.json();
      expect(Object.keys(dashboard).sort()).toEqual([
        'pageGrowth',
        'recent',
        'taskBreakdown',
        'topContributors',
        'totals',
      ]);
      const authors = dashboard.topContributors.map((row: { author: string }) => row.author);
      expect(authors).toEqual([accounts.outsider.email]);
      expect(dashboard.totals.users, 'accounts of the outsider organization').toBe(1);
      expect(dashboard.totals.pages).toBe(1);
      expect(dashboard.totals.tasks).toBe(0);
      const outsiderText = JSON.stringify(dashboard);
      for (const who of [accounts.ownerA, accounts.memberA, accounts.solo]) {
        expect(outsiderText).not.toContain(who.email);
      }

      const outsiderOverview = await (await ctx.outsider.get('/api/stats/overview')).json();
      expect(outsiderOverview).toMatchObject({
        totalPages: 1,
        totalUsers: 1,
        totalTasks: 0,
        pagesThisWeek: 1,
        tasksByStatus: {},
      });

      // ── 3. A caller of the default organization sees their own side only ──
      const ownerDashboard = await (await ctx.ownerA.get('/api/stats/dashboard')).json();
      const ownerAuthors = ownerDashboard.topContributors.map(
        (row: { author: string }) => row.author
      );
      expect(ownerAuthors).toContain(accounts.ownerA.email);
      expect(ownerAuthors).not.toContain(accounts.outsider.email);
      expect(ownerDashboard.totals.users).toBeGreaterThanOrEqual(3);
      expect(ownerDashboard.totals.pages).toBeGreaterThanOrEqual(3);
      expect(typeof ownerDashboard.totals.pages).toBe('number');

      const soloDashboard = await (await ctx.solo.get('/api/stats/dashboard')).json();
      expect(JSON.stringify(soloDashboard)).not.toContain(accounts.outsider.email);
      const soloOverview = await (await ctx.solo.get('/api/stats/overview')).json();
      expect(Object.keys(soloOverview).sort()).toEqual([
        'pagesThisWeek',
        'tasksByStatus',
        'totalComments',
        'totalPages',
        'totalTasks',
        'totalUsers',
      ]);
      // a caller without a team has no team page in their count
      expect(soloOverview.totalPages).toBeLessThan(
        (await (await ctx.ownerA.get('/api/stats/overview')).json()).totalPages
      );
    } finally {
      await world.close();
    }
  });
  test('per-page analytics are refused for a page the caller cannot read', async ({ request }) => {
    test.setTimeout(240_000);
    const world = await arrange(request, 'secpr-views');
    const { ctx, pages, accounts } = world;
    try {
      const statsOf = async (page: { id: number }) => {
        const response = await ctx.ownerA.get(`/api/pages/${page.id}/analytics`);
        expect(response.status()).toBe(200);
        return (await response.json()) as {
          totalViews: number;
          uniqueViewers: number;
          viewsLast7Days: number;
          dailyViews: unknown[];
        };
      };
      const before = await statsOf(pages.aTeam);

      // ── 1. Another organization: no view recorded, no counts, on any page not shared ──
      for (const page of [pages.aTeam, pages.aOpen]) {
        const view = await ctx.outsider.post(`/api/pages/${page.id}/view`);
        expect(view.status(), `outsider view ${page.slug}`).toBe(403);
        expect(await view.text()).not.toContain('recorded');
        const analytics = await ctx.outsider.get(`/api/pages/${page.id}/analytics`);
        expect(analytics.status(), `outsider analytics ${page.slug}`).toBe(403);
        expect(await analytics.text()).not.toContain('totalViews');
      }
      // ── 2. Same organization, other team ──
      expect((await ctx.solo.post(`/api/pages/${pages.aTeam.id}/view`)).status()).toBe(403);
      expect((await ctx.solo.get(`/api/pages/${pages.aTeam.id}/analytics`)).status()).toBe(403);
      // ── 3. Signed out ──
      expect((await ctx.anonymous.post(`/api/pages/${pages.aTeam.id}/view`)).status()).toBe(401);
      expect((await ctx.anonymous.get(`/api/pages/${pages.aTeam.id}/analytics`)).status()).toBe(
        401
      );
      expect(await statsOf(pages.aTeam), 'refused views were not recorded').toEqual(before);

      // ── 4. Unknown, trashed and malformed ids ──
      for (const path of ['/api/pages/2147483000/view', '/api/pages/2147483000/analytics']) {
        const verb = path.endsWith('view') ? 'post' : 'get';
        expect((await ctx.ownerA[verb](path)).status(), path).toBe(404);
      }
      const trashed = await ctx.ownerA.post('/api/pages', {
        data: {
          title: 'Reads check trashed',
          content: 'x',
          folder: `secpr-views-${world.stamp}`,
          tags: [],
          slug: `secpr-views-trashed-${world.stamp}`,
          author: accounts.ownerA.email,
          teamId: world.teamA.id,
        },
      });
      const trashedId = Number((await trashed.json()).id);
      expect((await ctx.ownerA.delete(`/api/pages/${trashedId}`)).status()).toBe(200);
      expect((await ctx.ownerA.post(`/api/pages/${trashedId}/view`)).status()).toBe(404);
      expect((await ctx.ownerA.get(`/api/pages/${trashedId}/analytics`)).status()).toBe(404);
      expect((await ctx.ownerA.post('/api/pages/abc/view')).status()).toBe(400);
      expect((await ctx.ownerA.get('/api/pages/abc/analytics')).status()).toBe(400);

      // ── 5. Readers keep working, with the same response shape ──
      for (const reader of [ctx.ownerA, ctx.memberA]) {
        const view = await reader.post(`/api/pages/${pages.aTeam.id}/view`);
        expect(view.status()).toBe(201);
        expect(await view.json()).toEqual({ recorded: true });
      }
      const after = await statsOf(pages.aTeam);
      expect(after.totalViews).toBe(before.totalViews + 2);
      expect(after.uniqueViewers).toBe(before.uniqueViewers + 2);
      expect(after.viewsLast7Days).toBe(before.viewsLast7Days + 2);
      expect(Object.keys(after).sort()).toEqual([
        'dailyViews',
        'totalViews',
        'uniqueViewers',
        'viewsLast7Days',
      ]);
      const memberCounts = await ctx.memberA.get(`/api/pages/${pages.aTeam.id}/analytics`);
      expect(memberCounts.status()).toBe(200);

      // ── 6. A page shared publicly follows the page read rule: anyone may read it, a signed-in reader may view it ──
      // (a signed-out write is refused by the server's global write guard, as every write is)
      expect((await ctx.anonymous.post(`/api/pages/${pages.aPublic.id}/view`)).status()).toBe(401);
      expect((await ctx.anonymous.get(`/api/pages/${pages.aPublic.id}/analytics`)).status()).toBe(
        200
      );
      const outsiderView = await ctx.outsider.post(`/api/pages/${pages.aPublic.id}/view`);
      expect(outsiderView.status()).toBe(201);
      expect((await ctx.outsider.get(`/api/pages/${pages.aPublic.id}/analytics`)).status()).toBe(
        200
      );
      expect((await statsOf(pages.aPublic)).totalViews).toBe(1);
    } finally {
      await world.close();
    }
  });
  test('favorites only hold pages the caller may list', async ({ request }) => {
    test.setTimeout(240_000);
    const world = await arrange(request, 'secpr-fav');
    const { ctx, pages, accounts } = world;
    type Favorite = { pageId: number; pageTitle: string; pageSlug: string };
    const listOf = async (c: APIRequestContext) => {
      const response = await c.get('/api/favorites');
      expect(response.status()).toBe(200);
      return (await response.json()) as Favorite[];
    };
    const slugsOf = async (c: APIRequestContext) => (await listOf(c)).map((row) => row.pageSlug);
    try {
      // ── 1. A page the caller cannot list answers like a page that does not exist ──
      const unknown = await ctx.outsider.post('/api/favorites/2147483000');
      expect(unknown.status()).toBe(404);
      const unknownBody = await unknown.json();
      for (const page of [pages.aTeam, pages.aPublic, pages.aOpen]) {
        const refused = await ctx.outsider.post(`/api/favorites/${page.id}`);
        expect(refused.status(), `outsider favorites ${page.slug}`).toBe(404);
        expect(await refused.json()).toEqual(unknownBody);
      }
      expect(await listOf(ctx.outsider)).toEqual([]);
      // the same organization, but not the team
      const soloTeamPage = await ctx.solo.post(`/api/favorites/${pages.aTeam.id}`);
      expect(soloTeamPage.status()).toBe(404);
      expect(await soloTeamPage.json()).toEqual(unknownBody);
      expect(await slugsOf(ctx.solo)).toEqual([]);
      expect((await ctx.anonymous.post(`/api/favorites/${pages.aPublic.id}`)).status()).toBe(401);
      expect((await ctx.anonymous.get('/api/favorites')).status()).toBe(401);

      // ── 2. A caller without a team may favorite the team-less pages they can list ──
      for (const page of [pages.aPublic, pages.aOpen]) {
        expect((await ctx.solo.post(`/api/favorites/${page.id}`)).status()).toBe(201);
      }
      expect((await slugsOf(ctx.solo)).sort()).toEqual(
        [pages.aPublic.slug, pages.aOpen.slug].sort()
      );
      // a private page of someone else is not theirs to favorite
      const personal = await ctx.ownerA.post('/api/pages', {
        data: {
          title: 'Reads check personal',
          content: 'x',
          folder: `secpr-fav-${world.stamp}`,
          tags: [],
          slug: `secpr-fav-personal-${world.stamp}`,
          author: accounts.ownerA.email,
        },
      });
      const personalId = Number((await personal.json()).id);
      expect((await ctx.solo.post(`/api/favorites/${personalId}`)).status()).toBe(404);

      // ── 3. A member of the team favorites its page; the row keeps its shape ──
      const add = await ctx.memberA.post(`/api/favorites/${pages.aTeam.id}`);
      expect(add.status()).toBe(201);
      expect(Object.keys(await add.json()).sort()).toEqual(['createdAt', 'id', 'pageId', 'userId']);
      expect((await ctx.memberA.post(`/api/favorites/${pages.aTeam.id}`)).status()).toBe(409);
      const [row] = await listOf(ctx.memberA);
      expect(Object.keys(row).sort()).toEqual([
        'createdAt',
        'id',
        'pageFolder',
        'pageId',
        'pageSlug',
        'pageTitle',
        'pageUpdatedAt',
      ]);
      expect(row).toMatchObject({ pageId: pages.aTeam.id, pageSlug: pages.aTeam.slug });
      const check = await ctx.memberA.get(`/api/favorites/check/${pages.aTeam.id}`);
      expect(await check.json()).toEqual({ isFavorited: true });

      // ── 4. A favorite of a trashed page is hidden, not deleted ──
      expect((await ctx.ownerA.delete(`/api/pages/${pages.aTeam.id}`)).status()).toBe(200);
      expect(await slugsOf(ctx.memberA)).toEqual([]);
      expect((await ctx.ownerA.post(`/api/trash/${pages.aTeam.id}/restore`)).status()).toBe(200);
      expect(await slugsOf(ctx.memberA)).toEqual([pages.aTeam.slug]);

      // ── 5. Leaving the team hides the favorite at once; the row can still be removed ──
      const revoke = await ctx.ownerA.delete(
        `/api/teams/${world.teamA.id}/memberships/${world.memberAUserId}`
      );
      expect(revoke.status()).toBe(204);
      expect(await slugsOf(ctx.memberA)).toEqual([]);
      expect((await ctx.memberA.post(`/api/favorites/${pages.aTeam.id}`)).status()).toBe(404);
      const stillMarked = await ctx.memberA.get(`/api/favorites/check/${pages.aTeam.id}`);
      expect(await stillMarked.json()).toEqual({ isFavorited: true });
      expect((await ctx.memberA.delete(`/api/favorites/${pages.aTeam.id}`)).status()).toBe(204);
    } finally {
      await world.close();
    }
  });
  test('the activity feed shows only rows of the callers teams and pages they may list', async ({
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await arrange(request, 'secpr-act');
    const { ctx, pages, db } = world;
    const label = (name: string) => `secpr-act-${name}-${world.stamp}`;
    const rows = [
      { name: 'team-a', type: 'page', targetId: pages.aTeam.id, teamId: world.teamA.id },
      { name: 'team-x', type: 'page', targetId: pages.xTeam.id, teamId: world.teamX.id },
      { name: 'task', type: 'task', targetId: pages.aOpen.id, teamId: null },
      { name: 'page-open', type: 'page', targetId: pages.aOpen.id, teamId: null },
      { name: 'page-team', type: 'page', targetId: pages.aTeam.id, teamId: null },
      { name: 'page-other-org', type: 'page', targetId: pages.xTeam.id, teamId: null },
    ];
    // Nothing in the API writes activity rows yet, so the test inserts synthetic ones.
    for (const row of rows) {
      await db.query(
        `INSERT INTO activity_feed (actor_name, action, target_type, target_id, target_title, team_id)
         VALUES ('Synthetic', 'page_updated', $1, $2, $3, $4)`,
        [row.type, row.targetId, label(row.name), row.teamId]
      );
    }
    const seenBy = async (c: APIRequestContext, query = '') => {
      const response = await c.get(`/api/activity?limit=200${query}`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Object.keys(body).sort()).toEqual(['activities', 'pagination']);
      return (body.activities as Array<{ targetTitle: string }>)
        .map((row) => row.targetTitle)
        .filter((title) => title?.startsWith(`secpr-act-`) && title.endsWith(`-${world.stamp}`))
        .sort();
    };
    const names = (...list: string[]) => list.map(label).sort();
    try {
      // ── 1. Another organization sees only its own rows, never the default organization's ──
      expect(await seenBy(ctx.outsider)).toEqual(names('team-x', 'page-other-org'));

      // ── 2. A caller without a team: team-less rows about pages they may list, nothing else ──
      expect(await seenBy(ctx.solo)).toEqual(names('page-open'));

      // ── 3. Members of the team see its rows too, but not another team's ──
      for (const member of [ctx.ownerA, ctx.memberA]) {
        expect(await seenBy(member)).toEqual(names('team-a', 'page-open', 'page-team'));
      }

      // ── 4. Filters and paging keep working inside that scope ──
      expect(await seenBy(ctx.ownerA, '&targetType=task')).toEqual([]);
      expect(await seenBy(ctx.ownerA, '&action=page_updated')).toHaveLength(3);
      const page = await ctx.ownerA.get('/api/activity?limit=1&offset=0');
      expect((await page.json()).pagination).toEqual({ limit: 1, offset: 0, count: 1 });

      // ── 5. A team the caller is not in is refused; without a session so is the feed ──
      expect((await ctx.solo.get(`/api/activity?teamId=${world.teamA.id}`)).status()).toBe(403);
      expect((await ctx.anonymous.get('/api/activity')).status()).toBe(401);
    } finally {
      await db.query(`DELETE FROM activity_feed WHERE target_title LIKE $1`, [
        `secpr-act-%-${world.stamp}`,
      ]);
      await world.close();
    }
  });
});
