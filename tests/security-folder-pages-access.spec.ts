/**
 * Team data access control for page-derived listings, end to end against the real server,
 * authentication, team membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Invariant under test: a folder listing, tag count, general list, page tree or child listing
 * never reveals a page the caller could not open with GET /api/pages/:id. On top of that it
 * proves anonymous rejection, team isolation, personal-page ownership, loss of listing access on
 * revocation, and that a folder holding only another team's pages is indistinguishable from an
 * unknown folder.
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
  test('listings never reveal pages the caller cannot read', async ({ request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const folder = `sec-shared-${stamp}`;
    const teamAOnlyFolder = `sec-a-only-${stamp}`;
    const marker = {
      a: `seca${stamp}`,
      am: `secam${stamp}`,
      b: `secb${stamp}`,
      personal: `secp${stamp}`,
    };

    const ownerA = await registerTestUser(request, 'sec-owner-a');
    const memberA = await registerTestUser(request, 'sec-member-a');
    const ownerB = await registerTestUser(request, 'sec-owner-b');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
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
        parentId?: number;
      }
    ) => {
      const response = await ctx.post('/api/pages', { data });
      expect(response.status(), `create ${data.slug}`).toBe(201);
      return (await response.json()) as { id: number; slug: string };
    };
    const folderIds = async (ctx: APIRequestContext, name: string) => {
      const response = await ctx.get(`/api/folders/${name}/pages`);
      expect(response.status(), `folder ${name}`).toBe(200);
      return { ids: pageIds(await response.json()), text: JSON.stringify(await response.json()) };
    };
    const tagsOf = async (ctx: APIRequestContext) => {
      const response = await ctx.get('/api/tags');
      expect(response.status()).toBe(200);
      return tagNames(await response.json());
    };

    try {
      // ── Arrange: two teams, one admitted member, team pages and an owner-only personal page ──
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
        title: `Team A plan ${marker.a}`,
        slug: `sec-page-a-${stamp}`,
        content: `Team A content ${marker.a}`,
        folder,
        tags: [`tag-${marker.a}`],
        author: ownerA.email,
        teamId: teamA.id,
      });
      const pageAm = await createPage(memberARequest, {
        title: `Team A member note ${marker.am}`,
        slug: `sec-page-am-${stamp}`,
        content: `Team A member content ${marker.am}`,
        folder,
        tags: [`tag-${marker.am}`],
        author: memberA.email,
        teamId: teamA.id,
      });
      const pageAOnly = await createPage(ownerARequest, {
        title: `Team A only folder ${marker.a}`,
        slug: `sec-page-a-only-${stamp}`,
        content: `Team A folder-only content ${marker.a}`,
        folder: teamAOnlyFolder,
        tags: [],
        author: ownerA.email,
        teamId: teamA.id,
      });
      const pageB = await createPage(ownerBRequest, {
        title: `Team B plan ${marker.b}`,
        slug: `sec-page-b-${stamp}`,
        content: `Team B content ${marker.b}`,
        folder,
        tags: [`tag-${marker.b}`],
        author: ownerB.email,
        teamId: teamB.id,
      });
      const personalB = await createPage(ownerBRequest, {
        title: `Personal note ${marker.personal}`,
        slug: `sec-personal-${stamp}`,
        content: `Personal content ${marker.personal}`,
        folder,
        tags: [`tag-${marker.personal}`],
        author: ownerB.email,
      });
      // Make ownership explicit so the test does not depend on creation defaults.
      const ownerBMe = await (await ownerBRequest.get('/api/auth/me')).json();
      const restrict = await ownerBRequest.post(`/api/pages/${personalB.id}/permissions`, {
        data: { entityType: 'user', entityId: ownerBMe.id, permission: 'owner' },
      });
      expect(restrict.status()).toBe(201);
      // Child pages under Team A's page: one by Team A, one owner-only page by an outsider.
      const childOfAByA = await createPage(ownerARequest, {
        title: `Team A child ${marker.a}`,
        slug: `sec-child-a-${stamp}`,
        content: `Team A child content ${marker.a}`,
        folder,
        tags: [],
        author: ownerA.email,
        teamId: teamA.id,
        parentId: pageA.id,
      });
      // Since the page tree rules (#103 E5) the API refuses a child under a parent the caller
      // cannot read, so this pre-E5 shape (an outsider's page under Team A's page) is written
      // directly, to keep proving that listings filter such legacy data.
      const outsiderChild = {
        title: `Outsider child ${marker.personal}`,
        slug: `sec-child-b-${stamp}`,
        content: `Outsider child content ${marker.personal}`,
        folder,
        tags: [],
        author: ownerB.email,
      };
      const refusedChild = await ownerBRequest.post('/api/pages', {
        data: { ...outsiderChild, slug: `sec-child-b-refused-${stamp}`, parentId: pageA.id },
      });
      expect(refusedChild.status()).toBe(404);
      const childOfAByB = await createPage(ownerBRequest, outsiderChild);
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        await pool.query('UPDATE wiki_pages SET parent_id = $1 WHERE id = $2', [
          pageA.id,
          childOfAByB.id,
        ]);
      } finally {
        await pool.end();
      }
      const allPages = [pageA, pageAm, pageAOnly, pageB, personalB, childOfAByA, childOfAByB];

      // ── 1. Anonymous callers are rejected and receive no page data ──
      for (const path of [`/api/folders/${folder}/pages`, '/api/tags']) {
        const response = await anonymous.get(path);
        expect(response.status(), `anonymous ${path}`).toBe(401);
        const text = await response.text();
        for (const value of Object.values(marker)) expect(text).not.toContain(value);
      }
      for (const page of [pageA, personalB]) {
        for (const path of [`/api/pages/${page.id}`, `/api/pages/slug/${page.slug}`]) {
          const response = await anonymous.get(path);
          expect([401, 403, 404], `anonymous ${path}`).toContain(response.status());
          expect(await response.text()).not.toContain(marker.a);
        }
      }

      // ── 2. Invariant: anything listed is readable by that caller ──
      for (const [actor, ctx] of [
        ['ownerA', ownerARequest],
        ['memberA', memberARequest],
        ['ownerB', ownerBRequest],
      ] as const) {
        for (const name of [folder, teamAOnlyFolder]) {
          const { ids } = await folderIds(ctx, name);
          for (const page of allPages.filter((candidate) => ids.includes(candidate.id))) {
            const direct = await ctx.get(`/api/pages/${page.id}`);
            expect(direct.status(), `${actor} lists page ${page.slug} it cannot open`).toBe(200);
          }
        }
      }

      // ── 3. Normal reads keep working for authorised callers ──
      expect((await folderIds(ownerARequest, folder)).ids).toContain(pageA.id);
      expect((await folderIds(memberARequest, folder)).ids).toContain(pageAm.id);
      const ownerBListing = await folderIds(ownerBRequest, folder);
      expect(ownerBListing.ids).toEqual(expect.arrayContaining([pageB.id, personalB.id]));
      expect(await tagsOf(ownerARequest)).toContain(`tag-${marker.a}`);
      expect(await tagsOf(memberARequest)).toContain(`tag-${marker.am}`);
      expect(await tagsOf(ownerBRequest)).toEqual(
        expect.arrayContaining([`tag-${marker.b}`, `tag-${marker.personal}`])
      );
      expect((await ownerARequest.get(`/api/pages/${pageA.id}`)).status()).toBe(200);
      expect((await memberARequest.get(`/api/pages/${pageAm.id}`)).status()).toBe(200);

      // ── 4. Team B cannot reach Team A pages through listings, reads, list/tree or search ──
      expect(ownerBListing.ids).not.toContain(pageA.id);
      expect(ownerBListing.ids).not.toContain(pageAm.id);
      expect(ownerBListing.text).not.toContain(marker.a);
      expect(ownerBListing.text).not.toContain(marker.am);
      const ownerBTags = await tagsOf(ownerBRequest);
      expect(ownerBTags).not.toContain(`tag-${marker.a}`);
      expect(ownerBTags).not.toContain(`tag-${marker.am}`);
      for (const page of [pageA, pageAm]) {
        for (const path of [`/api/pages/${page.id}`, `/api/pages/slug/${page.slug}`]) {
          const response = await ownerBRequest.get(path);
          expect([403, 404], `Team B ${path}`).toContain(response.status());
          expect(await response.text()).not.toContain(marker.a);
        }
      }
      expect((await ownerBRequest.get(`/api/pages?teamId=${teamA.id}`)).status()).toBe(403);
      const ownerBList = await ownerBRequest.get(`/api/pages?folder=${folder}`);
      expect(ownerBList.status()).toBe(200);
      expect(pageIds(await ownerBList.json())).not.toContain(pageA.id);
      const ownerBTree = await ownerBRequest.get('/api/page-tree');
      expect(ownerBTree.status()).toBe(200);
      expect(treeIds(await ownerBTree.json())).not.toContain(pageA.id);
      // Search must not leak Team A content whatever the search backend's status.
      const ownerBQuery = await ownerBRequest.get(`/api/pages?q=${marker.a}`);
      expect(await ownerBQuery.text()).not.toContain('Team A content');
      if (ownerBQuery.status() === 200) {
        expect(pageIds(await ownerBQuery.json())).not.toContain(pageA.id);
      }
      const ownerBSearch = await ownerBRequest.post('/api/ai/search', {
        data: { query: marker.a },
      });
      expect(await ownerBSearch.text()).not.toContain('Team A content');
      if (ownerBSearch.status() === 200) {
        expect(pageIds(await ownerBSearch.json())).not.toContain(pageA.id);
      }
      const ownerBChildren = await ownerBRequest.get(`/api/pages/${pageA.id}/children`);
      expect([403, 404]).toContain(ownerBChildren.status());
      expect(await ownerBChildren.text()).not.toContain(marker.a);

      // A folder holding only Team A pages answers exactly like a folder that does not exist.
      const hiddenFolder = await ownerBRequest.get(`/api/folders/${teamAOnlyFolder}/pages`);
      const unknownFolder = await ownerBRequest.get(`/api/folders/sec-missing-${stamp}/pages`);
      expect(hiddenFolder.status()).toBe(unknownFolder.status());
      expect(await hiddenFolder.json()).toEqual(await unknownFolder.json());
      expect((await folderIds(ownerARequest, teamAOnlyFolder)).ids).toEqual([pageAOnly.id]);

      // ── 5. Personal pages follow ownership ──
      for (const [actor, ctx] of [
        ['ownerA', ownerARequest],
        ['memberA', memberARequest],
      ] as const) {
        const listing = await folderIds(ctx, folder);
        expect(listing.ids, `${actor} lists B's personal page`).not.toContain(personalB.id);
        expect(listing.text).not.toContain(marker.personal);
        expect(listing.ids, `${actor} lists Team B`).not.toContain(pageB.id);
        expect(listing.text).not.toContain(marker.b);
        const tags = await tagsOf(ctx);
        expect(tags).not.toContain(`tag-${marker.personal}`);
        expect(tags).not.toContain(`tag-${marker.b}`);
        expect([403, 404]).toContain((await ctx.get(`/api/pages/${personalB.id}`)).status());
        expect([403, 404]).toContain((await ctx.get(`/api/pages/${childOfAByB.id}`)).status());

        // The general list and the page tree do not carry another user's personal pages.
        const list = await ctx.get('/api/pages?limit=100');
        expect(list.status(), `${actor} list`).toBe(200);
        const listText = await list.text();
        expect(pageIds(JSON.parse(listText))).not.toContain(personalB.id);
        expect(pageIds(JSON.parse(listText))).not.toContain(childOfAByB.id);
        expect(listText).not.toContain(marker.personal);
        const tree = await ctx.get('/api/page-tree');
        expect(tree.status(), `${actor} tree`).toBe(200);
        const treeBody = await tree.json();
        expect(treeIds(treeBody)).not.toContain(personalB.id);
        expect(treeIds(treeBody)).not.toContain(childOfAByB.id);
        expect(JSON.stringify(treeBody)).not.toContain(marker.personal);
      }

      // Reading a parent does not reveal children the caller cannot read.
      const ownerAChildren = await ownerARequest.get(`/api/pages/${pageA.id}/children`);
      expect(ownerAChildren.status()).toBe(200);
      const ownerAChildIds = pageIds(await ownerAChildren.json());
      expect(ownerAChildIds).toContain(childOfAByA.id);
      expect(ownerAChildIds).not.toContain(childOfAByB.id);

      // The owner still finds their personal pages in the list.
      const ownerBOwnList = pageIds(await (await ownerBRequest.get('/api/pages?limit=100')).json());
      expect(ownerBOwnList).toEqual(expect.arrayContaining([personalB.id, childOfAByB.id]));

      // ── 6. A revoked member loses listing access immediately ──
      const revoke = await ownerARequest.delete(
        `/api/teams/${teamA.id}/memberships/${memberAUserId}`
      );
      expect(revoke.status()).toBe(204);

      const revokedListing = await folderIds(memberARequest, folder);
      expect(revokedListing.ids).not.toContain(pageA.id);
      expect(revokedListing.ids).not.toContain(pageAm.id);
      expect(revokedListing.text).not.toContain(marker.a);
      expect(revokedListing.text).not.toContain(marker.am);
      const revokedTags = await tagsOf(memberARequest);
      expect(revokedTags).not.toContain(`tag-${marker.a}`);
      expect(revokedTags).not.toContain(`tag-${marker.am}`);
      expect((await folderIds(memberARequest, teamAOnlyFolder)).ids).toEqual([]);
      expect([403, 404]).toContain((await memberARequest.get(`/api/pages/${pageA.id}`)).status());
      const revokedList = await memberARequest.get('/api/pages?limit=100');
      expect(revokedList.status()).toBe(200);
      expect(pageIds(await revokedList.json())).not.toContain(pageA.id);
      expect((await memberARequest.get(`/api/pages?teamId=${teamA.id}`)).status()).toBe(403);
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
