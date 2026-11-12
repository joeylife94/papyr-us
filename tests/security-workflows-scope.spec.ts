/**
 * Workflows and saved views are scoped to a team and its organization (#124 X1b, decision D4),
 * end to end against the real server, authentication, team membership, organizations and
 * PostgreSQL. Synthetic users, teams, pages and workflows only; no workflow here calls the
 * network. Route rules: server/tests/workflow-scope-route.test.ts and
 * server/tests/saved-views-scope-route.test.ts; service rules:
 * server/tests/workflow-confinement.test.ts; SQL rule:
 * tests/integration-layer4/workflow-scope.test.ts.
 *
 * There is no API to create an organization yet (#124 X1c), so the spec creates a second one in
 * the database (DATABASE_URL) and moves one freshly registered account into it, as
 * tests/security-organizations.spec.ts does.
 *
 * Rules under test:
 * - an event on a team-less page (a personal page) fires no workflow of another organization:
 *   no run, no tag; the same workflow still fires for a page of its own team;
 * - the test endpoint acts only inside the workflow's team: trigger data naming another
 *   organization's page adds no comment, and a create_page action lands in the workflow's team,
 *   not the team the trigger data names;
 * - a workflow or saved view cannot be created without a team (400);
 * - a workflow or saved view with no team (legacy row) answers 404 to both organizations;
 * - a team's workflow or view answers 403 to a caller of another organization.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;

const pageBody = (
  stamp: number,
  slug: string,
  author: string,
  extra: Record<string, unknown> = {}
) => ({
  title: `Workflow scope ${slug}`,
  slug,
  author,
  content: `content of ${slug}`,
  folder: `wfscope-${stamp}`,
  tags: [] as string[],
  ...extra,
});

test.describe('Workflows and saved views follow team and organization boundaries', () => {
  test('events, the test endpoint and single-object routes stay inside the team', async ({
    request,
  }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const leakTag = `x1b-leak-${stamp}`;

    const owner = await registerTestUser(request, 'wfscope-owner');
    const outsider = await registerTestUser(request, 'wfscope-outsider');
    const ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const contexts = [ownerRequest, outsiderRequest];

    const createTeam = async (ctx: APIRequestContext, name: string) => {
      const response = await ctx.post('/api/teams', {
        data: { name: `${name}-${stamp}`, displayName: `${name} ${stamp}` },
      });
      expect(response.status(), `create team ${name}`).toBe(201);
      return (await response.json()) as { id: number };
    };
    const createPage = async (
      ctx: APIRequestContext,
      slug: string,
      author: string,
      teamId?: number
    ) => {
      const response = await ctx.post('/api/pages', {
        data: pageBody(stamp, slug, author, teamId ? { teamId } : {}),
      });
      expect(response.status(), `create page ${slug}`).toBe(201);
      return (await response.json()) as { id: number; slug: string };
    };
    const createWorkflow = async (
      ctx: APIRequestContext,
      teamId: number,
      name: string,
      action: { type: string; config: Record<string, unknown> },
      trigger = 'page_created'
    ) => {
      const response = await ctx.post('/api/workflows', {
        data: {
          name: `${name}-${stamp}`,
          description: 'workflow scope spec',
          teamId,
          isActive: true,
          trigger: { type: trigger, config: {} },
          actions: [action],
          conditions: [],
          createdBy: 'wfscope',
        },
      });
      expect(response.status(), `create workflow ${name}`).toBe(201);
      return (await response.json()) as { id: number; teamId: number };
    };
    const tagsOf = async (ctx: APIRequestContext, pageId: number) => {
      const response = await ctx.get(`/api/pages/${pageId}`);
      expect(response.status()).toBe(200);
      return ((await response.json()).tags ?? []) as string[];
    };
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      // ── Arrange: the owner (default organization) and the outsider (another organization) ──
      const outsiderId = Number((await (await outsiderRequest.get('/api/auth/me')).json()).id);
      const { rows: orgRows } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [`wfscope-org-${stamp}`]
      );
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        orgRows[0].id,
        outsiderId,
      ]);
      const teamA = await createTeam(ownerRequest, 'wfscope-team-a');
      const teamB = await createTeam(outsiderRequest, 'wfscope-team-b');

      // ── A team-less event does not reach another organization's workflow ──
      const tagger = await createWorkflow(outsiderRequest, teamB.id, 'tagger', {
        type: 'add_tag',
        config: { tags: [leakTag] },
      });
      const ownerPersonal = await createPage(
        ownerRequest,
        `wfscope-personal-${stamp}`,
        owner.email
      );
      const ownerTeamPage = await createPage(
        ownerRequest,
        `wfscope-team-page-${stamp}`,
        owner.email,
        teamA.id
      );
      // Control: the same workflow does fire for a page of its own team
      const outsiderPage = await createPage(
        outsiderRequest,
        `wfscope-own-${stamp}`,
        outsider.email,
        teamB.id
      );
      let controlTagged = false;
      for (let attempt = 0; attempt < 40 && !controlTagged; attempt++) {
        controlTagged = (await tagsOf(outsiderRequest, outsiderPage.id)).includes(leakTag);
        if (!controlTagged) await sleep(250);
      }
      expect(controlTagged, 'the workflow fires for a page of its own team').toBe(true);
      await sleep(2000);
      expect(await tagsOf(ownerRequest, ownerPersonal.id), 'team-less page').not.toContain(leakTag);
      expect(await tagsOf(ownerRequest, ownerTeamPage.id), "other team's page").not.toContain(
        leakTag
      );
      const runs = await outsiderRequest.get(`/api/workflows/${tagger.id}/runs`);
      expect(runs.status()).toBe(200);
      const runRows = (await runs.json()) as Array<{ triggerData: { id?: number } }>;
      expect(
        runRows.map((run) => run.triggerData?.id),
        'the workflow ran for its own team page only'
      ).toEqual([outsiderPage.id]);

      // ── The test endpoint cannot write outside the workflow's team ──
      const commenter = await createWorkflow(outsiderRequest, teamB.id, 'commenter', {
        type: 'add_comment',
        config: { message: `x1b-comment-${stamp}` },
      });
      const comment = await outsiderRequest.post(`/api/workflows/${commenter.id}/test`, {
        data: { triggerData: { id: ownerTeamPage.id, teamId: teamA.id } },
      });
      expect(comment.status()).toBe(200);
      expect((await comment.json()).run.status).toBe('failed');
      const comments = await ownerRequest.get(`/api/pages/${ownerTeamPage.id}/comments`);
      expect(comments.status()).toBe(200);
      expect(await comments.json()).toEqual([]);

      const creator = await createWorkflow(outsiderRequest, teamB.id, 'creator', {
        type: 'create_page',
        config: { title: `x1b-created-${stamp}`, content: 'created by a test run' },
      });
      const created = await outsiderRequest.post(`/api/workflows/${creator.id}/test`, {
        data: { triggerData: { teamId: teamA.id, author: outsider.email } },
      });
      expect(created.status()).toBe(200);
      const inTeamA = await ownerRequest.get(`/api/pages?teamId=${teamA.id}`);
      expect(inTeamA.status()).toBe(200);
      const teamAPages = (await inTeamA.json()) as Array<{ title: string }> | { pages: any[] };
      const titles = (Array.isArray(teamAPages) ? teamAPages : teamAPages.pages).map(
        (page: { title: string }) => page.title
      );
      expect(titles.filter((title) => title.includes('x1b-created'))).toEqual([]);

      // ── A team is required to create a workflow or a saved view ──
      const noTeam = await outsiderRequest.post('/api/workflows', {
        data: {
          name: `no-team-${stamp}`,
          trigger: { type: 'page_created', config: {} },
          actions: [{ type: 'add_tag', config: { tags: ['x'] } }],
          conditions: [],
          createdBy: 'wfscope',
        },
      });
      expect(noTeam.status()).toBe(400);
      expect(await noTeam.json()).toEqual({ error: 'teamId is required' });
      const makeTeamless = await outsiderRequest.put(`/api/workflows/${tagger.id}`, {
        data: { teamId: null },
      });
      expect(makeTeamless.status()).toBe(400);
      const viewNoTeam = await outsiderRequest.post('/api/saved-views', {
        data: { name: `no-team-${stamp}`, viewType: 'table', entityType: 'tasks', config: {} },
      });
      expect(viewNoTeam.status()).toBe(400);
      expect(await viewNoTeam.json()).toEqual({ error: 'teamId is required' });

      // ── Legacy team-less rows answer 404 to everyone ──
      const { rows: legacyWorkflow } = await db.query(
        `INSERT INTO workflows (name, team_id, is_active, trigger, actions, conditions, created_by)
         VALUES ($1, NULL, true, '{"type":"page_created","config":{}}'::jsonb,
                 '[{"type":"add_tag","config":{"tags":["x"]}}]'::jsonb, '[]'::jsonb, 'wfscope')
         RETURNING id`,
        [`legacy-${stamp}`]
      );
      const { rows: legacyView } = await db.query(
        `INSERT INTO saved_views (name, view_type, entity_type, team_id, config)
         VALUES ($1, 'table', 'tasks', NULL, '{}'::jsonb) RETURNING id`,
        [`legacy-${stamp}`]
      );
      for (const ctx of contexts) {
        for (const [method, path] of [
          ['get', `/api/workflows/${legacyWorkflow[0].id}`],
          ['get', `/api/workflows/${legacyWorkflow[0].id}/runs`],
          ['post', `/api/workflows/${legacyWorkflow[0].id}/test`],
          ['post', `/api/workflows/${legacyWorkflow[0].id}/toggle`],
          ['delete', `/api/workflows/${legacyWorkflow[0].id}`],
          ['get', `/api/saved-views/${legacyView[0].id}`],
          ['delete', `/api/saved-views/${legacyView[0].id}`],
        ] as const) {
          const response = await (ctx as any)[method](path);
          expect(response.status(), `${method} ${path}`).toBe(404);
        }
        const put = await ctx.put(`/api/saved-views/${legacyView[0].id}`, { data: { name: 'x' } });
        expect(put.status()).toBe(404);
      }
      const { rows: stillThere } = await db.query(
        `SELECT (SELECT count(*) FROM workflows WHERE id = $1) AS w,
                (SELECT count(*) FROM saved_views WHERE id = $2) AS v`,
        [legacyWorkflow[0].id, legacyView[0].id]
      );
      expect([Number(stillThere[0].w), Number(stillThere[0].v)], 'rows are kept').toEqual([1, 1]);

      // ── A team's workflow and view answer 403 to the other organization ──
      const ownerWorkflow = await createWorkflow(ownerRequest, teamA.id, 'owner-wf', {
        type: 'add_tag',
        config: { tags: ['x'] },
      });
      const { rows: teamView } = await db.query(
        `INSERT INTO saved_views (name, view_type, entity_type, team_id, config)
         VALUES ($1, 'table', 'tasks', $2, '{}'::jsonb) RETURNING id`,
        [`team-a-${stamp}`, teamA.id]
      );
      for (const [method, path] of [
        ['get', `/api/workflows/${ownerWorkflow.id}`],
        ['get', `/api/workflows/${ownerWorkflow.id}/runs`],
        ['post', `/api/workflows/${ownerWorkflow.id}/test`],
        ['post', `/api/workflows/${ownerWorkflow.id}/toggle`],
        ['delete', `/api/workflows/${ownerWorkflow.id}`],
        ['get', `/api/saved-views/${teamView[0].id}`],
        ['delete', `/api/saved-views/${teamView[0].id}`],
      ] as const) {
        const response = await (outsiderRequest as any)[method](path);
        expect(response.status(), `outsider ${method} ${path}`).toBe(403);
      }
      const ownerView = await ownerRequest.get(`/api/saved-views/${teamView[0].id}`);
      expect(ownerView.status()).toBe(200);
      const ownerRead = await ownerRequest.get(`/api/workflows/${ownerWorkflow.id}`);
      expect(ownerRead.status()).toBe(200);
    } finally {
      await db
        .query(`DELETE FROM workflows WHERE name LIKE $1 OR name LIKE $2`, [
          `%-${stamp}`,
          `legacy-${stamp}`,
        ])
        .catch(() => {});
      await db.query(`DELETE FROM saved_views WHERE name LIKE $1`, [`%-${stamp}`]).catch(() => {});
      await db
        .query(`DELETE FROM wiki_pages WHERE folder = $1`, [`wfscope-${stamp}`])
        .catch(() => {});
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
      await db.end();
    }
  });
});
