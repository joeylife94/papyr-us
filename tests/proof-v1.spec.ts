import { mkdirSync } from 'node:fs';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { createAuthenticatedApiContext } from './e2e-helpers';

const PROOF_DIR = 'proof-artifacts';

async function registerThroughUi(page: Page, name: string, email: string, password: string) {
  await page.goto('/register');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth/register') && response.status() === 201
  );
  await page.getByRole('button', { name: 'Register' }).click();
  await responsePromise;
  await expect(page).toHaveURL('/login');
}

async function loginThroughUi(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth/login') && response.status() === 200
  );
  await page.getByRole('button', { name: 'Login with Email' }).click();
  await responsePromise;
  await expect(page).toHaveURL('/', { timeout: 20000 });
}

async function createTeam(request: APIRequestContext, name: string, displayName: string) {
  const response = await request.post('/api/teams', {
    data: {
      name,
      displayName,
      description: 'Synthetic v1.0 proof workspace',
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('v1.0 fresh proof package', () => {
  test('captures synthetic team workspace and created document proof', async ({ page }) => {
    mkdirSync(PROOF_DIR, { recursive: true });

    const stamp = Date.now();
    const email = `proof-v1-${stamp}@example.com`;
    const password = 'password123';
    const userName = `Proof User ${stamp}`;
    const teamName = `proof-team-${stamp}`;
    const teamDisplayName = `Proof Team ${stamp}`;
    const pageTitle = `Papyr v1 Proof ${stamp}`;

    await registerThroughUi(page, userName, email, password);
    await loginThroughUi(page, email, password);

    const authRequest = await createAuthenticatedApiContext(email, password);
    const team = await createTeam(authRequest, teamName, teamDisplayName);

    await page.reload({ waitUntil: 'domcontentloaded' });
    const teamButton = page.getByRole('button', { name: new RegExp(teamDisplayName) });
    await expect(teamButton).toBeVisible({ timeout: 15000 });
    await teamButton.click();
    await page.getByRole('link', { name: '팀 페이지' }).click();
    await expect(page).toHaveURL(`/teams/${teamName}/pages`, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: `${teamName} 팀 문서` })).toBeVisible();

    await page.screenshot({
      path: `${PROOF_DIR}/01-team-pages.png`,
      fullPage: true,
    });

    await page.getByRole('button', { name: '새 문서 작성' }).click();
    await expect(page).toHaveURL(new RegExp(`/teams/${teamName}/create`));
    await page.getByLabel('Title').fill(pageTitle);

    const addParagraph = page.getByRole('button', { name: /paragraph/i });
    if (await addParagraph.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addParagraph.click();
    }

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('Synthetic proof content for the accepted Papyr.us v1.0 browser path.');

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/pages') &&
        response.request().method() === 'POST' &&
        response.status() === 201
    );
    await page.getByRole('button', { name: 'Create Page' }).click();
    const createResponse = await createResponsePromise;
    const createdPage = await createResponse.json();

    expect(String(createdPage.teamId)).toBe(String(team.id));
    await expect(page).toHaveURL(`/page/${createdPage.slug}`, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: pageTitle })).toBeVisible();

    await page.screenshot({
      path: `${PROOF_DIR}/02-created-page.png`,
      fullPage: true,
    });

    await authRequest.delete(`/api/pages/${createdPage.id}`).catch(() => {});
    await authRequest.delete(`/api/teams/${team.id}`).catch(() => {});
    await authRequest.dispose();
  });
});
