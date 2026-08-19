import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { createAuthenticatedApiContext } from './e2e-helpers';

async function registerThroughUi(page: Page, name: string, email: string, password: string) {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
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
    data: { name, displayName, description: `GJ-01 browser proof ${displayName}` },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('GJ-01 authentication and team entry', () => {
  test('registers, logs in, enters a real team workspace, and creates team-scoped content', async ({
    page,
  }) => {
    const stamp = Date.now();
    const email = `gj01-${stamp}@example.com`;
    const password = 'password123';
    const userName = `GJ01 User ${stamp}`;

    await registerThroughUi(page, userName, email, password);
    await loginThroughUi(page, email, password);

    const authRequest = await createAuthenticatedApiContext(email, password);
    const team = await createTeam(authRequest, `gj01-team-${stamp}`, `GJ01 Team ${stamp}`);

    await page.goto(`/teams/${team.name}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: `${team.name} 팀 문서` })).toBeVisible();

    await page.getByRole('button', { name: '새 문서 작성' }).click();
    await expect(page).toHaveURL(new RegExp(`/teams/${team.name}/create`));
    await expect(page.getByRole('heading', { name: `${team.name} 팀 새 문서 작성` })).toBeVisible();

    const title = `GJ01 Team Page ${stamp}`;
    await page.getByLabel('Title').fill(title);

    const addParagraph = page.getByRole('button', { name: /paragraph/i });
    if (await addParagraph.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addParagraph.click();
    }

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('GJ-01 team-scoped content created through the browser proof path.');

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
    expect(createdPage.title).toBe(title);
    await expect(page).toHaveURL(`/page/${createdPage.slug}`, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    const pagesResponse = await authRequest.get(`/api/pages?teamId=${team.id}`);
    expect(pagesResponse.status()).toBe(200);
    const pagesBody = await pagesResponse.json();
    const pages = Array.isArray(pagesBody) ? pagesBody : pagesBody.pages || [];
    expect(
      pages.some(
        (candidate: any) =>
          candidate.id === createdPage.id && String(candidate.teamId) === String(team.id)
      )
    ).toBe(true);

    await authRequest.delete(`/api/pages/${createdPage.id}`).catch(() => {});
    await authRequest.delete(`/api/teams/${team.id}`).catch(() => {});
    await authRequest.dispose();
  });
});
