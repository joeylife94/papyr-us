/**
 * AI access per organization member (issue #124 X1c P5a), end to end against the real server,
 * session handling and PostgreSQL. Synthetic accounts only. No AI provider key is configured for
 * the E2E server and none is used: the gate answers before any provider call, and a caller who
 * passes it reaches the existing "no provider" answers instead of the gate's refusals.
 *
 * The platform admin creates the organization and names its first owner through the admin API.
 * No API adds members yet, so two freshly registered accounts are moved in through the database
 * (DATABASE_URL); they keep the AI access they got at sign-up. The default organization is
 * never changed.
 *
 * The spec fails fast when GET /api/ai/status reports a provider as available.
 *
 * Rules under test:
 * - a member without AI access gets 403 `ai_not_granted` on every AI route (valid and invalid
 *   body) and on the knowledge graph with includeAI; AI search answers in full-text order;
 * - the same member cannot save with the AI action, activate or test an AI workflow, but can
 *   save one without it and turn one off;
 * - owners and admins grant and revoke by the role rules (an admin cannot grant itself);
 * - the organization switch off wins over the grant, and the grant is kept;
 * - another organization's owner, a plain member and a signed-out caller cannot use the route;
 * - a fresh account in the default organization has AI access.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const ADMIN_EMAIL = 'e2e-platform-admin@example.com';
const ADMIN_ACCOUNT_PASSWORD = 'Password123!';

const AI_ROUTES: Array<{ path: string; body: Record<string, unknown> }> = [
  { path: '/api/ai/generate', body: { prompt: 'hello', type: 'note' } },
  { path: '/api/ai/improve', body: { content: 'hello', title: 'T' } },
  { path: '/api/ai/search-suggestions', body: { query: 'roadmap' } },
  { path: '/api/ai/copilot/chat', body: { messages: [{ role: 'user', content: 'hi' }] } },
  { path: '/api/ai/extract-tasks', body: { content: 'todo: ship it' } },
  { path: '/api/ai/related-pages', body: { content: 'hello', title: 'T' } },
  { path: '/api/ai/assist', body: { command: 'improve', text: 'hello' } },
  { path: '/api/ai/generate-block', body: { prompt: 'p', blockType: 'table' } },
  { path: '/api/ai/suggestions', body: { text: 'hello', cursorPosition: 2 } },
  { path: '/api/ai/auto-format', body: { text: 'hello' } },
  { path: '/api/ai/inline', body: { action: 'summarize', text: 'hello' } },
];

const NOT_GRANTED = {
  code: 'ai_not_granted',
  message: 'AI has not been granted to your account',
};

async function bodyOf(response: { json(): Promise<any> }): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

test.describe('AI is granted per organization member', () => {
  test('grants, the gate on every AI path, workflows and refusals', async ({ request }) => {
    test.setTimeout(300_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to move accounts');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const created = { organizations: [] as number[], teams: [] as number[] };

    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const contexts: APIRequestContext[] = [anonymous];
    const signIn = async (prefix: string) => {
      const user = await registerTestUser(request, prefix);
      const ctx = await createAuthenticatedApiContext(user.email, user.password);
      contexts.push(ctx);
      const id = Number((await (await ctx.get('/api/auth/me')).json()).id);
      return { ...user, ctx, id };
    };

    try {
      const status = await (await anonymous.get('/api/ai/status')).json();
      if (status?.available !== false) {
        throw new Error(
          'security-organization-ai-grants.spec.ts must run without an AI provider key: GET /api/ai/status reports a provider as available'
        );
      }
      // the signed-out context never registered or signed in
      expect((await anonymous.get('/api/auth/me')).status()).toBe(401);

      // ── Arrange: the platform admin creates two organizations with fresh owners ──
      const registered = await request.post('/api/auth/register', {
        data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_ACCOUNT_PASSWORD },
      });
      expect([201, 409]).toContain(registered.status());
      const platformAdmin = await createAuthenticatedApiContext(
        ADMIN_EMAIL,
        ADMIN_ACCOUNT_PASSWORD
      );
      contexts.push(platformAdmin);

      const O = await signIn('p5a-owner');
      const X = await signIn('p5a-other-owner');
      const D = await signIn('p5a-admin');
      const M = await signIn('p5a-member');
      const F = await signIn('p5a-default');

      const createOrganization = async (slug: string, ownerEmail: string) => {
        const response = await platformAdmin.post('/api/admin/organizations', {
          data: { name: slug, slug, ownerEmail },
        });
        expect(response.status(), slug).toBe(201);
        const body = await response.json();
        created.organizations.push(Number(body.organization.id));
        return Number(body.organization.id);
      };
      const orgId = await createOrganization(`p5a-org-${stamp}`, O.email);
      await createOrganization(`p5a-other-${stamp}`, X.email);
      // No API adds members yet (D2): move two fresh accounts in through the database.
      await db.query(
        `UPDATE organization_members SET organization_id = $1, role = 'admin' WHERE user_id = $2`,
        [orgId, D.id]
      );
      await db.query(
        `UPDATE organization_members SET organization_id = $1, role = 'member' WHERE user_id = $2`,
        [orgId, M.id]
      );

      const ownGrant = async (who: { ctx: APIRequestContext }) =>
        (await (await who.ctx.get('/api/organization')).json()).aiAllowed;
      const setGrant = (who: { ctx: APIRequestContext }, target: number, aiAllowed: boolean) =>
        who.ctx.patch(`/api/organization/members/${target}/ai`, { data: { aiAllowed } });
      const refusedAs = async (
        who: { ctx: APIRequestContext },
        expected: { code: string; message: string }
      ) => {
        for (const route of AI_ROUTES) {
          for (const body of [route.body, {}]) {
            const response = await who.ctx.post(route.path, { data: body });
            expect(response.status(), `${route.path} ${JSON.stringify(body)}`).toBe(403);
            expect(await bodyOf(response), route.path).toEqual(expected);
          }
        }
        const graph = await who.ctx.get('/api/knowledge-graph?includeAI=true');
        expect(graph.status()).toBe(403);
        expect((await bodyOf(graph)).code).toBe(expected.code);
      };
      const notRefusedAs = async (who: { ctx: APIRequestContext }) => {
        for (const route of AI_ROUTES) {
          const response = await who.ctx.post(route.path, { data: route.body });
          const body = await bodyOf(response);
          expect([401, 403], `${route.path}`).not.toContain(response.status());
          expect(body.code, route.path).not.toBe('ai_not_granted');
          expect(body.code, route.path).not.toBe('ai_disabled');
        }
      };

      // ── 1. The first owner starts with access; the members list shows every grant ──
      const settings = await (await O.ctx.get('/api/organization')).json();
      expect(settings).toMatchObject({
        id: orgId,
        role: 'owner',
        aiEnabled: false,
        aiAllowed: true,
      });
      const listed = await (await O.ctx.get('/api/organization/members')).json();
      const grantOf = (id: number) => listed.find((row: any) => row.userId === id)?.aiAllowed;
      expect([grantOf(O.id), grantOf(D.id), grantOf(M.id)]).toEqual([true, true, true]);

      // ── 2. The owner revokes M and turns the organization switch on ──
      const revoke = await setGrant(O, M.id, false);
      expect(revoke.status()).toBe(200);
      expect(await revoke.json()).toEqual({ userId: M.id, aiAllowed: false });
      const switchOn = await O.ctx.patch('/api/organization', { data: { aiEnabled: true } });
      expect(switchOn.status()).toBe(200);
      expect(await switchOn.json()).toMatchObject({ aiEnabled: true, aiAllowed: true });

      // ── 3. M gets ai_not_granted everywhere; search stays in full-text order ──
      await refusedAs(M, NOT_GRANTED);
      const search = await M.ctx.post('/api/ai/search', { data: { query: 'roadmap' } });
      expect(search.status()).toBe(200);
      expect((await search.json()).rankingSource).toBe('fts');
      expect(await (await M.ctx.get('/api/organization')).json()).toMatchObject({
        aiEnabled: true,
        aiAllowed: false,
      });

      // ── 4. Workflows in a team M creates ──
      const team = await M.ctx.post('/api/teams', {
        data: { name: `p5a-team-${stamp}`, displayName: `P5a Team ${stamp}` },
      });
      expect(team.status()).toBe(201);
      const teamId = (await team.json()).id;
      created.teams.push(teamId);
      expect(
        (
          await M.ctx.post(`/api/teams/${teamId}/memberships`, { data: { email: O.email } })
        ).status()
      ).toBe(201);
      const workflow = (actions: unknown[]) => ({
        name: `p5a workflow ${stamp}`,
        description: '',
        teamId,
        trigger: { type: 'page_created', config: {} },
        actions,
        conditions: [],
        isActive: false,
        createdBy: 'p5a',
      });
      const AI_ACTION = { type: 'run_ai_summary', config: {} };
      const NOTIFY = { type: 'send_notification', config: { message: 'hi' } };
      const refusedWorkflow = await M.ctx.post('/api/workflows', { data: workflow([AI_ACTION]) });
      expect(refusedWorkflow.status()).toBe(403);
      expect(await refusedWorkflow.json()).toEqual(NOT_GRANTED);
      const plainWorkflow = await M.ctx.post('/api/workflows', { data: workflow([NOTIFY]) });
      expect(plainWorkflow.status()).toBe(201);
      // the owner (granted) saves an inactive AI workflow in the same team
      const aiWorkflow = await O.ctx.post('/api/workflows', { data: workflow([AI_ACTION]) });
      expect(aiWorkflow.status()).toBe(201);
      const aiWorkflowId = (await aiWorkflow.json()).id;
      const activate = await M.ctx.post(`/api/workflows/${aiWorkflowId}/toggle`, {
        data: { isActive: true },
      });
      expect(activate.status()).toBe(403);
      expect(await activate.json()).toEqual(NOT_GRANTED);
      expect(
        (
          await M.ctx.post(`/api/workflows/${aiWorkflowId}/toggle`, { data: { isActive: false } })
        ).status()
      ).toBe(200);
      const tested = await M.ctx.post(`/api/workflows/${aiWorkflowId}/test`, { data: {} });
      expect(tested.status()).toBe(403);
      expect(await tested.json()).toEqual(NOT_GRANTED);
      expect((await M.ctx.get(`/api/workflows/${aiWorkflowId}/runs`)).status()).toBe(200);
      expect(await (await M.ctx.get(`/api/workflows/${aiWorkflowId}/runs`)).json()).toEqual([]);

      // ── 5. The admin: members yes, owners no, itself only downwards ──
      expect((await setGrant(D, M.id, true)).status()).toBe(200);
      expect((await setGrant(D, M.id, false)).status()).toBe(200);
      const adminOnOwner = await setGrant(D, O.id, false);
      expect(adminOnOwner.status()).toBe(403);
      expect(await adminOnOwner.json()).toEqual({
        message: 'Only an organization owner can change AI access for an owner or admin',
      });
      expect(await ownGrant(O)).toBe(true);
      expect((await setGrant(O, D.id, false)).status()).toBe(200);
      const selfGrant = await setGrant(D, D.id, true);
      expect(selfGrant.status()).toBe(403);
      expect(await selfGrant.json()).toEqual({ message: 'You cannot grant AI access to yourself' });
      expect(await ownGrant(D)).toBe(false);
      expect((await setGrant(O, D.id, true)).status()).toBe(200);
      const selfRevoke = await setGrant(D, D.id, false);
      expect(selfRevoke.status()).toBe(200);
      expect(await selfRevoke.json()).toEqual({ userId: D.id, aiAllowed: false });

      // ── 6. The owner grants M: no gate refusal any more, an AI workflow can be saved ──
      expect((await setGrant(O, M.id, true)).status()).toBe(200);
      await notRefusedAs(M);
      expect((await M.ctx.get('/api/knowledge-graph?includeAI=true')).status()).toBe(200);
      expect((await M.ctx.post('/api/workflows', { data: workflow([AI_ACTION]) })).status()).toBe(
        201
      );

      // ── 7. The organization switch off wins over the grant, which is kept ──
      expect(
        (await O.ctx.patch('/api/organization', { data: { aiEnabled: false } })).status()
      ).toBe(200);
      await refusedAs(M, {
        code: 'ai_disabled',
        message: 'AI features are turned off for your organization',
      });
      const keptList = await (await O.ctx.get('/api/organization/members')).json();
      expect(keptList.find((row: any) => row.userId === M.id).aiAllowed).toBe(true);
      expect((await O.ctx.patch('/api/organization', { data: { aiEnabled: true } })).status()).toBe(
        200
      );
      await notRefusedAs(M);

      // ── 8. Refusals on the route itself ──
      const foreign = await setGrant(X, M.id, false);
      expect(foreign.status()).toBe(404);
      expect(await foreign.json()).toEqual({ message: 'Member not found' });
      const byMember = await setGrant(M, M.id, false);
      expect(byMember.status()).toBe(403);
      const byAnonymous = await anonymous.patch(`/api/organization/members/${M.id}/ai`, {
        data: { aiAllowed: false },
      });
      expect(byAnonymous.status()).toBe(401);
      expect(await ownGrant(M)).toBe(true);

      // ── 9. A fresh account in the default organization has AI access ──
      expect(await ownGrant(F)).toBe(true);
      for (const route of AI_ROUTES) {
        const response = await F.ctx.post(route.path, { data: route.body });
        expect((await bodyOf(response)).code, `default ${route.path}`).not.toBe('ai_not_granted');
      }
    } finally {
      for (const ctx of contexts) await ctx.dispose();
      // Everything the spec created, removed (the default organization is never touched).
      await db
        .query('DELETE FROM workflows WHERE team_id = ANY($1)', [created.teams])
        .catch(() => undefined);
      await db
        .query('DELETE FROM team_members WHERE team_id = ANY($1)', [created.teams])
        .catch(() => undefined);
      await db
        .query('DELETE FROM teams WHERE id = ANY($1)', [created.teams])
        .catch(() => undefined);
      await db
        .query('DELETE FROM organizations WHERE id = ANY($1)', [created.organizations])
        .catch(() => undefined);
      await db.end();
    }
  });
});
