/**
 * GET /api/analytics/popular follows the page read boundary (#141), end to end against the real
 * server, authentication, team membership, organizations and PostgreSQL. Synthetic users, teams
 * and pages only. The route-level rules are in server/tests/popular-pages-route.test.ts and the
 * SQL rule in tests/integration-layer4/popular-pages.test.ts.
 *
 * There is no API to create an organization yet (#124 X1c), so the spec creates a second one in
 * the database (DATABASE_URL) and moves one freshly registered account into it, as
 * tests/security-organizations.spec.ts does.
 *
 * Rules under test:
 * - without a valid session the route answers 401 and names no page;
 * - a caller sees a page in the ranking only while it is live and they may list it: their teams'
 *   pages and team-less pages they can read, inside their organization; never another team's
 *   page, a private page of someone else, another organization's page or a trashed page, however
 *   many views it has;
 * - the pages a caller does see keep their order (most views first) and their counts;
 * - every ranked page opens for that caller by id;
 * - leaving a team removes its pages at once; a team the caller is not in is refused.
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

type Row = {
  pageId: number;
  pageTitle: string;
  pageSlug: string;
  viewCount: number | string;
  uniqueViewers: number | string;
};

test.describe('Popular pages follow the page read boundary', () => {
  test('GET /api/analytics/popular ranks only pages the caller can list', async ({ request }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const slug = {
      aTeam: `secp-a-team-${stamp}`,
      bTeam: `secp-b-team-${stamp}`,
      bPrivate: `secp-b-private-${stamp}`,
      bPublic: `secp-b-public-${stamp}`,
      aTrashed: `secp-a-trashed-${stamp}`,
      xTeam: `secp-x-team-${stamp}`,
    };
    const allSlugs = Object.values(slug);

    const ownerA = await registerTestUser(request, 'secp-owner-a');
    const memberA = await registerTestUser(request, 'secp-member-a');
    const ownerB = await registerTestUser(request, 'secp-owner-b');
    const solo = await registerTestUser(request, 'secp-solo');
    const outsider = await registerTestUser(request, 'secp-outsider');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const soloRequest = await createAuthenticatedApiContext(solo.email, solo.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const contexts = [
      ownerARequest,
      memberARequest,
      ownerBRequest,
      soloRequest,
      outsiderRequest,
      anonymous,
    ];

    const idOf = async (ctx: APIRequestContext) =>
      Number((await (await ctx.get('/api/auth/me')).json()).id);
    const createTeam = async (ctx: APIRequestContext, name: string) => {
      const response = await ctx.post('/api/teams', {
        data: { name: `${name}-${stamp}`, displayName: `${name} ${stamp}` },
      });
      expect(response.status(), `create team ${name}`).toBe(201);
      return (await response.json()) as { id: number };
    };
    const createPage = async (
      ctx: APIRequestContext,
      data: { slug: string; author: string; teamId?: number }
    ) => {
      const response = await ctx.post('/api/pages', {
        data: {
          title: `Popular check ${data.slug}`,
          content: `content of ${data.slug}`,
          folder: `secp-${stamp}`,
          tags: [],
          ...data,
        },
      });
      expect(response.status(), `create ${data.slug}`).toBe(201);
      return (await response.json()) as { id: number; slug: string };
    };
    /** Records one view of the page per context given; each must be able to read the page. */
    const view = async (pageId: number, viewers: APIRequestContext[]) => {
      for (const ctx of viewers) {
        const response = await ctx.post(`/api/pages/${pageId}/view`);
        expect(response.status()).toBe(201);
        expect((await response.json()).recorded).toBe(true);
      }
    };
    /** The caller's ranking, narrowed to this test's pages, in the order the server gave. */
    const rankingOf = async (ctx: APIRequestContext, query = 'limit=100&days=1') => {
      const response = await ctx.get(`/api/analytics/popular?${query}`);
      expect(response.status()).toBe(200);
      const body = (await response.json()) as Row[];
      expect(Array.isArray(body)).toBe(true);
      const counts = body.map((row) => Number(row.viewCount));
      expect(counts, 'most views first').toEqual([...counts].sort((a, b) => b - a));
      return body.filter((row) => allSlugs.includes(row.pageSlug));
    };
    const expectRanking = async (actor: string, ctx: APIRequestContext, expected: string[]) => {
      expect(
        (await rankingOf(ctx)).map((row) => row.pageSlug),
        actor
      ).toEqual(expected);
    };

    try {
      // ── Arrange: two teams and a member, another organization, pages and their views ──
      const teamA = await createTeam(ownerARequest, 'secp-team-a');
      const teamB = await createTeam(ownerBRequest, 'secp-team-b');
      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);
      const memberAUserId = Number((await admit.json()).userId);

      const { rows } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [`secp-org-${stamp}`]
      );
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        rows[0].id,
        await idOf(outsiderRequest),
      ]);
      const teamX = await createTeam(outsiderRequest, 'secp-team-x');

      const aTeam = await createPage(ownerARequest, {
        slug: slug.aTeam,
        author: ownerA.email,
        teamId: teamA.id,
      });
      const bTeam = await createPage(ownerBRequest, {
        slug: slug.bTeam,
        author: ownerB.email,
        teamId: teamB.id,
      });
      // A personal page: only its author may read it.
      const bPrivate = await createPage(ownerBRequest, {
        slug: slug.bPrivate,
        author: ownerB.email,
      });
      // A personal page shared with the public.
      const bPublic = await createPage(ownerBRequest, {
        slug: slug.bPublic,
        author: ownerB.email,
      });
      const share = await ownerBRequest.post(`/api/pages/${bPublic.id}/permissions`, {
        data: { entityType: 'public', permission: 'viewer' },
      });
      expect(share.status()).toBe(201);
      const aTrashed = await createPage(ownerARequest, {
        slug: slug.aTrashed,
        author: ownerA.email,
        teamId: teamA.id,
      });
      const xTeam = await createPage(outsiderRequest, {
        slug: slug.xTeam,
        author: outsider.email,
        teamId: teamX.id,
      });

      // Other teams' and the other organization's pages have the most views.
      // Each view comes from an account that can read the page (#124 X1b: a view of a page the
      // caller cannot read is refused and not recorded).
      await view(xTeam.id, Array(7).fill(outsiderRequest));
      await view(bTeam.id, Array(6).fill(ownerBRequest));
      await view(bPrivate.id, Array(5).fill(ownerBRequest));
      await view(aTrashed.id, [
        ownerARequest,
        ownerARequest,
        ownerARequest,
        memberARequest,
        memberARequest,
      ]);
      await view(aTeam.id, [ownerARequest, ownerARequest, memberARequest, memberARequest]);
      await view(bPublic.id, [ownerARequest, soloRequest, outsiderRequest]);

      expect(
        (await rankingOf(ownerARequest)).map((row) => row.pageSlug),
        'before the page is trashed'
      ).toEqual([slug.aTrashed, slug.aTeam, slug.bPublic]);
      expect((await ownerARequest.delete(`/api/pages/${aTrashed.id}`)).status()).toBe(200);

      // ── 1. No session, no ranking ──
      const anonymousResponse = await anonymous.get('/api/analytics/popular?limit=100&days=1');
      expect(anonymousResponse.status(), 'anonymous').toBe(401);
      const anonymousText = await anonymousResponse.text();
      for (const name of allSlugs) expect(anonymousText).not.toContain(name);
      const forged = await anonymous.get('/api/analytics/popular?limit=100&days=1', {
        headers: { Cookie: 'accessToken=not-a-valid-token' },
      });
      expect(forged.status(), 'invalid token').toBe(401);
      expect(await forged.text()).not.toContain(slug.bPublic);

      // ── 2. Each caller's ranking holds exactly the pages they may list, most views first ──
      await expectRanking('ownerA', ownerARequest, [slug.aTeam, slug.bPublic]);
      await expectRanking('memberA', memberARequest, [slug.aTeam, slug.bPublic]);
      await expectRanking('ownerB', ownerBRequest, [slug.bTeam, slug.bPrivate, slug.bPublic]);
      await expectRanking('solo', soloRequest, [slug.bPublic]);
      await expectRanking('outsider', outsiderRequest, [slug.xTeam]);

      // ── 3. Nothing about a hidden page is in the answer, whatever the window and limit ──
      const hiddenFrom: Array<[string, APIRequestContext, string[]]> = [
        ['ownerA', ownerARequest, [slug.bTeam, slug.bPrivate, slug.aTrashed, slug.xTeam]],
        ['memberA', memberARequest, [slug.bTeam, slug.bPrivate, slug.aTrashed, slug.xTeam]],
        ['ownerB', ownerBRequest, [slug.aTeam, slug.aTrashed, slug.xTeam]],
        ['solo', soloRequest, [slug.aTeam, slug.bTeam, slug.bPrivate, slug.aTrashed, slug.xTeam]],
        [
          'outsider',
          outsiderRequest,
          [slug.aTeam, slug.bTeam, slug.bPrivate, slug.bPublic, slug.aTrashed],
        ],
      ];
      for (const [actor, ctx, hidden] of hiddenFrom) {
        for (const query of ['limit=100&days=365', 'limit=1', '']) {
          const text = await (await ctx.get(`/api/analytics/popular?${query}`)).text();
          for (const name of hidden) expect(text, `${actor} ${query}`).not.toContain(name);
        }
      }

      // ── 4. Listed pages keep their counts and shape ──
      const [first, second] = await rankingOf(ownerARequest);
      expect(first).toMatchObject({
        pageId: aTeam.id,
        pageSlug: slug.aTeam,
        pageTitle: `Popular check ${slug.aTeam}`,
      });
      expect(Number(first.viewCount)).toBe(4);
      expect(Number(first.uniqueViewers)).toBe(2);
      expect(Number(second.viewCount)).toBe(3);
      const top = await ownerBRequest.get('/api/analytics/popular?limit=1&days=1');
      expect(((await top.json()) as Row[]).length).toBe(1);

      // ── 5. Invariant: every ranked page opens for that caller by id ──
      for (const [actor, ctx] of [
        ['ownerA', ownerARequest],
        ['memberA', memberARequest],
        ['ownerB', ownerBRequest],
        ['solo', soloRequest],
        ['outsider', outsiderRequest],
      ] as const) {
        for (const row of await rankingOf(ctx)) {
          const page = await ctx.get(`/api/pages/${row.pageId}`);
          expect(page.status(), `${actor} opens ${row.pageSlug}`).toBe(200);
        }
      }

      // ── 6. Restoring the trashed page brings it back, for its team only ──
      const restore = await ownerARequest.post(`/api/trash/${aTrashed.id}/restore`);
      expect(restore.status()).toBe(200);
      await expectRanking('ownerA after restore', ownerARequest, [
        slug.aTrashed,
        slug.aTeam,
        slug.bPublic,
      ]);
      await expectRanking('ownerB after restore', ownerBRequest, [
        slug.bTeam,
        slug.bPrivate,
        slug.bPublic,
      ]);
      expect((await ownerARequest.delete(`/api/pages/${aTrashed.id}`)).status()).toBe(200);

      // ── 7. A team the caller is not in is refused; their own team is accepted ──
      const otherTeam = await ownerARequest.get(`/api/analytics/popular?teamId=${teamB.id}`);
      expect(otherTeam.status()).toBe(403);
      expect(await otherTeam.text()).not.toContain(slug.bTeam);
      const ownTeam = await ownerARequest.get(`/api/analytics/popular?teamId=${teamA.id}`);
      expect(ownTeam.status()).toBe(200);

      // ── 8. A member who leaves the team loses its pages at once ──
      const revoke = await ownerARequest.delete(
        `/api/teams/${teamA.id}/memberships/${memberAUserId}`
      );
      expect(revoke.status()).toBe(204);
      await expectRanking('revoked memberA', memberARequest, [slug.bPublic]);
    } finally {
      for (const ctx of contexts) await ctx.dispose();
      await db.end();
    }
  });
});
