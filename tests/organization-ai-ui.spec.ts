/**
 * AI entry points follow the organization's AI setting (issue #124 X1c P3), in the browser.
 * Synthetic accounts only; no AI provider is configured or called.
 *
 * There is no API yet to create an organization or switch its AI setting in this package, so the
 * spec creates a second organization in the database (DATABASE_URL), moves one freshly registered
 * account into it and flips `ai_enabled` directly.
 *
 * Rules under test. AI on a page follows the page's organization: it is offered and used only
 * when the caller's organization has AI on and the page belongs to that same organization.
 * On a team page of the caller's organization:
 * - AI off: no copilot toggle, no "AI 추천 관련 페이지" section, no request to
 *   /api/ai/related-pages, and no AI action in the inline formatting toolbar;
 * - AI on: the copilot toggle appears, the related-pages request is made, and (when the
 *   FEATURE_AI_SEARCH flag is on) the inline toolbar offers the AI actions.
 * On a publicly shared page of another organization that has AI off, a member of an organization
 * with AI on gets no copilot button, no related-pages block and makes no request to any /api/ai/*
 * route while the page is open; on a page of their own organization they still get AI.
 *
 * The spec fails fast when GET /api/ai/status reports a provider as available.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;

/** These specs turn AI on for an organization: they must never run where a provider is set up. */
async function requireNoProvider(api: APIRequestContext) {
  const status = await (await api.get('/api/ai/status')).json();
  if (status?.available !== false) {
    throw new Error(
      'organization-ai-ui.spec.ts must run without an AI provider key: GET /api/ai/status reports a provider as available'
    );
  }
}

async function createOrganization(db: Pool, slug: string, aiEnabled: boolean): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO organizations (slug, name, ai_enabled) VALUES ($1, $1, $2) RETURNING id`,
    [slug, aiEnabled]
  );
  return rows[0].id;
}

async function moveIntoOrganization(db: Pool, api: APIRequestContext, organizationId: number) {
  const userId = Number((await (await api.get('/api/auth/me')).json()).id);
  await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
    organizationId,
    userId,
  ]);
}

async function createTeamPage(
  api: APIRequestContext,
  author: string,
  label: string,
  stamp: number
): Promise<{ slug: string; title: string }> {
  const team = await api.post('/api/teams', {
    data: { name: `${label}-team-${stamp}`, displayName: `${label} Team ${stamp}` },
  });
  expect(team.status()).toBe(201);
  const slug = `${label}-page-${stamp}`;
  const title = `${label} ${stamp}`;
  const created = await api.post('/api/pages', {
    data: {
      title,
      slug,
      content: `Some text to select ${stamp}`,
      folder: 'orgai',
      tags: [],
      author,
      teamId: (await team.json()).id,
    },
  });
  expect(created.status()).toBe(201);
  return { slug, title };
}

/** Opens the page and waits until the organization answer, which decides what is offered, is in. */
async function openPage(page: Page, slug: string, title: string) {
  const organizationAnswer = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/organization' && r.ok(),
    { timeout: 20_000 }
  );
  await page.goto(`/page/${slug}`);
  await organizationAnswer;
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible();
  await page.waitForTimeout(500);
}

/** Selects text in the editor so the inline toolbar shows; the regular actions must be there. */
async function selectEditorText(page: Page) {
  const editor = page.locator('textarea').first();
  await expect(editor, 'the page editor is present').toBeVisible();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.up('A');
  await expect(page.getByTitle('Italic'), 'the inline toolbar is shown').toBeVisible();
}

async function expectInlineAi(page: Page, shown: boolean) {
  const flags = await (await page.request.get('/api/features')).json();
  expect(
    flags?.FEATURE_AI_SEARCH,
    'FEATURE_AI_SEARCH must be on for the E2E server: the inline AI actions are checked'
  ).toBe(true);
  await selectEditorText(page);
  await expect(page.getByTitle('Summarize')).toHaveCount(shown ? 1 : 0);
}

test.describe('AI entry points follow the organization setting', () => {
  test('are absent with AI off and present with AI on', async ({ page, request }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const user = await registerTestUser(request, 'orgai-ui');
    const api = await createAuthenticatedApiContext(user.email, user.password);

    try {
      await requireNoProvider(api);
      const organizationId = await createOrganization(db, `orgai-ui-${stamp}`, false);
      await moveIntoOrganization(db, api, organizationId);
      const { slug, title } = await createTeamPage(api, user.email, 'orgai-ui', stamp);

      await loginPageWithCookies(page, user.email, user.password);
      const relatedRequests: string[] = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/ai/related-pages')) relatedRequests.push(req.url());
      });

      // ── AI off ──
      await openPage(page, slug, title);
      await expect(page.getByRole('button', { name: 'AI 코파일럿' })).toHaveCount(0);
      await expect(page.getByText('AI 추천 관련 페이지')).toHaveCount(0);
      expect(relatedRequests).toEqual([]);
      await expectInlineAi(page, false);

      // ── AI on ──
      await db.query('UPDATE organizations SET ai_enabled = TRUE WHERE id = $1', [organizationId]);
      await openPage(page, slug, title);
      await expect(page.getByRole('button', { name: 'AI 코파일럿' })).toBeVisible();
      await expect.poll(() => relatedRequests.length).toBeGreaterThan(0);
      await expectInlineAi(page, true);
    } finally {
      await api.dispose();
      await db.end();
    }
  });

  test("AI on a page follows the page's organization", async ({ page, request }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const author = await registerTestUser(request, 'orgai-author');
    const member = await registerTestUser(request, 'orgai-member');
    const authorApi = await createAuthenticatedApiContext(author.email, author.password);
    const memberApi = await createAuthenticatedApiContext(member.email, member.password);

    try {
      await requireNoProvider(memberApi);
      // the author's organization has AI off, the member's organization has AI on
      const offOrganization = await createOrganization(db, `orgai-off-${stamp}`, false);
      const onOrganization = await createOrganization(db, `orgai-on-${stamp}`, true);
      await moveIntoOrganization(db, authorApi, offOrganization);
      await moveIntoOrganization(db, memberApi, onOrganization);

      const foreign = await createTeamPage(authorApi, author.email, 'orgai-foreign', stamp);
      const foreignId = (await (await authorApi.get(`/api/pages/slug/${foreign.slug}`)).json()).id;
      const share = await authorApi.post(`/api/pages/${foreignId}/permissions`, {
        data: { entityType: 'public', permission: 'viewer' },
      });
      expect(share.status()).toBe(201);
      const own = await createTeamPage(memberApi, member.email, 'orgai-own', stamp);

      await loginPageWithCookies(page, member.email, member.password);
      const aiRequests: string[] = [];
      page.on('request', (req) => {
        if (new URL(req.url()).pathname.startsWith('/api/ai/')) aiRequests.push(req.url());
      });

      // ── A publicly shared page of the organization with AI off: no AI at all ──
      await openPage(page, foreign.slug, foreign.title);
      await expect(page.getByRole('button', { name: 'AI 코파일럿' })).toHaveCount(0);
      await expect(page.getByText('AI 추천 관련 페이지')).toHaveCount(0);
      expect(aiRequests, 'no /api/ai/* request while the page is open').toEqual([]);

      // ── A page of the member's own organization: AI is offered ──
      await openPage(page, own.slug, own.title);
      await expect(page.getByRole('button', { name: 'AI 코파일럿' })).toBeVisible();
      await expect.poll(() => aiRequests.length).toBeGreaterThan(0);
      await expectInlineAi(page, true);
    } finally {
      await authorApi.dispose();
      await memberApi.dispose();
      await db.end();
    }
  });
});
