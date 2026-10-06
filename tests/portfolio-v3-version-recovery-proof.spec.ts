import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { loginPageWithCookies } from './e2e-helpers';

const PASSWORD = 'Password123!';
const PROOF_DIR = 'proof-artifacts';

test('Portfolio V3: capture version-recovery boundary from accepted GJ-04 path', async ({
  page,
  request,
}) => {
  mkdirSync(PROOF_DIR, { recursive: true });

  const stamp = Date.now();
  const email = `portfolio-v3-gj04-${stamp}@example.com`;
  const originalTitle = `Recovery Original ${stamp}`;
  const updatedTitle = `Recovery Updated ${stamp}`;

  const register = await request.post('/api/auth/register', {
    data: { name: 'Portfolio V3 Recovery User', email, password: PASSWORD },
  });
  expect(register.status()).toBe(201);

  const login = await request.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  await loginPageWithCookies(page, email, PASSWORD);

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

  await page.goto('/');
  await page.goto(`/page/${slug}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible();

  const restored = await request.get(`/api/pages/${pageId}`);
  expect(restored.status()).toBe(200);
  expect((await restored.json()).title).toBe(originalTitle);

  await page.screenshot({
    path: `${PROOF_DIR}/04-version-recovery-after.png`,
    fullPage: true,
  });
});
