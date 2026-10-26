import { test, expect, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #111 §3: Ctrl/Cmd+O opens the quick switcher. Typing finds readable pages of the current
// scope by title; Enter opens the selected one; a title nothing matches exactly offers
// "새 문서: <title>", which creates that page in the scope and opens it with the caret in its body.

const switcher = (page: Page) => page.getByRole('combobox', { name: '문서 제목' });

const openWithShortcut = async (page: Page) => {
  await page.keyboard.press('Control+o');
  await expect(switcher(page)).toBeFocused();
};

test('quick switcher opens existing pages and creates new ones in the current scope', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'switcher');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const existingTitle = `Switcher Roadmap ${stamp}`;
  const newTitle = `Switcher Fresh Note ${stamp}`;

  const created = await api.post('/api/pages', {
    data: {
      title: existingTitle,
      slug: `switcher-roadmap-${stamp}`,
      content: 'Roadmap body',
      folder: 'docs',
      author: user.email,
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const existing = await created.json();

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto('/');
    const createLink = page.getByRole('link', { name: '새 문서 작성' }).first();
    await expect(createLink).toBeVisible();

    // Ctrl+O is taken from the browser's "open file" and Esc returns focus where it was.
    await page.evaluate(() => {
      window.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key.toLowerCase() === 'o') {
          (window as any).__ctrlOPrevented = event.defaultPrevented;
        }
      });
    });
    await createLink.focus();
    await openWithShortcut(page);
    expect(await page.evaluate(() => (window as any).__ctrlOPrevented)).toBe(true);
    await expect(page.getByRole('dialog', { name: '빠른 전환' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '빠른 전환' })).toBeHidden();
    await expect(createLink).toBeFocused();

    // Reopening at once (while the closing animation runs) starts empty and focused.
    await openWithShortcut(page);
    await switcher(page).fill('leftover');
    await page.keyboard.press('Escape');
    await openWithShortcut(page);
    await expect(switcher(page)).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '빠른 전환' })).toBeHidden();

    // 1. Part of an existing title (any case) → Enter opens it.
    await openWithShortcut(page);
    await switcher(page).fill(`roadmap ${stamp}`);
    const match = page.getByRole('option', { name: new RegExp(existingTitle) });
    await expect(match).toBeVisible();
    await expect(match).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('option', { name: /^새 문서:/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/page/${existing.slug}$`));
    await expect(page.getByRole('heading', { name: existingTitle })).toBeVisible();

    // An exact title (case-insensitive) offers no "새 문서" option.
    await openWithShortcut(page);
    await switcher(page).fill(existingTitle.toUpperCase());
    await expect(page.getByRole('option', { name: new RegExp(existingTitle) })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '문서 1개' })).toBeVisible();
    await expect(page.getByRole('option', { name: /^새 문서:/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '빠른 전환' })).toBeHidden();

    // 2. A new title → "새 문서: …" → the page opens in edit mode with the caret in the body.
    await openWithShortcut(page);
    await switcher(page).fill(newTitle);
    const createOption = page.getByRole('option', { name: `새 문서: ${newTitle}` });
    await expect(createOption).toBeVisible();
    await page.keyboard.press('ArrowUp'); // wraps to the last option, which it already is
    await expect(createOption).toHaveAttribute('aria-selected', 'true');
    const createResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
    );
    await page.keyboard.press('Enter');
    const createdPage = await (await createResponse).json();
    expect(createdPage.title).toBe(newTitle);
    expect(createdPage.teamId).toBeNull();
    await expect(page).toHaveURL(new RegExp(`/page/${createdPage.slug}$`));
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect(page.getByTestId('page-title')).toHaveText(newTitle);
    const body = page.locator('[data-page-body] textarea').first();
    await expect(body).toBeFocused();

    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/pages/${createdPage.id}/autosave` &&
        response.ok() &&
        (response.request().postData() ?? '').includes('First line from the switcher')
    );
    await page.keyboard.type('First line from the switcher');
    await saved;
    await page.reload();
    await expect(page.getByRole('heading', { name: newTitle })).toBeVisible();
    await expect(page.locator('[data-page-body] textarea').first()).toHaveValue(
      'First line from the switcher'
    );

    // The new page is found next time instead of being offered again.
    await openWithShortcut(page);
    await switcher(page).fill(newTitle.toLowerCase());
    await expect(page.getByRole('option', { name: new RegExp(newTitle) })).toBeVisible();
    await expect(page.getByRole('option', { name: /^새 문서:/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '빠른 전환' })).toBeHidden();

    // 3. The command palette entry opens the switcher too.
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('페이지 검색, 명령어 실행... (Ctrl+K)').fill('빠른 전환');
    await page.keyboard.press('Enter');
    await expect(switcher(page)).toBeFocused();
    await switcher(page).fill('x');
    await expect(switcher(page)).toHaveValue('x');
  } finally {
    await api.dispose();
  }
});

