import { mkdirSync } from 'node:fs';
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const PROOF_DIR = 'portfolio-proof-v3';

async function createTeam(request: APIRequestContext, name: string, displayName: string) {
  const response = await request.post('/api/teams', {
    data: {
      name,
      displayName,
      description: 'Synthetic Portfolio V3 proof workspace',
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('Portfolio V3 buyer-facing proof', () => {
  test('P1: captures a synthetic team workspace with an accepted team-scoped document', async ({
    page,
    request,
  }) => {
    mkdirSync(PROOF_DIR, { recursive: true });

    const stamp = Date.now();
    const credentials = await registerTestUser(request, `portfolio-v3-${stamp}`);
    await loginPageWithCookies(page, credentials.email, credentials.password);

    const authRequest = await createAuthenticatedApiContext(
      credentials.email,
      credentials.password
    );

    const teamName = `portfolio-team-${stamp}`;
    const teamDisplayName = 'Portfolio Proof Team';
    const team = await createTeam(authRequest, teamName, teamDisplayName);

    const pageTitle = 'Operations Handbook';
    const createPage = await authRequest.post('/api/pages', {
      data: {
        title: pageTitle,
        content:
          'Synthetic portfolio proof content demonstrating an authenticated team-scoped document.',
        slug: `operations-handbook-${stamp}`,
        folder: 'docs',
        author: credentials.name,
        tags: ['portfolio-proof'],
        teamId: team.id,
      },
    });
    expect(createPage.status()).toBe(201);
    const created = await createPage.json();

    await page.goto('/');
    await expect(page).toHaveURL('/', { timeout: 20000 });

    const teamButton = page.getByRole('button', { name: new RegExp(teamDisplayName) });
    await expect(teamButton).toBeVisible({ timeout: 15000 });
    await teamButton.click();
    await page.getByRole('link', { name: '팀 페이지' }).click();
    await expect(page).toHaveURL(`/teams/${teamName}/pages`, { timeout: 15000 });

    await expect(
      page.getByRole('heading', { name: `${teamName} 팀 문서`, level: 1, exact: true })
    ).toBeVisible();
    await expect(page.getByText(pageTitle, { exact: true })).toBeVisible();

    await page.screenshot({
      path: `${PROOF_DIR}/01-team-workspace-with-document.png`,
      fullPage: true,
    });

    await authRequest.delete(`/api/pages/${created.id}`).catch(() => {});
    await authRequest.delete(`/api/teams/${team.id}`).catch(() => {});
    await authRequest.dispose();
  });

  test('P2: captures browser version recovery before and after restore', async ({
    page,
    request,
  }) => {
    mkdirSync(PROOF_DIR, { recursive: true });

    const stamp = Date.now();
    const credentials = await registerTestUser(request, `portfolio-recovery-${stamp}`);
    await loginPageWithCookies(page, credentials.email, credentials.password);

    const originalTitle = 'Incident Runbook — Approved';
    const updatedTitle = 'Incident Runbook — Draft Change';

    await page.goto('/create');
    await expect(page.getByRole('heading', { name: 'Create New Page' })).toBeVisible();
    await page.getByLabel('Title').fill(originalTitle);

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/pages') &&
        response.request().method() === 'POST' &&
        response.status() === 201
    );
    await page.getByRole('button', { name: 'Create Page' }).click();
    const createResponse = await createResponsePromise;
    const created = await createResponse.json();

    const pageId = String(created.id);
    const slug = String(created.slug);

    await page.locator('button[title="Edit Page"]').click();
    await expect(page.getByRole('heading', { name: 'Edit Page' })).toBeVisible();
    await page.getByLabel('Title').fill(updatedTitle);

    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/pages/${pageId}`) &&
        response.request().method() === 'PUT' &&
        response.status() === 200
    );
    await page.getByRole('button', { name: 'Update Page' }).click();
    await updateResponsePromise;

    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();

    await page.getByRole('button', { name: /버전 기록/ }).click();
    await expect(page.getByText(originalTitle, { exact: true })).toBeVisible();

    await page.screenshot({
      path: `${PROOF_DIR}/02-version-history-before-restore.png`,
      fullPage: true,
    });

    page.once('dialog', (dialog) => dialog.accept());
    const restoreResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/pages/${pageId}/versions/`) &&
        response.url().endsWith('/restore') &&
        response.request().method() === 'POST' &&
        response.ok()
    );
    await page.getByRole('button', { name: '복원' }).first().click();
    await restoreResponsePromise;

    await page.goto('/');
    await page.goto(`/page/${slug}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible();

    const restored = await request.get(`/api/pages/${pageId}`);
    expect(restored.status()).toBe(200);
    expect((await restored.json()).title).toBe(originalTitle);

    await page.screenshot({
      path: `${PROOF_DIR}/03-version-restored.png`,
      fullPage: true,
    });
  });
});
