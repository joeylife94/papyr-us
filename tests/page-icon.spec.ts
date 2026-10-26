import { test, expect, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #103 E4: a page icon is chosen from a searchable picker (or typed as an emoji), autosaves,
// and is shown in the page header, the breadcrumb, the document table and the sidebar tree.

const waitForIconSave = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/pages/${pageId}/autosave` &&
      response.request().method() === 'PUT' &&
      'icon' in (response.request().postDataJSON() ?? {}) &&
      response.ok()
  );

test('a page icon is picked, persists, and appears in header, breadcrumb, table and sidebar', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'icon');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const slug = `icon-${stamp}`;
  const title = `Icon Page ${stamp}`;
  const created = await api.post('/api/pages', {
    data: { title, slug, content: 'body', folder: 'docs', author: 'u', tags: [] },
  });
  expect(created.status()).toBe(201);
  const pageId: number = (await created.json()).id;
  const storedIcon = async () => (await (await api.get(`/api/pages/${pageId}`)).json()).icon;

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    expect(await storedIcon()).toBeNull();
    // The sidebar's folder list is already loaded (cached) before the icon changes.
    const sidebar = page.getByRole('navigation', { name: '페이지', exact: true });
    await sidebar.getByRole('button', { name: 'Documentation' }).click();
    const sidebarLink = sidebar.getByRole('link', { name: title });
    await expect(sidebarLink).toBeVisible();
    await expect(sidebarLink.locator('[data-page-icon]')).toHaveCount(0);

    // Keyboard path through the combobox: search in Korean, Enter picks the only match.
    let saved = waitForIconSave(page, pageId);
    await page.getByRole('button', { name: '아이콘 추가' }).click();
    const search = page.getByRole('combobox', { name: '페이지 아이콘 선택' });
    await expect(search).toBeFocused();
    await search.fill('로켓');
    await expect(page.getByRole('dialog').getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await saved;
    expect(await storedIcon()).toBe('🚀');

    const header = page.getByTestId('page-icon-button');
    await expect(header).toHaveAccessibleName(/페이지 아이콘 변경/);
    await expect(header.locator('[data-page-icon="🚀"]')).toBeVisible();
    const breadcrumb = page.getByRole('navigation', { name: '문서 경로' });
    await expect(breadcrumb.locator('[data-page-icon="🚀"]')).toBeVisible();
    // The open sidebar follows the save without a reload.
    await expect(sidebarLink.locator('[data-page-icon="🚀"]')).toBeVisible();

    // Persists across a reload.
    await page.reload();
    await expect(
      page.getByTestId('page-icon-button').locator('[data-page-icon="🚀"]')
    ).toBeVisible();

    // A typed emoji can be used directly.
    saved = waitForIconSave(page, pageId);
    await page.getByTestId('page-icon-button').click();
    await page.getByRole('combobox', { name: '페이지 아이콘 선택' }).fill('🦊');
    await page
      .getByRole('dialog')
      .getByRole('option', { name: /이 이모지 사용/ })
      .click();
    await saved;
    expect(await storedIcon()).toBe('🦊');

    // Document table and sidebar tree show the icon next to the title.
    await page.goto('/');
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row.locator('[data-page-icon="🦊"]')).toBeVisible();
    if ((await sidebarLink.count()) === 0) {
      await sidebar.getByRole('button', { name: 'Documentation' }).click();
    }
    await expect(
      sidebar.getByRole('link', { name: title }).locator('[data-page-icon="🦊"]')
    ).toBeVisible();

    // Removing the icon clears it.
    await page.goto(`/page/${slug}`);
    saved = waitForIconSave(page, pageId);
    await page.getByTestId('page-icon-button').click();
    await page.getByRole('dialog').getByRole('option', { name: '아이콘 제거' }).click();
    await saved;
    expect(await storedIcon()).toBeNull();
    await expect(page.getByRole('button', { name: '아이콘 추가' })).toBeVisible();
  } finally {
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
  }
});
