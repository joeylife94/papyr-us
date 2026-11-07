import { test, expect, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #111 §4: "오늘의 노트" opens today's note of the current scope and creates it on first
// use. Opening it again (button, Alt+Shift+D or the command palette) lands on the same page, and
// the document list holds exactly one note for the day.

const localDate = (page: Page) =>
  page.evaluate(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });

test("today's note opens the same page every time and is listed once", async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'daily-journey');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const me = await (await api.get('/api/auth/me')).json();
  let noteId: number | undefined;

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto('/');
    const date = await localDate(page);
    const noteUrl = new RegExp(`/page/daily-${date}-u${me.id}$`);

    // 1. First use creates the note (title = the viewer's local date) and opens it for writing.
    const button = page.getByRole('button', { name: '오늘의 노트' });
    await expect(button).toBeEnabled();
    const first = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/pages/daily' &&
        response.request().method() === 'POST'
    );
    await button.click();
    const firstBody = await (await first).json();
    expect(firstBody.created).toBe(true);
    noteId = firstBody.page.id;
    await expect(page).toHaveURL(noteUrl);
    await expect(page.getByTestId('page-title')).toHaveText(date);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect(page.locator('[data-page-body] textarea').last()).toBeFocused();

    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/pages/${noteId}/autosave` &&
        response.ok() &&
        (response.request().postData() ?? '').includes('Standup notes')
    );
    await page.keyboard.type('Standup notes');
    await saved;

    // 2. Opening it again, from elsewhere, lands on the same page with its content.
    await page.goto('/');
    await expect(page.getByRole('button', { name: '오늘의 노트' })).toBeEnabled();
    const second = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/pages/daily'
    );
    await page.keyboard.press('Alt+Shift+D');
    const secondBody = await (await second).json();
    expect(secondBody).toMatchObject({ created: false, page: { id: noteId } });
    await expect(page).toHaveURL(noteUrl);
    await expect(page.locator('[data-page-body] textarea').last()).toHaveValue('Standup notes');
    await expect(page.locator('[data-page-body] textarea').last()).toBeFocused();

    await page.goto('/');
    await expect(page.getByRole('button', { name: '오늘의 노트' })).toBeEnabled();
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('페이지 검색, 명령어 실행... (Ctrl+K)').fill('오늘의 노트');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(noteUrl);

    // 3. The document list shows one note for today.
    await page.goto('/');
    const list = page.getByRole('table', { name: '최근 문서' });
    await expect(list.getByRole('link', { name: date, exact: true })).toHaveCount(1);
    const pages = await (await api.get('/api/pages?limit=100')).json();
    expect(pages.pages.filter((p: { title: string }) => p.title === date)).toHaveLength(1);
  } finally {
    if (noteId) {
      await api.delete(`/api/pages/${noteId}`).catch(() => {});
      await api.delete(`/api/trash/${noteId}`).catch(() => {});
    }
    await api.dispose();
  }
});
