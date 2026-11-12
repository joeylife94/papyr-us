/**
 * Per-organization AI gate (issue #124 X1c P3), end to end against the real server, session
 * handling and PostgreSQL. Synthetic accounts only. No AI provider key is configured for the E2E
 * server and none is used: the gate answers before any provider call, and an organization with
 * AI on reaches the existing "no provider" answers instead of the gate's refusal.
 *
 * There is no API yet to create an organization or switch its AI setting in this package, so
 * the spec creates a second organization in the database (DATABASE_URL), moves one freshly
 * registered account into it and flips `ai_enabled` directly.
 *
 * The spec fails fast when GET /api/ai/status reports a provider as available: its "AI on" steps
 * must never reach a real provider.
 *
 * Rules under test:
 * - an account of an organization with AI off gets 403 `ai_disabled` on every AI route, with a
 *   valid or an invalid body, and on the knowledge graph with includeAI; AI search still answers
 *   200 in full-text order, and a graph without includeAI still answers 200;
 * - once the setting is on, the same account no longer gets `ai_disabled`;
 * - an account of the default organization never gets `ai_disabled`;
 * - a signed-out caller gets 401 on the AI routes.
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

async function bodyOf(response: { json(): Promise<any> }): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

test.describe('AI follows the organization setting', () => {
  test('no AI route reaches a provider for an organization with AI off', async ({ request }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();

    const insider = await registerTestUser(request, 'orgai-default');
    const outsider = await registerTestUser(request, 'orgai-off');
    const insiderRequest = await createAuthenticatedApiContext(insider.email, insider.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const contexts: APIRequestContext[] = [insiderRequest, outsiderRequest, anonymous];

    try {
      const status = await (await anonymous.get('/api/ai/status')).json();
      if (status?.available !== false) {
        throw new Error(
          'security-organization-ai.spec.ts must run without an AI provider key: GET /api/ai/status reports a provider as available'
        );
      }
      // the signed-out context never registered or signed in
      expect((await anonymous.get('/api/auth/me')).status()).toBe(401);

      const outsiderId = Number((await (await outsiderRequest.get('/api/auth/me')).json()).id);
      const { rows } = await db.query(
        `INSERT INTO organizations (slug, name, ai_enabled) VALUES ($1, $1, FALSE) RETURNING id`,
        [`orgai-${stamp}`]
      );
      const organizationId = rows[0].id;
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        organizationId,
        outsiderId,
      ]);
      const team = await outsiderRequest.post('/api/teams', {
        data: { name: `orgai-team-${stamp}`, displayName: `Orgai Team ${stamp}` },
      });
      expect(team.status()).toBe(201);
      const teamId = (await team.json()).id;
      const page = await outsiderRequest.post('/api/pages', {
        data: {
          title: `orgai page ${stamp}`,
          slug: `orgai-page-${stamp}`,
          content: `orgai ${stamp} ${'body '.repeat(40)}`,
          folder: 'orgai',
          tags: [],
          author: outsider.email,
          teamId,
        },
      });
      expect(page.status()).toBe(201);

      // ── 1. AI off: every AI route refuses, with a valid or an invalid body ──
      for (const route of AI_ROUTES) {
        for (const body of [route.body, {}]) {
          const response = await outsiderRequest.post(route.path, { data: body });
          const json = await bodyOf(response);
          expect(response.status(), `${route.path} ${JSON.stringify(body)}`).toBe(403);
          expect(json.code, route.path).toBe('ai_disabled');
        }
      }
      const graphOff = await outsiderRequest.get(`/api/knowledge-graph?includeAI=true`);
      expect(graphOff.status()).toBe(403);
      expect((await bodyOf(graphOff)).code).toBe('ai_disabled');
      expect((await outsiderRequest.get('/api/knowledge-graph')).status()).toBe(200);

      // AI search keeps working in full-text order
      const searchOff = await outsiderRequest.post('/api/ai/search', {
        data: { query: `orgai ${stamp}` },
      });
      expect(searchOff.status()).toBe(200);
      const searchOffBody = await searchOff.json();
      expect(searchOffBody.rankingSource).toBe('fts');
      expect(searchOffBody.results.length).toBeGreaterThan(0);

      // ── 2. Signed out: 401 on every AI route ──
      for (const route of AI_ROUTES) {
        const response = await anonymous.post(route.path, { data: route.body });
        expect(response.status(), `anonymous ${route.path}`).toBe(401);
      }
      expect((await anonymous.get('/api/knowledge-graph?includeAI=true')).status()).toBe(401);

      // ── 3. The default organization is not refused by the gate ──
      for (const route of AI_ROUTES) {
        const response = await insiderRequest.post(route.path, { data: route.body });
        expect(response.status(), `default org ${route.path}`).not.toBe(401);
        expect((await bodyOf(response)).code, `default org ${route.path}`).not.toBe('ai_disabled');
      }

      // ── 4. AI turned on: the gate no longer refuses (the server has no provider key) ──
      await db.query('UPDATE organizations SET ai_enabled = TRUE WHERE id = $1', [organizationId]);
      for (const route of AI_ROUTES) {
        const response = await outsiderRequest.post(route.path, { data: route.body });
        expect(response.status(), `AI on ${route.path}`).not.toBe(401);
        expect((await bodyOf(response)).code, `AI on ${route.path}`).not.toBe('ai_disabled');
      }
      expect((await outsiderRequest.get('/api/knowledge-graph?includeAI=true')).status()).toBe(200);

      // A named page of another organization is refused with the answer for an unknown page
      const foreign = await insiderRequest.post('/api/pages', {
        data: {
          title: `orgai foreign ${stamp}`,
          slug: `orgai-foreign-${stamp}`,
          content: 'foreign body',
          folder: 'orgai',
          tags: [],
          author: insider.email,
        },
      });
      expect(foreign.status()).toBe(201);
      const foreignId = (await foreign.json()).id;
      for (const pageId of [foreignId, 2_000_000_000]) {
        const refused = await outsiderRequest.post('/api/ai/related-pages', {
          data: { content: 'hello', title: 'T', pageId },
        });
        expect(refused.status(), `related-pages pageId ${pageId}`).toBe(404);
        expect(await refused.json()).toEqual({ message: 'Page not found' });
      }

      // ── 5. Turned off again: refused again right away ──
      await db.query('UPDATE organizations SET ai_enabled = FALSE WHERE id = $1', [organizationId]);
      const again = await outsiderRequest.post('/api/ai/generate', { data: AI_ROUTES[0].body });
      expect(again.status()).toBe(403);
      expect((await bodyOf(again)).code).toBe('ai_disabled');
    } finally {
      for (const ctx of contexts) await ctx.dispose();
      await db.end();
    }
  });
});
