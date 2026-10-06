import { mkdirSync } from 'node:fs';
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const PROOF_DIR = 'proof-artifacts';

async function createTeam(request: APIRequestContext, name: string, displayName: string) {
  const response = await request.post('/api/teams', {
    data: {
      name,
      displayName,
      description: 'Synthetic Portfolio V3 recovery proof workspace',
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test('Portfolio V3: capture version-recovery boundary on current team workflow', async ({
  page,
  request,
}) => {
  mkdirSync(PROOF_DIR, { recursive: true });

  const stamp = Date.now();
  const credentials = await registerTestUser(request, `portfolio-v3-recovery-${stamp}`);
  const teamName = `recovery-team-${stamp}`;
  const teamDisplayName = `Recovery Team ${stamp}`;
  const originalTitle = `Recovery Original ${stamp}`;
  const updatedTitle = `Recovery Updated ${stamp}`;

  await loginPageWithCookies(page, credentials.email, credentials.password);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const authRequest = await createAuthenticatedApiContext(
    credentials.email,
    credentials.password
  );
  const team = await createTeam(authRequest, teamName, teamDisplayName);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const teamButton = page.getByRole('button', { name: new RegExp(teamDisplayName) });
  await expect(teamButton).toBeVisible({ timeout: 15000 });
  await teamButton.click();
  await page.getByRole('link', { name: '팀 페이지' }).click();
  await expect(page).toHaveURL(`/teams/${teamName}/pages`, { timeout: 15000 });

  await page.getByRole('button', { name: '새 문서 작성' }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${teamName}/create`));
  await page.getByLabel('Title').fill(originalTitle);

  const addParagraph = page.getByRole('button', { name: '단락', exact: true });
  await expect(addParagraph).toBeVisible({ timeout: 10000 });
  await addParagraph.click();
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 10000 });
  await textarea.fill('Synthetic recovery proof content for Portfolio V3.');

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/pages') &&
      response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Create Page' }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json();

  const pageId = String(created.id);
  const slug = String(created.slug);
  expect(String(created.teamId)).toBe(String(team.id));

  await expect(page).toHaveURL(`/page/${slug}`, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible();

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
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();

  await page.getByRole('button', { name: /버전 기록/ }).click();
  await expect(page.getByText(originalTitle, { exact: true })).toBeVisible();

  await page.screenshot({
    path: `${PROOF_DIR}/03-version-recovery-before.png`,
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

  await page.goto(`/page/${slug}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible();

  const restored = await authRequest.get(`/api/pages/${pageId}`);
  expect(restored.status()).toBe(200);
  expect((await restored.json()).title).toBe(originalTitle);

  await page.screenshot({
    path: `${PROOF_DIR}/04-version-recovery-after.png`,
    fullPage: true,
  });

  await authRequest.delete(`/api/pages/${pageId}`).catch(() => {});
  await authRequest.delete(`/api/teams/${team.id}`).catch(() => {});
  await authRequest.dispose();
});
