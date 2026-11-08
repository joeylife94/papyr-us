/**
 * Page search ordered by relevance (#131), end to end against the real server, authentication,
 * team membership and PostgreSQL full-text search. Synthetic users, teams and pages only. The
 * SQL itself is covered by tests/integration-layer4/search-rank.test.ts.
 *
 * GET /api/pages?q=...&sort=rank failed on every full-text search (`column "rank" does not
 * exist`, answered as an error). Rules under test:
 * - `sort=rank` answers 200 and orders matches by relevance (title over content over tags);
 * - it finds the same pages, with the same total and pagination, as `sort=updated`;
 * - rows have no extra `rank` field;
 * - it never finds pages the caller cannot read: another team's pages, or a private page.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

type Listed = { pages: Array<{ slug: string } & Record<string, unknown>>; total: number };

test.describe('Search ordered by relevance', () => {
  test('GET /api/pages?q=&sort=rank ranks readable matches by relevance', async ({ request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const marker = `rk${stamp}`;
    const owner = await registerTestUser(request, 'rank-owner');
    const outsider = await registerTestUser(request, 'rank-outsider');
    const ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const teamIds: number[] = [];

    const search = async (ctx: APIRequestContext, query: string) => {
      const response = await ctx.get(`/api/pages?${query}`);
      expect(response.status(), query).toBe(200);
      return (await response.json()) as Listed;
    };
    const slugs = (listed: Listed) => listed.pages.map((page) => page.slug);

    try {
      const teamResponse = await ownerRequest.post('/api/teams', {
        data: { name: `rank-team-${stamp}`, displayName: `Rank Team ${stamp}` },
      });
      expect(teamResponse.status()).toBe(201);
      const team = await teamResponse.json();
      teamIds.push(team.id);

      // Created oldest first; neither update order matches relevance.
      const pages = [
        { key: 'content-once', title: 'Weekly sync', content: `we discussed ${marker}`, tags: [] },
        {
          key: 'title-twice',
          title: `${marker} ${marker} guide`,
          content: `${marker} setup`,
          tags: [],
        },
        { key: 'tag-only', title: 'Lunch menu', content: 'soup and bread', tags: [marker] },
        { key: 'title-once', title: `${marker} notes`, content: 'setup steps', tags: [] },
      ];
      for (const page of pages) {
        const response = await ownerRequest.post('/api/pages', {
          data: {
            title: page.title,
            slug: `rank-${page.key}-${stamp}`,
            content: page.content,
            folder: 'docs',
            tags: page.tags,
            author: owner.email,
            teamId: team.id,
          },
        });
        expect(response.status(), `create ${page.key}`).toBe(201);
      }
      const slug = (key: string) => `rank-${key}-${stamp}`;
      const ranked = ['title-twice', 'title-once', 'content-once', 'tag-only'].map(slug);
      const byUpdate = ['title-once', 'tag-only', 'title-twice', 'content-once'].map(slug);

      // A private personal page of the owner that matches best of all.
      const privateResponse = await ownerRequest.post('/api/pages', {
        data: {
          title: `${marker} ${marker} ${marker} private`,
          slug: `rank-private-${stamp}`,
          content: `${marker} ${marker}`,
          folder: 'docs',
          tags: [],
          author: owner.email,
        },
      });
      expect(privateResponse.status()).toBe(201);
      const privatePage = await privateResponse.json();
      const me = await (await ownerRequest.get('/api/auth/me')).json();
      const restrict = await ownerRequest.post(`/api/pages/${privatePage.id}/permissions`, {
        data: { entityType: 'user', entityId: me.id, permission: 'owner' },
      });
      expect(restrict.status()).toBe(201);

      // ── 1. Relevance order in one team, same pages and total as the default sort ──
      const inTeam = `teamId=${team.id}&q=${marker}`;
      const rankedTeam = await search(ownerRequest, `${inTeam}&sort=rank&limit=20`);
      expect(slugs(rankedTeam)).toEqual(ranked);
      expect(rankedTeam.total).toBe(4);
      for (const page of rankedTeam.pages) expect(page).not.toHaveProperty('rank');
      const updatedTeam = await search(ownerRequest, `${inTeam}&sort=updated&limit=20`);
      expect(slugs(updatedTeam)).toEqual(byUpdate);
      expect(updatedTeam.total).toBe(rankedTeam.total);
      expect(Object.keys(rankedTeam.pages[0]).sort()).toEqual(
        Object.keys(updatedTeam.pages[0]).sort()
      );

      // ── 2. Pagination walks the ranked list; the total stays the full count ──
      const firstHalf = await search(ownerRequest, `${inTeam}&sort=rank&limit=2&offset=0`);
      const secondHalf = await search(ownerRequest, `${inTeam}&sort=rank&limit=2&offset=2`);
      expect([...slugs(firstHalf), ...slugs(secondHalf)]).toEqual(ranked);
      expect(firstHalf.total).toBe(4);
      expect(secondHalf.total).toBe(4);

      // ── 3. Across the caller's scopes: team pages and the private page they own ──
      const everywhere = await search(ownerRequest, `q=${marker}&sort=rank&limit=20`);
      expect(slugs(everywhere)).toEqual(expect.arrayContaining([...ranked, privatePage.slug]));
      expect(slugs(everywhere).filter((s) => ranked.includes(s))).toEqual(ranked);

      // ── 4. Nothing the caller cannot read ──
      const outsiderSearch = await outsiderRequest.get(`/api/pages?q=${marker}&sort=rank`);
      expect(outsiderSearch.status()).toBe(200);
      const outsiderText = await outsiderSearch.text();
      expect(outsiderText).not.toContain(marker);
      expect((await outsiderRequest.get(`/api/pages?${inTeam}&sort=rank`)).status()).toBe(403);
    } finally {
      for (const teamId of teamIds) {
        await ownerRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      }
      await ownerRequest.dispose();
      await outsiderRequest.dispose();
    }
  });
});
