import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #103 E6 (+ #111 page preview): link a page with `[[` / `@`, see it as a chip with the
// target's icon and current title, follow renames, see the backlink on the target, hover for a
// preview, and see "접근할 수 없는 페이지" once the target is trashed.

const paragraph = (id: string, content: string, order = 0) => ({
  id,
  type: 'paragraph',
  content,
  properties: {},
  order,
  children: [],
});

async function createPage(
  api: APIRequestContext,
  data: { title: string; slug: string; content: string; icon?: string; blocks?: unknown[] }
) {
  const response = await api.post('/api/pages', {
    data: { folder: 'docs', author: 'u', tags: [], ...data },
  });
  expect(response.status(), `create ${data.slug}`).toBe(201);
  return (await response.json()) as { id: number; slug: string; title: string };
}

const waitForAutosave = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/pages/${pageId}/autosave` &&
      response.request().method() === 'PUT' &&
      response.ok()
  );

const backlinkIds = async (api: APIRequestContext, pageId: number) => {
  const response = await api.get(`/api/pages/${pageId}/backlinks`);
  expect(response.status()).toBe(200);
  return ((await response.json()).backlinks as Array<{ id: number }>).map((b) => b.id);
};

test('link a page, follow its rename, see the backlink, preview it and lose it to the trash', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const user = await registerTestUser(request, 'links');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const targetTitle = `Link target ${stamp}`;
  const renamedTitle = `Renamed target ${stamp}`;

  const target = await createPage(api, {
    title: targetTitle,
    slug: `link-target-${stamp}`,
    content: `Target body about quokkas ${stamp}`,
    icon: '🎯',
  });
  const source = await createPage(api, {
    title: `Link source ${stamp}`,
    slug: `link-source-${stamp}`,
    content: 'Intro',
    blocks: [paragraph(`block_intro_${stamp}`, 'Intro')],
  });

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${source.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    const block = page.locator('[data-page-body] [data-block-row] textarea').first();
    await expect(block).toHaveValue('Intro');

    // 1. `[[` opens the picker as an ARIA combobox; Esc closes it and keeps the typed text.
    await block.click();
    await block.press('End');
    await block.pressSequentially(' [[Link tar');
    const listbox = page.getByRole('listbox', { name: '링크할 문서' });
    await expect(listbox).toBeVisible();
    await expect(block).toHaveAttribute('role', 'combobox');
    await expect(block).toHaveAttribute('aria-expanded', 'true');
    await expect(block).toHaveAttribute('aria-controls', (await listbox.getAttribute('id'))!);
    await expect(listbox.getByRole('option', { name: targetTitle })).toBeVisible();
    // The page being edited is never offered.
    await expect(listbox.getByRole('option', { name: `Link source ${stamp}` })).toHaveCount(0);
    await block.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(block).toHaveValue('Intro [[Link tar');
    await expect(block).not.toHaveAttribute('aria-expanded', 'true');

    // 2. Narrow the query, move with the arrow keys and pick with Enter: the token replaces it.
    await block.fill('Intro ');
    await block.press('End');
    await block.pressSequentially(`[[${stamp}`);
    await expect(listbox.getByRole('option', { name: targetTitle })).toBeVisible();
    const option = listbox.getByRole('option', { name: targetTitle });
    await block.press('ArrowDown');
    await block.press('ArrowUp');
    await expect(option).toHaveAttribute('aria-selected', 'true');
    await expect(block).toHaveAttribute(
      'aria-activedescendant',
      (await option.getAttribute('id'))!
    );
    const saved = waitForAutosave(page, source.id);
    await block.press('Enter');
    await expect(listbox).toBeHidden();
    await expect(block).toHaveValue(`Intro [[page:${target.id}]]`);
    await saved;

    // 3. Out of focus, the block shows the link as a chip: icon and current title.
    await page.getByTestId('page-title').click();
    const chip = page.locator(`[data-page-body] a[data-page-link="${target.id}"]`);
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText(`🎯${targetTitle}`);
    await expect(chip).toHaveAttribute('href', `/page/${target.slug}`);
    await expect.poll(() => backlinkIds(api, target.id)).toEqual([source.id]);

    // 4. Hovering the chip shows the page preview card.
    await chip.hover();
    const preview = page.getByTestId('page-link-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(targetTitle);
    await expect(preview).toContainText(`Target body about quokkas ${stamp}`);
    await page.mouse.move(0, 0);
    await expect(preview).toBeHidden();

    // 5. Clicking the text beside the chip edits the raw block again.
    await page
      .locator('[data-page-body] [data-page-link-preview]')
      .click({ position: { x: 4, y: 8 } });
    await expect(block).toBeFocused();
    await expect(block).toHaveValue(`Intro [[page:${target.id}]]`);
    await page.getByTestId('page-title').click();

    // 6. `@` at a word boundary also opens the picker; the slash command's "페이지 링크" too.
    const second = page.locator('[data-page-body] [data-block-row] textarea').nth(1);
    await block.focus();
    await block.press('End');
    await block.press('Enter');
    await expect(second).toBeFocused();
    await second.pressSequentially('/페이지');
    await page.getByRole('button', { name: /페이지 링크/ }).click();
    await expect(second).toHaveValue('@');
    await expect(listbox).toBeVisible();
    await second.pressSequentially(String(stamp));
    await expect(listbox.getByRole('option', { name: targetTitle })).toBeVisible();
    const savedSecond = waitForAutosave(page, source.id);
    await listbox.getByRole('option', { name: targetTitle }).click();
    await expect(second).toHaveValue(`[[page:${target.id}]]`);
    await savedSecond;

    // 7. Renaming the target updates every chip (links store only the id).
    const rename = await api.put(`/api/pages/${target.id}/autosave`, {
      data: { title: renamedTitle },
    });
    expect(rename.status()).toBe(200);
    await page.reload();
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    const chips = page.locator(`[data-page-body] a[data-page-link="${target.id}"]`);
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).toHaveText(`🎯${renamedTitle}`);
    await expect(page.locator('[data-page-body]')).not.toContainText(targetTitle);

    // 8. The target lists the source under "이 문서를 링크한 문서"; the chip opens the target.
    await chips.first().click();
    await expect(page).toHaveURL(new RegExp(`/page/${target.slug}$`));
    const backlinks = page.getByTestId('backlinks');
    await expect(backlinks.getByRole('heading', { name: /이 문서를 링크한 문서/ })).toBeVisible();
    await expect(
      backlinks.getByRole('link', { name: new RegExp(`Link source ${stamp}`) })
    ).toHaveAttribute('href', `/page/${source.slug}`);

    // A page nobody links to says so.
    await page.goto(`/page/${source.slug}`);
    await expect(page.getByTestId('backlinks')).toContainText(
      '아직 이 문서를 링크한 문서가 없습니다.'
    );

    // 9. Trashing the target leaves "접근할 수 없는 페이지": no link, no title, no icon.
    expect((await api.delete(`/api/pages/${target.id}`)).ok()).toBe(true);
    await page.reload();
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    const unreachable = page.locator('[data-page-body] [data-page-link-state="unreachable"]');
    await expect(unreachable).toHaveCount(2);
    await expect(unreachable.first()).toHaveText('접근할 수 없는 페이지');
    await expect(page.locator(`[data-page-body] a[data-page-link]`)).toHaveCount(0);
    await expect(page.locator('[data-page-body]')).not.toContainText(renamedTitle);
    await expect(page.locator('[data-page-body]')).not.toContainText('🎯');
  } finally {
    await api.delete(`/api/pages/${source.id}`).catch(() => {});
    await api.delete(`/api/pages/${target.id}`).catch(() => {});
    await api.dispose();
  }
});

// The Yjs server saves through the same pipeline: with REST autosave blocked in the browser,
// a link typed in a collaborative editor still reaches `page_links`. Needs FEATURE_COLLABORATION.
test('a link saved only through the Yjs server is indexed', async ({ page, request }) => {
  const flags = await (await request.get('/api/features')).json();
  test.skip(!flags.FEATURE_COLLABORATION, 'FEATURE_COLLABORATION is disabled on this server');

  const user = await registerTestUser(request, 'links-yjs');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const target = await createPage(api, {
    title: `Yjs target ${stamp}`,
    slug: `yjs-target-${stamp}`,
    content: 'Target',
  });
  const source = await createPage(api, {
    title: `Yjs source ${stamp}`,
    slug: `yjs-source-${stamp}`,
    content: 'seed',
  });

  try {
    const yjsLogs: string[] = [];
    page.on('console', (message) => {
      if (message.text().startsWith('[Yjs]')) yjsLogs.push(message.text());
    });
    let restAutosaves = 0;
    await page.route('**/api/pages/*/autosave', (route) => {
      restAutosaves += 1;
      return route.abort();
    });
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${source.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect
      .poll(() => yjsLogs.some((log) => log.startsWith('[Yjs] Document initialized')))
      .toBe(true);

    const block = page.locator('[data-page-body] [data-block-row] textarea').first();
    await expect(block).toHaveValue('seed');
    await block.click();
    await block.press('End');
    await block.pressSequentially(` [[Yjs target ${stamp}`);
    const listbox = page.getByRole('listbox', { name: '링크할 문서' });
    await expect(listbox.getByRole('option', { name: `Yjs target ${stamp}` })).toBeVisible();
    await block.press('Enter');
    await expect(block).toHaveValue(`seed [[page:${target.id}]]`);

    await expect.poll(() => backlinkIds(api, target.id), { timeout: 20_000 }).toEqual([source.id]);
    const stored = await (await api.get(`/api/pages/${source.id}`)).json();
    expect(stored.content).toBe(`seed [[page:${target.id}]]`);
    expect(restAutosaves).toBeGreaterThan(0);
  } finally {
    await api.delete(`/api/pages/${source.id}`).catch(() => {});
    await api.delete(`/api/pages/${target.id}`).catch(() => {});
    await api.dispose();
  }
});

// E2's lazy creation: the first POST already carries the blocks, and the link picker works on
// /create before the page exists.
test('a link typed before the page exists is indexed with the page', async ({ page, request }) => {
  const user = await registerTestUser(request, 'links-create');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const target = await createPage(api, {
    title: `Lazy target ${stamp}`,
    slug: `lazy-target-${stamp}`,
    content: 'Target',
  });
  const createdIds: number[] = [];

  try {
    await loginPageWithCookies(page, user.email, user.password);

    // 1. The lazy first POST carries the token: the page is indexed on creation.
    await page.goto('/create');
    await expect(page.getByTestId('page-title')).toBeVisible();
    const createResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: '단락', exact: true }).click();
    await page.locator('[data-page-body] textarea').first().fill(`See [[page:${target.id}]]`);
    const created = await (await createResponse).json();
    createdIds.push(created.id);
    expect(JSON.stringify(created.blocks)).toContain(`[[page:${target.id}]]`);
    expect(await backlinkIds(api, target.id)).toEqual([created.id]);

    // 2. The picker works while the page is still being created.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === '/api/pages',
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        await held;
        await route.continue();
      }
    );
    await page.goto('/create');
    await expect(page.getByTestId('page-title')).toBeVisible();
    const secondCreate = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: '단락', exact: true }).click();
    const block = page.locator('[data-page-body] textarea').first();
    await block.pressSequentially(`[[Lazy target ${stamp}`);
    const listbox = page.getByRole('listbox', { name: '링크할 문서' });
    await listbox.getByRole('option', { name: `Lazy target ${stamp}` }).click();
    await expect(block).toHaveValue(`[[page:${target.id}]]`);
    release();
    const second = await (await secondCreate).json();
    createdIds.push(second.id);
    await expect(page).toHaveURL(new RegExp(`/page/${second.slug}$`));
    await expect
      .poll(async () => (await backlinkIds(api, target.id)).sort())
      .toEqual([created.id, second.id].sort());
  } finally {
    for (const id of createdIds) await api.delete(`/api/pages/${id}`).catch(() => {});
    await api.delete(`/api/pages/${target.id}`).catch(() => {});
    await api.dispose();
  }
});
