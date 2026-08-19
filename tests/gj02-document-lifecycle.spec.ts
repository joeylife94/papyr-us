import { test, expect } from '@playwright/test';
import { loginPageWithCookies } from './e2e-helpers';

const PASSWORD = 'password123';

test('GJ-02: create, reopen, update, delete, restore document lifecycle', async ({ page, request }) => {
  const stamp = Date.now();
  const email = `gj02-${stamp}@example.com`;
  const originalTitle = `GJ02 Document ${stamp}`;
  const updatedTitle = `${originalTitle} Updated`;

  const register = await request.post('/api/auth/register', {
    data: { name: 'GJ02 User', email, password: PASSWORD },
  });
  expect(register.status()).toBe(201);

  const login = await request.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  await loginPageWithCookies(page, email, PASSWORD);

  // Create through the real browser editor.
  await page.goto('/create');
  await expect(page.getByRole('heading', { name: 'Create New Page' })).toBeVisible();
  await page.getByLabel('Title').fill(originalTitle);

  const createResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/pages') && response.request().method() === 'POST' && response.status() === 201
  );
  await page.getByRole('button', { name: 'Create Page' }).click();
  const createResponse = await createResponsePromise;
  const created = await createResponse.json();

  expect(created.id).toBeTruthy();
  expect(created.slug).toBeTruthy();
  const pageId = String(created.id);
  const slug = String(created.slug);

  await expect(page).toHaveURL(new RegExp(`/page/${slug}$`));
  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible();

  // Reopen from a fresh navigation and verify persisted state.
  await page.goto('/');
  await page.goto(`/page/${slug}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible();

  // Edit/update through the browser and verify the persisted update after reopening.
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

  await expect(page).toHaveURL(`/page/${slug}`);
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();

  const persistedUpdate = await request.get(`/api/pages/${pageId}`);
  expect(persistedUpdate.status()).toBe(200);
  expect((await persistedUpdate.json()).title).toBe(updatedTitle);

  // Soft-delete through the browser.
  page.once('dialog', (dialog) => dialog.accept());
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/pages/${pageId}`) &&
      response.request().method() === 'DELETE' &&
      response.ok()
  );
  await page.locator('button[title="Delete"]').click();
  await deleteResponsePromise;
  await expect(page).toHaveURL('/');

  await page.goto(`/page/${slug}`);
  await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();

  // Confirm the soft-deleted page is in trash, then restore through the authenticated API.
  const trashResponse = await request.get('/api/trash');
  expect(trashResponse.status()).toBe(200);
  const trash = await trashResponse.json();
  const deletedPages = Array.isArray(trash) ? trash : trash.pages ?? trash.items ?? [];
  expect(deletedPages.some((item: any) => String(item.id) === pageId)).toBe(true);

  const restoreResponse = await request.post(`/api/trash/${pageId}/restore`);
  expect(restoreResponse.ok()).toBe(true);

  // Reopen the restored document and verify the last persisted update survived delete/restore.
  await page.goto(`/page/${slug}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();

  const restored = await request.get(`/api/pages/${pageId}`);
  expect(restored.status()).toBe(200);
  expect((await restored.json()).title).toBe(updatedTitle);
});
