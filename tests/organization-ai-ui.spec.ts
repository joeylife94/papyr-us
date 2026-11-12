/**
 * AI entry points follow the organization's AI setting (issue #124 X1c P3), in the browser.
 * Synthetic accounts only; no AI provider is configured or called.
 *
 * There is no API yet to create an organization or switch its AI setting in this package, so the
 * spec creates a second organization in the database (DATABASE_URL), moves one freshly registered
 * account into it and flips `ai_enabled` directly.
 *
 * Rules under test, on a team page of that organization:
 * - AI off: no copilot toggle, no "AI 추천 관련 페이지" section, no request to
 *   /api/ai/related-pages, and no AI action in the inline formatting toolbar;
 * - AI on: the copilot toggle appears, the related-pages request is made, and (when the
 *   FEATURE_AI_SEARCH flag is on) the inline toolbar offers the AI actions.
 */
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;

test.describe('AI entry points follow the organization setting', () => {
  test('are absent with AI off and present with AI on', async ({ page, request }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const user = await registerTestUser(request, 'orgai-ui');
    const api = await createAuthenticatedApiContext(user.email, user.password);

    try {
      const userId = Number((await (await api.get('/api/auth/me')).json()).id);
      const { rows } = await db.query(
        `INSERT INTO organizations (slug, name, ai_enabled) VALUES ($1, $1, FALSE) RETURNING id`,
        [`orgai-ui-${stamp}`]
      );
      const organizationId = rows[0].id;
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        organizationId,
        userId,
      ]);
      const team = await api.post('/api/teams', {
        data: { name: `orgai-ui-team-${stamp}`, displayName: `Orgai UI Team ${stamp}` },
      });
      expect(team.status()).toBe(201);
      const slug = `orgai-ui-page-${stamp}`;
      const created = await api.post('/api/pages', {
        data: {
          title: `Orgai UI ${stamp}`,
          slug,
          content: `Some text to select ${stamp}`,
          folder: 'orgai',
          tags: [],
          author: user.email,
          teamId: (await team.json()).id,
        },
      });
      expect(created.status()).toBe(201);
      const aiSearchFlag = Boolean(
        (await (await api.get('/api/features')).json())?.FEATURE_AI_SEARCH
      );

      await loginPageWithCookies(page, user.email, user.password);
      const relatedRequests: string[] = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/ai/related-pages')) relatedRequests.push(req.url());
      });

      const openPage = async () => {
        // the organization request is the one that decides what is offered
        const organizationAnswer = page.waitForResponse(
          (r) => new URL(r.url()).pathname === '/api/organization' && r.ok(),
          { timeout: 20_000 }
        );
        await page.goto(`/page/${slug}`);
        await organizationAnswer;
        await expect(
          page.getByRole('heading', { name: `Orgai UI ${stamp}` }).first()
        ).toBeVisible();
      };
      const selectEditorText = async () => {
        const editor = page.locator('textarea').first();
        if ((await editor.count()) === 0) return false;
        await editor.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.up('A');
        return true;
      };

      // ── AI off ──
      await openPage();
      await page.waitForTimeout(500);
      await expect(page.getByRole('button', { name: 'AI 코파일럿' })).toHaveCount(0);
      await expect(page.getByText('AI 추천 관련 페이지')).toHaveCount(0);
      expect(relatedRequests).toEqual([]);
      const toolbarCheckedOff = await selectEditorText();
      if (toolbarCheckedOff) {
        await expect(page.getByTitle('Summarize')).toHaveCount(0);
      }
      test.info().annotations.push({
        type: 'toolbar-off-checked',
        description: String(toolbarCheckedOff),
      });

      // ── AI on ──
      await db.query('UPDATE organizations SET ai_enabled = TRUE WHERE id = $1', [organizationId]);
      await openPage();
      await expect(page.getByRole('button', { name: 'AI 코파일럿' })).toBeVisible();
      await expect.poll(() => relatedRequests.length).toBeGreaterThan(0);
      const toolbarCheckedOn = aiSearchFlag && (await selectEditorText());
      if (toolbarCheckedOn) {
        await expect(page.getByTitle('Summarize')).toBeVisible();
      }
      test.info().annotations.push({
        type: 'toolbar-on-checked',
        description: `${toolbarCheckedOn} (FEATURE_AI_SEARCH=${aiSearchFlag})`,
      });
    } finally {
      await api.dispose();
      await db.end();
    }
  });
});
