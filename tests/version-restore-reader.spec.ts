import { test, expect } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

test('restoring a version refreshes the open reader without a reload', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'restore-reader');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const originalTitle = `Restore Reader Original ${stamp}`;
  const updatedTitle = `Restore Reader Updated ${stamp}`;
  const slug = `restore-reader-${stamp}`;

  const created = await api.post('/api/pages', {
    data: { title: originalTitle, slug, content: 'v1 body', folder: 'docs', author: 'u', tags: [] },
  });
  expect(created.status()).toBe(201);
  const pageId = (await created.json()).id;
  // A version snapshot is only recorded when content (or blocks) change.
  const updated = await api.put(`/api/pages/${pageId}`, {
    data: { title: updatedTitle, content: 'v2 body' },
  });
  expect(updated.status()).toBe(200);

  await loginPageWithCookies(page, user.email, user.password);
  await page.goto(`/page/${slug}`, { waitUntil: 'networkidle' });
  const title = (name: string) => page.getByRole('heading', { name, level: 1, exact: true });
  await expect(title(updatedTitle)).toBeVisible();

  await page.getByRole('button', { name: /버전 기록/ }).click();
  await expect(page.getByText(originalTitle, { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  const restored = page.waitForResponse(
    (r) => r.url().endsWith('/restore') && r.request().method() === 'POST' && r.ok()
  );
  await page.getByRole('button', { name: '복원' }).first().click();
  await restored;

  // No navigation or reload: once the history dialog is closed, the open reader must show
  // the restored state.
  const historyDialog = page.getByRole('dialog', { name: '버전 기록' });
  await historyDialog.getByRole('button', { name: 'Close' }).click();
  await expect(historyDialog).toBeHidden();
  await expect(title(originalTitle)).toBeVisible();

  await api.delete(`/api/pages/${pageId}`).catch(() => {});
  await api.dispose();
});
