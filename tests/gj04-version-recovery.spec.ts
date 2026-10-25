import { test, expect } from '@playwright/test';
import { loginPageWithCookies } from './e2e-helpers';

const PASSWORD = 'Password123!';

test('GJ-04: edit, inspect history, restore prior version, and persist restored state', async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const email = `gj04-${stamp}@example.com`;
  const originalTitle = `GJ04 Original ${stamp}`;
  const updatedTitle = `GJ04 Updated ${stamp}`;

  const register = await request.post('/api/auth/register', {
    data: { name: 'GJ04 User', email, password: PASSWORD },
  });
  expect(register.status()).toBe(201);

  const login = await request.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  await loginPageWithCookies(page, email, PASSWORD);

  // Establish the prior state through the real browser editor.
  await page.goto('/create');
  await expect(page.getByTestId('page-title')).toBeVisible();
  // In-place editing (#103 E2): the page is created on first input; there is no save button.
  const createResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
  );
  await page.getByTestId('page-title').fill(originalTitle);
  // The editor requires body content, so the document is created with a paragraph block.
  await page.getByRole('button', { name: '단락', exact: true }).click();
  await page.locator('textarea').first().fill(`GJ-04 recovery content ${stamp}`);

  const createResponse = await createResponsePromise;
  const created = await createResponse.json();

  expect(created.id).toBeTruthy();
  expect(created.slug).toBeTruthy();
  const pageId = String(created.id);
  const slug = String(created.slug);

  // Create a distinct newer state and verify it is durable before recovery.
  // Edit in place: the title autosaves.
  await expect(page).toHaveURL(new RegExp(`/page/${slug}$`));

  const updateResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/pages/${pageId}/autosave`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200
  );
  await page.getByTestId('page-title').fill(updatedTitle);
  await updateResponsePromise;

  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();

  // The recovery surface must expose the prior version through the real history UI.
  await page.getByRole('button', { name: /버전 기록/ }).click();
  await expect(page.getByText(originalTitle, { exact: true })).toBeVisible();

  // Restore the prior version through the existing UI recovery action.
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

  // Reopen from fresh navigation and verify the restored state is durable, not just cached UI state.
  await page.goto('/');
  await page.goto(`/page/${slug}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible();

  const restored = await request.get(`/api/pages/${pageId}`);
  expect(restored.status()).toBe(200);
  expect((await restored.json()).title).toBe(originalTitle);
});
