/**
 * Team data access control for page-derived listings, end to end against the real server,
 * authentication, team membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Proves that an anonymous caller, an outsider team, a revoked member and a non-owner cannot
 * read protected pages through folder listings, tags, direct reads, list/tree/search routes,
 * and that a folder holding only another team's pages is indistinguishable from an unknown one.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';

function pageIds(body: unknown): number[] {
  const list = Array.isArray(body) ? body : ((body as any)?.pages ?? (body as any)?.results ?? []);
  return list.map((page: any) => Number(page.pageId ?? page.id));
}

function treeIds(nodes: any[]): number[] {
  return nodes.flatMap((node) => [Number(node.id), ...treeIds(node.children ?? [])]);
}

function tagNames(body: unknown): string[] {
  return Array.isArray(body) ? body.map((tag: any) => tag.name) : [];
}

test.describe('Team data access control for folder pages and tags', () => {
  test('anonymous, outsider, revoked and non-owner callers cannot read protected pages', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const folder = `sec-shared-${stamp}`;
    const teamAOnlyFolder = `sec-a-only-${stamp}`;
    const token = {
      a: `seca${stamp}`,
      b: `secb${stamp}`,
      personal: `secp${stamp}`,
    };

    const ownerA = await registerTestUser(request, 'sec-owner-a');
    const memberA = await registerTestUser(request, 'sec-member-a');
    const ownerB = await registerTestUser(request, 'sec-owner-b');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const anonymous: APIRequestContext = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const teamIds: number[] = [];

    const createPage = async (
      ctx: APIRequestContext,
      data: {
        title: string;
        slug: string;
        content: string;
        folder: string;
        tags: string[];
        author: string;
        teamId?: number;
      }
    ) => {
      const response = await ctx.post('/api/pages', { data });
      expect(response.status(), `create ${data.slug}`).toBe(201);
      return (await response.json()) as { id: number; slug: string };
    };

    try {
      // ── Arrange: two teams, one admitted member, team pages and personal pages ──
      const teamAResponse = await ownerARequest.post('/api/teams', {
        data: { name: `sec-team-a-${stamp}`, displayName: `Sec Team A ${stamp}` },
      });
      expect(teamAResponse.status()).toBe(201);
      const teamA = await teamAResponse.json();
      teamIds.push(teamA.id);

      const teamBResponse = await ownerBRequest.post('/api/teams', {
        data: { name: `sec-team-b-${stamp}`, displayName: `Sec Team B ${stamp}` },
      });
      expect(teamBResponse.status()).toBe(201);
      const teamB = await teamBResponse.json();
      teamIds.push(teamB.id);

      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);
      const memberAUserId = Number((await admit.json()).userId);

      const pageA = await createPage(ownerARequest, {
        title: `Team A plan ${token.a}`,
        slug: `sec-page-a-${stamp}`,
        content: `Team A private content ${token.a}`,
        folder,
        tags: [`tag-${token.a}`],
        author: ownerA.email,
        teamId: teamA.id,
      });
      const pageAOnly = await createPage(ownerARequest, {
        title: `Team A only folder ${token.a}`,
        slug: `sec-page-a-only-${stamp}`,
        content: `Team A folder-only content ${token.a}`,
        folder: teamAOnlyFolder,
        tags: [],
        author: ownerA.email,
        teamId: teamA.id,
      });
      const pageB = await createPage(ownerBRequest, {
        title: `Team B plan ${token.b}`,
        slug: `sec-page-b-${stamp}`,
        content: `Team B private content ${token.b}`,
        folder,
        tags: [`tag-${token.b}`],
        author: ownerB.email,
        teamId: teamB.id,
      });
      // Owner-restricted personal page: no team, explicit owner-only permission.
      const personal = await createPage(ownerBRequest, {
        title: `Personal note ${token.personal}`,
        slug: `sec-personal-${stamp}`,
        content: `Personal content ${token.personal}`,
        folder,
        tags: [`tag-${token.personal}`],
        author: ownerB.email,
      });
      const ownerBMe = await (await ownerBRequest.get('/api/auth/me')).json();
      const restrict = await ownerBRequest.post(`/api/pages/${personal.id}/permissions`, {
        data: { entityType: 'user', entityId: ownerBMe.id, permission: 'owner' },
      });
      expect(restrict.status()).toBe(201);
      // Team-less page without explicit permissions: shared by the accepted list contract.
      const shared = await createPage(ownerARequest, {
        title: `Shared note ${stamp}`,
        slug: `sec-shared-note-${stamp}`,
        content: 'Team-less page without explicit permissions',
        folder,
        tags: [],
        author: ownerA.email,
      });

      // ── 1. Anonymous callers are rejected and receive no page data ──
      for (const path of [`/api/folders/${folder}/pages`, '/api/tags']) {
        const response = await anonymous.get(path);
        expect(response.status(), `anonymous ${path}`).toBe(401);
        const text = await response.text();
        for (const secret of [token.a, token.b, token.personal]) {
          expect(text).not.toContain(secret);
        }
      }
      for (const path of [`/api/pages/${pageA.id}`, `/api/pages/slug/${pageA.slug}`]) {
        const response = await anonymous.get(path);
        expect([401, 403, 404], `anonymous ${path}`).toContain(response.status());
        expect(await response.text()).not.toContain(token.a);
      }

      // ── 2. Team A members see Team A pages and nothing of Team B or B's personal page ──
      for (const [actor, ctx] of [
        ['ownerA', ownerARequest],
        ['memberA', memberARequest],
      ] as const) {
        const listing = await ctx.get(`/api/folders/${folder}/pages`);
        expect(listing.status(), `${actor} folder`).toBe(200);
        const body = await listing.json();
        const ids = pageIds(body);
        expect(ids, `${actor} sees own team page`).toContain(pageA.id);
        expect(ids, `${actor} sees shared team-less page`).toContain(shared.id);
        expect(ids, `${actor} must not see Team B`).not.toContain(pageB.id);
        expect(ids, `${actor} must not see B's personal page`).not.toContain(personal.id);
        expect(JSON.stringify(body)).not.toContain(token.b);
        expect(JSON.stringify(body)).not.toContain(token.personal);

        const tags = tagNames(await (await ctx.get('/api/tags')).json());
        expect(tags).toContain(`tag-${token.a}`);
        expect(tags).not.toContain(`tag-${token.b}`);
        expect(tags).not.toContain(`tag-${token.personal}`);
      }
      // Normal reads keep working for authorised members.
      expect((await memberARequest.get(`/api/pages/${pageA.id}`)).status()).toBe(200);

      // ── 3. Team B cannot reach Team A pages through any listing, read or search path ──
      const bListing = await ownerBRequest.get(`/api/folders/${folder}/pages`);
      expect(bListing.status()).toBe(200);
      const bBody = await bListing.json();
      expect(pageIds(bBody)).toContain(pageB.id);
      expect(pageIds(bBody), 'owner sees own restricted personal page').toContain(personal.id);
      expect(pageIds(bBody)).not.toContain(pageA.id);
      expect(JSON.stringify(bBody)).not.toContain(token.a);

      const bTags = tagNames(await (await ownerBRequest.get('/api/tags')).json());
      expect(bTags).toContain(`tag-${token.b}`);
      expect(bTags).not.toContain(`tag-${token.a}`);

      for (const path of [`/api/pages/${pageA.id}`, `/api/pages/slug/${pageA.slug}`]) {
        const response = await ownerBRequest.get(path);
        expect([403, 404], `Team B ${path}`).toContain(response.status());
        expect(await response.text()).not.toContain(token.a);
      }
      expect((await ownerBRequest.get(`/api/pages?teamId=${teamA.id}`)).status()).toBe(403);

      const bList = await ownerBRequest.get(`/api/pages?folder=${folder}`);
      expect(bList.status()).toBe(200);
      expect(pageIds(await bList.json())).not.toContain(pageA.id);

      const bTree = await ownerBRequest.get('/api/page-tree');
      expect(bTree.status()).toBe(200);
      expect(treeIds(await bTree.json())).not.toContain(pageA.id);

      // Search must not leak Team A content whatever the search backend's status.
      const bQuery = await ownerBRequest.get(`/api/pages?q=${token.a}`);
      expect(await bQuery.text()).not.toContain(`Team A private content`);
      if (bQuery.status() === 200) expect(pageIds(await bQuery.json())).not.toContain(pageA.id);
      const bSearch = await ownerBRequest.post('/api/ai/search', { data: { query: token.a } });
      if (bSearch.status() === 200) {
        expect(pageIds(await bSearch.json())).not.toContain(pageA.id);
      }
      expect(await bSearch.text()).not.toContain('Team A private content');

      // A folder holding only Team A pages answers exactly like a folder that does not exist.
      const hiddenFolder = await ownerBRequest.get(`/api/folders/${teamAOnlyFolder}/pages`);
      const unknownFolder = await ownerBRequest.get(`/api/folders/sec-missing-${stamp}/pages`);
      expect(hiddenFolder.status()).toBe(unknownFolder.status());
      expect(await hiddenFolder.json()).toEqual(await unknownFolder.json());
      const ownFolder = await ownerARequest.get(`/api/folders/${teamAOnlyFolder}/pages`);
      expect(pageIds(await ownFolder.json())).toEqual([pageAOnly.id]);

      // ── 4. Personal pages follow ownership: non-owners cannot read the restricted page ──
      expect([403, 404]).toContain((await ownerARequest.get(`/api/pages/${personal.id}`)).status());
      expect((await ownerBRequest.get(`/api/pages/${personal.id}`)).status()).toBe(200);

      // ── 5. A revoked member loses access immediately ──
      const revoke = await ownerARequest.delete(
        `/api/teams/${teamA.id}/memberships/${memberAUserId}`
      );
      expect(revoke.status()).toBe(204);

      const revokedListing = await memberARequest.get(`/api/folders/${folder}/pages`);
      expect(revokedListing.status()).toBe(200);
      const revokedBody = await revokedListing.json();
      expect(pageIds(revokedBody)).not.toContain(pageA.id);
      expect(JSON.stringify(revokedBody)).not.toContain(token.a);
      const revokedTags = tagNames(await (await memberARequest.get('/api/tags')).json());
      expect(revokedTags).not.toContain(`tag-${token.a}`);
      expect([403, 404]).toContain((await memberARequest.get(`/api/pages/${pageA.id}`)).status());
      expect(
        pageIds(await (await memberARequest.get(`/api/folders/${teamAOnlyFolder}/pages`)).json())
      ).toEqual([]);
    } finally {
      for (const teamId of teamIds) {
        await ownerARequest.delete(`/api/teams/${teamId}`).catch(() => {});
        await ownerBRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      }
      await anonymous.dispose();
      await ownerARequest.dispose();
      await memberARequest.dispose();
      await ownerBRequest.dispose();
    }
  });
});
