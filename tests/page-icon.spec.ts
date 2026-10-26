import { test, expect, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #103 E4: an editor sets a page icon from the page header. The icon shows in the header,
// the breadcrumb, the browser tab and the workspace document table, survives a reload, and
// saving it records no version. The picker is offered only once the page exists.

const waitForIconSave = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/pages/${pageId}/autosave` &&
      response.request().method() === 'PUT' &&
      'icon' in (response.request().postDataJSON() ?? {}) &&
      response.ok()
  );

test('an editor sets, changes and removes a page icon, and it shows wherever the page does', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'icon');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const title = `Icon ${Date.now()}`;
  let pageId = 0;

  try {
    await loginPageWithCookies(page, user.email, user.password);

    // A new page is not stored until the first input, so it offers no icon yet (E2 lazy creation).
    await page.goto('/create');
    await expect(page.getByTestId('page-title')).toBeVisible();
    await expect(page.getByRole('button', { name: '아이콘 추가' })).toHaveCount(0);
    const createdResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
    );
    await page.getByTestId('page-title').fill(title);
    const created = await (await createdResponse).json();
    pageId = created.id;
    await expect(page).toHaveURL(`/page/${created.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');

    const versionsBefore = (await (await api.get(`/api/pages/${pageId}/versions`)).json()).length;

    // The quiet "아이콘 추가" button appears above the title on hover.
    const addIcon = page.getByRole('button', { name: '아이콘 추가' });
    await page.getByTestId('page-title').hover();
    await expect(addIcon).toHaveCSS('opacity', '1');
    await addIcon.click();

    const picker = page.getByRole('dialog', { name: '아이콘 선택' });
    const search = picker.getByRole('combobox', { name: '이모지 검색' });
    await expect(search).toBeFocused();
    const activeCell = picker.getByRole('gridcell', { selected: true });

    // Keyboard grid: arrows, Home/End within the row, up from the first row back to the text.
    await search.press('ArrowDown');
    await expect(activeCell).toHaveAttribute('aria-label', '문서');
    await search.press('ArrowRight');
    await expect(activeCell).toHaveAttribute('aria-label', '메모');
    await search.press('ArrowDown');
    await expect(activeCell).toHaveAttribute('aria-label', '공책');
    await search.press('End');
    await expect(activeCell).toHaveAttribute('aria-label', '모래시계');
    await search.press('Home');
    await expect(activeCell).toHaveAttribute('aria-label', '펼친 책');
    await search.press('ArrowUp');
    await expect(activeCell).toHaveAttribute('aria-label', '문서');
    await search.press('ArrowUp');
    await expect(activeCell).toHaveCount(0);

    // Search by English keyword; Enter picks the first match.
    await search.fill('rocket');
    await expect(picker.getByRole('gridcell')).toHaveCount(1);
    let saved = waitForIconSave(page, pageId);
    await search.press('Enter');
    await saved;
    await expect(picker).toBeHidden();

    const iconButton = page.getByRole('button', { name: '아이콘 변경' });
    await expect(iconButton).toHaveText('🚀');
    await expect(iconButton).toBeFocused();
    const breadcrumb = page.getByRole('navigation', { name: '문서 경로' });
    await expect(breadcrumb).toContainText(`🚀${title}`);
    await expect(page).toHaveTitle(`🚀 ${title} · Papyr.us`);
    // The title stays the heading's whole accessible name.
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();

    // Esc closes the picker without a change and returns focus to the icon.
    await iconButton.press('Enter');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(iconButton).toBeFocused();

    // Change it by mouse, searching in Korean.
    await iconButton.click();
    await search.fill('책');
    saved = waitForIconSave(page, pageId);
    await picker.getByRole('gridcell', { name: '책', exact: true }).click();
    await saved;
    await expect(iconButton).toHaveText('📚');

    // Stored, with no version recorded for it.
    const stored = await (await api.get(`/api/pages/${pageId}`)).json();
    expect(stored.icon).toBe('📚');
    expect((await (await api.get(`/api/pages/${pageId}/versions`)).json()).length).toBe(
      versionsBefore
    );

    // After a reload: header, breadcrumb and tab title.
    await page.reload();
    await expect(page.getByRole('button', { name: '아이콘 변경' })).toHaveText('📚');
    await expect(breadcrumb).toContainText(`📚${title}`);
    await expect(page).toHaveTitle(`📚 ${title} · Papyr.us`);

    // The workspace document table shows it next to the title.
    await page.goto('/');
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('cell').first()).toContainText(`📚${title}`);

    // Removing the icon brings back the quiet add button.
    await row.getByRole('link', { name: title }).click();
    await page.getByRole('button', { name: '아이콘 변경' }).click();
    saved = waitForIconSave(page, pageId);
    await picker.getByRole('button', { name: '아이콘 제거' }).click();
    await saved;
    await expect(page.getByRole('button', { name: '아이콘 추가' })).toBeFocused();
    await expect(page.getByRole('button', { name: '아이콘 변경' })).toHaveCount(0);
    // Polled: the API context's keep-alive socket may have idled out during the UI steps.
    await expect
      .poll(async () => (await (await api.get(`/api/pages/${pageId}`)).json()).icon)
      .toBeNull();
  } finally {
    if (pageId) await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
  }
});

test('the API refuses an icon that is not exactly one emoji', async ({ request }) => {
  const user = await registerTestUser(request, 'icon-api');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  try {
    const stamp = Date.now();
    const created = await api.post('/api/pages', {
      data: {
        title: `Icon API ${stamp}`,
        slug: `icon-api-${stamp}`,
        content: '',
        folder: 'docs',
        author: user.name,
        tags: [],
        icon: '🧑🏽‍💻',
      },
    });
    expect(created.status()).toBe(201);
    const { id, icon } = await created.json();
    expect(icon).toBe('🧑🏽‍💻');

    for (const bad of ['text', '🔥🔥', '<b>🔥</b>', ' ']) {
      const autosave = await api.put(`/api/pages/${id}/autosave`, { data: { icon: bad } });
      expect(autosave.status()).toBe(400);
      const put = await api.put(`/api/pages/${id}`, { data: { icon: bad } });
      expect(put.status()).toBe(400);
    }
    expect((await (await api.get(`/api/pages/${id}`)).json()).icon).toBe('🧑🏽‍💻');
    await api.delete(`/api/pages/${id}`);
  } finally {
    await api.dispose();
  }
});