test('a choice made while the search is still loading is kept', async ({ page, request }) => {
  const user = await registerTestUser(request, 'switcher-pending');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const typed = `Pending Plan ${stamp}`;
  // A page whose title contains the typed one: the first result once the search returns.
  const partial = await api.post('/api/pages', {
    data: {
      title: `${typed} archive`,
      slug: `pending-plan-archive-${stamp}`,
      content: 'Archive body',
      folder: 'docs',
      author: user.email,
      tags: [],
    },
  });
  expect(partial.status()).toBe(201);

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto('/');
    await expect(page.getByRole('link', { name: '새 문서 작성' }).first()).toBeVisible();

    // Hold the search for the typed title until the choice has been made.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/page-links/search?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('q') === typed) await held;
      await route.continue();
    });

    await openWithShortcut(page);
    await switcher(page).fill(typed);
    const createOption = page.getByRole('option', { name: `새 문서: ${typed}` });
    await expect(createOption).toBeVisible();
    await page.keyboard.press('ArrowUp'); // wraps to the last option: "새 문서"
    await expect(createOption).toHaveAttribute('aria-selected', 'true');
    const createResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
    );
    await page.keyboard.press('Enter');
    release();

    // The typed title is created, not the page that only contains it opened.
    const created = await (await createResponse).json();
    expect(created.title).toBe(typed);
    await expect(page).toHaveURL(new RegExp(`/page/${created.slug}$`));
    await expect(page.getByTestId('page-title')).toHaveText(typed);
  } finally {
    await api.dispose();
  }
});

test('quick switcher searches and creates inside the team of a team route', async ({
  page,
  request,
}) => {
  const owner = await registerTestUser(request, 'switcher-team');
  const api = await createAuthenticatedApiContext(owner.email, owner.password);
  const stamp = Date.now();
  const teamResponse = await api.post('/api/teams', {
    data: { name: `switcher-team-${stamp}`, displayName: `Switcher Team ${stamp}` },
  });
  expect(teamResponse.status()).toBe(201);
  const team = await teamResponse.json();
  const personalTitle = `Switcher Personal ${stamp}`;
  const personal = await api.post('/api/pages', {
    data: {
      title: personalTitle,
      slug: `switcher-personal-${stamp}`,
      content: 'personal',
      folder: 'docs',
      author: owner.email,
      tags: [],
    },
  });
  expect(personal.status()).toBe(201);
  const pageIds: number[] = [(await personal.json()).id];

  try {
    await loginPageWithCookies(page, owner.email, owner.password);
    await page.goto(`/teams/${team.name}/pages`);
    await expect(
      page.getByRole('link', { name: `현재 워크스페이스: ${team.displayName}` })
    ).toBeVisible();

    await openWithShortcut(page);
    // Team-less pages are outside this scope.
    await switcher(page).fill(personalTitle);
    await expect(
      page.getByRole('status').filter({ hasText: `${team.displayName} · 일치하는 문서가 없습니다` })
    ).toBeVisible();
    await expect(page.getByRole('option', { name: `새 문서: ${personalTitle}` })).toBeVisible();
    await expect(page.getByRole('option', { name: new RegExp(`^${personalTitle}`) })).toHaveCount(
      0
    );

    const teamTitle = `Switcher Team Note ${stamp}`;
    await switcher(page).fill(teamTitle);
    await expect(page.getByRole('option', { name: `새 문서: ${teamTitle}` })).toBeVisible();
    const createResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
    );
    await page.keyboard.press('Enter');
    const createdPage = await (await createResponse).json();
    pageIds.push(createdPage.id);
    expect(createdPage.teamId).toBe(team.id);
    await expect(page).toHaveURL(new RegExp(`/page/${createdPage.slug}$`));
    await expect(page.getByTestId('page-title')).toHaveText(teamTitle);

    // On the team page itself the scope is still the team: the new page is found.
    await openWithShortcut(page);
    await switcher(page).fill(teamTitle);
    await expect(page.getByRole('option', { name: new RegExp(`^${teamTitle}`) })).toBeVisible();
    await expect(page.getByRole('option', { name: /^새 문서:/ })).toHaveCount(0);
  } finally {
    for (const id of pageIds) {
      await api.delete(`/api/pages/${id}`).catch(() => {});
      await api.delete(`/api/trash/${id}`).catch(() => {});
    }
    await api.delete(`/api/teams/${team.id}`).catch(() => {});
    await api.dispose();
  }
});
