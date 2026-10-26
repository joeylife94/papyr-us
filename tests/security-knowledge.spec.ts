/**
 * Knowledge views (#111 §1, §2, §5) end to end against the real server, authentication, team
 * membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Invariant under test: the global knowledge graph, a page's local graph and its unlinked
 * mentions never reveal a page the caller could not open: another team's page, a team-less
 * page granted only to someone else, or a trashed page. The graph response carries no page
 * content. The local graph does not traverse through a hidden page.
 *
 * `page_links` rows are inserted directly with SQL: the save-pipeline sync that maintains them
 * from `[[page:<id>]]` tokens is a separate work item (#103 E6).
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

type Created = { id: number; slug: string; title: string };

test.describe('Knowledge views only show readable pages', () => {
  test('global graph, local graph and unlinked mentions exclude unreadable pages', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const hidden = `kghidden${stamp}`;
    const body = `kgbody${stamp}`;
    // `_` and `%` are LIKE wildcards; the title must still match literally.
    const centreTitle = `Orbit_1% ${stamp}`;

    const alice = await registerTestUser(request, 'kg-alice');
    const bob = await registerTestUser(request, 'kg-bob');
    const aliceApi = await createAuthenticatedApiContext(alice.email, alice.password);
    const bobApi = await createAuthenticatedApiContext(bob.email, bob.password);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const teamIds: number[] = [];

    const createPage = async (
      ctx: APIRequestContext,
      data: { title: string; content: string; author: string; teamId?: number; tags?: string[] }
    ): Promise<Created> => {
      const slug = `kg-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await ctx.post('/api/pages', {
        data: { folder: 'docs', tags: [], ...data, slug },
      });
      expect(response.status(), `create ${data.title}`).toBe(201);
      const page = await response.json();
      return { id: page.id, slug: page.slug, title: page.title };
    };
    const link = (source: Created, target: Created) =>
      pool.query('INSERT INTO page_links (source_page_id, target_page_id) VALUES ($1, $2)', [
        source.id,
        target.id,
      ]);

    try {
      // ── Arrange ──
      const teamAResponse = await aliceApi.post('/api/teams', {
        data: { name: `kg-team-a-${stamp}`, displayName: `KG Team A ${stamp}` },
      });
      expect(teamAResponse.status()).toBe(201);
      const teamA = await teamAResponse.json();
      teamIds.push(teamA.id);
      const teamBResponse = await bobApi.post('/api/teams', {
        data: { name: `kg-team-b-${stamp}`, displayName: `KG Team B ${stamp}` },
      });
      expect(teamBResponse.status()).toBe(201);
      const teamB = await teamBResponse.json();
      teamIds.push(teamB.id);

      const a = { author: alice.email, teamId: teamA.id };
      const centre = await createPage(aliceApi, {
        ...a,
        title: centreTitle,
        content: `${body} centre`,
        tags: [`kg-${stamp}`],
      });
      const outgoing = await createPage(aliceApi, {
        ...a,
        title: `Outgoing ${stamp}`,
        content: `${body} outgoing`,
        tags: [`kg-${stamp}`],
      });
      // Links to the centre and mentions it: a backlink, so not an unlinked mention.
      const backlink = await createPage(aliceApi, {
        ...a,
        title: `Backlink ${stamp}`,
        content: `${body} mentions ${centreTitle}`,
      });
      const secondHop = await createPage(aliceApi, {
        ...a,
        title: `Second hop ${stamp}`,
        content: `${body} two`,
      });
      // Readable, but connected to the centre only through a hidden page.
      const behindHidden = await createPage(aliceApi, {
        ...a,
        title: `Behind hidden ${stamp}`,
        content: `${body} bridge`,
      });
      const mention = await createPage(aliceApi, {
        ...a,
        title: `Mention ${stamp}`,
        content: `Weekly notes: we discussed ${centreTitle.toLowerCase()} at length. ${body}`,
      });
      const wildcardDecoy = await createPage(aliceApi, {
        ...a,
        title: `Decoy ${stamp}`,
        content: `OrbitX1abc ${stamp} would match if wildcards were live`,
      });
      const trashed = await createPage(aliceApi, {
        ...a,
        title: `Trashed ${hidden}`,
        content: `${hidden} mentions ${centreTitle}`,
      });
      const otherTeam = await createPage(bobApi, {
        author: bob.email,
        teamId: teamB.id,
        title: `Other team ${hidden}`,
        content: `${hidden} mentions ${centreTitle} [[${centreTitle}]]`,
      });
      const bobPersonal = await createPage(bobApi, {
        author: bob.email,
        title: `Bob personal ${hidden}`,
        content: `${hidden} mentions ${centreTitle}`,
      });
      const bobMe = await (await bobApi.get('/api/auth/me')).json();
      const grant = await bobApi.post(`/api/pages/${bobPersonal.id}/permissions`, {
        data: { entityType: 'user', entityId: bobMe.id, permission: 'owner' },
      });
      expect(grant.status()).toBe(201);

      await link(centre, outgoing);
      await link(backlink, centre);
      await link(outgoing, secondHop);
      await link(centre, otherTeam);
      await link(otherTeam, centre);
      await link(bobPersonal, centre);
      await link(centre, bobPersonal);
      await link(bobPersonal, behindHidden);
      await link(centre, trashed);
      await link(trashed, centre);
      expect((await aliceApi.delete(`/api/pages/${trashed.id}`)).ok()).toBe(true);

      const readableIds = [centre, outgoing, backlink, secondHop, behindHidden, mention].map(
        (p) => p.id
      );
      const hiddenIds = [trashed, otherTeam, bobPersonal].map((p) => p.id);

      // The hidden pages really are unreadable for Alice.
      for (const id of hiddenIds) {
        expect([403, 404], `alice reads hidden page ${id}`).toContain(
          (await aliceApi.get(`/api/pages/${id}`)).status()
        );
      }

      // ── 1. Global graph: readable pages only, no content, edges inside the node set ──
      for (const query of ['', `?teamId=${teamA.id}`, `?teamId=${teamA.name}`]) {
        const response = await aliceApi.get(`/api/knowledge-graph${query}`);
        expect(response.status(), `graph${query}`).toBe(200);
        const text = await response.text();
        expect(text).not.toContain(hidden);
        expect(text).not.toContain(body);
        const graph = JSON.parse(text);
        const pageIds = graph.nodes
          .filter((node: any) => node.pageId)
          .map((node: any) => node.pageId);
        expect(pageIds).toEqual(expect.arrayContaining(readableIds));
        for (const id of hiddenIds) expect(pageIds).not.toContain(id);
        for (const node of graph.nodes) {
          expect(node).not.toHaveProperty('content');
        }
        const nodeIds = new Set(graph.nodes.map((node: any) => node.id));
        for (const edge of graph.links) {
          expect(nodeIds.has(edge.source) && nodeIds.has(edge.target)).toBe(true);
        }
        const kinds = (source: Created, target: Created) =>
          graph.links
            .filter(
              (edge: any) =>
                edge.source === `page-${source.id}` && edge.target === `page-${target.id}`
            )
            .map((edge: any) => edge.type);
        expect(kinds(centre, outgoing)).toEqual(['link']);
        expect(kinds(backlink, centre)).toEqual(['link']);
        expect(
          graph.nodes.find((node: any) => node.pageId === centre.id).connections
        ).toBeGreaterThan(0);
      }
      expect((await aliceApi.get(`/api/knowledge-graph?teamId=${teamB.id}`)).status()).toBe(403);

      // Bob's graph does not show Team A either.
      const bobGraph = await bobApi.get('/api/knowledge-graph');
      expect(bobGraph.status()).toBe(200);
      const bobPageIds = (await bobGraph.json()).nodes.map((node: any) => node.pageId);
      expect(bobPageIds).toContain(otherTeam.id);
      expect(bobPageIds).not.toContain(centre.id);

      // ── 2. Local graph ──
      const localGraph = async (ctx: APIRequestContext, page: Created, depth?: number) => {
        const response = await ctx.get(
          `/api/pages/${page.id}/graph${depth ? `?depth=${depth}` : ''}`
        );
        return { status: response.status(), text: await response.text() };
      };
      const depth1 = await localGraph(aliceApi, centre);
      expect(depth1.status).toBe(200);
      expect(depth1.text).not.toContain(hidden);
      expect(depth1.text).not.toContain(body);
      const local1 = JSON.parse(depth1.text);
      expect(local1.nodes[0]).toEqual({
        id: centre.id,
        title: centreTitle,
        slug: centre.slug,
        icon: null,
      });
      expect(local1.nodes.map((node: any) => node.id).sort()).toEqual(
        [centre.id, outgoing.id, backlink.id].sort()
      );
      expect(local1.edges).toEqual(
        expect.arrayContaining([
          { source: centre.id, target: outgoing.id },
          { source: backlink.id, target: centre.id },
        ])
      );
      expect(local1.edges).toHaveLength(2);

      const local2 = JSON.parse((await localGraph(aliceApi, centre, 2)).text);
      const depth2Ids = local2.nodes.map((node: any) => node.id);
      expect(depth2Ids).toContain(secondHop.id);
      // Not reached through Bob's hidden personal page.
      expect(depth2Ids).not.toContain(behindHidden.id);
      for (const id of hiddenIds) expect(depth2Ids).not.toContain(id);

      expect((await localGraph(aliceApi, centre, 3)).status).toBe(400);
      expect((await localGraph(aliceApi, trashed)).status).toBe(404);
      const bobLocal = await localGraph(bobApi, centre);
      expect(bobLocal.status).toBe(403);
      expect(bobLocal.text).not.toContain(String(stamp));

      // ── 3. Unlinked mentions ──
      const mentionsResponse = await aliceApi.get(`/api/pages/${centre.id}/unlinked-mentions`);
      expect(mentionsResponse.status()).toBe(200);
      const mentionsText = await mentionsResponse.text();
      expect(mentionsText).not.toContain(hidden);
      const { mentions } = JSON.parse(mentionsText);
      expect(mentions.map((m: any) => m.id)).toEqual([mention.id]);
      expect(mentions[0].snippet.toLowerCase()).toContain(centreTitle.toLowerCase());
      expect(mentions[0].snippet.length).toBeLessThanOrEqual(130);
      expect(mentions[0]).not.toHaveProperty('content');
      expect(mentions.map((m: any) => m.id)).not.toContain(wildcardDecoy.id);
      expect(mentions.map((m: any) => m.id)).not.toContain(backlink.id);

      const bobMentions = await bobApi.get(`/api/pages/${centre.id}/unlinked-mentions`);
      expect(bobMentions.status()).toBe(403);
      expect(await bobMentions.text()).not.toContain(String(stamp));
    } finally {
      for (const teamId of teamIds) {
        await aliceApi.delete(`/api/teams/${teamId}`).catch(() => {});
        await bobApi.delete(`/api/teams/${teamId}`).catch(() => {});
      }
      await pool.end();
      await aliceApi.dispose();
      await bobApi.dispose();
    }
  });
});
