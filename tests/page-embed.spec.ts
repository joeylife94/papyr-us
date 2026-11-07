import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #135 (decision P3-D2): a page embeds another page with "/페이지 임베드" or `![[`, both
// through the page picker. The embedding page stores only `![[page:<id>]]`; every viewer sees
// the target's current content with their own access, live, and a viewer who cannot read the
// target sees "접근할 수 없는 페이지" and nothing else.

const createPage = async (api: APIRequestContext, title: string, content = 'body') => {
  const res = await api.post('/api/pages', {
    data: {
      title,
      slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`,
      content,
      folder: 'docs',
      author: 'u',
      tags: [],
    },
  });
  expect(res.status(), `create ${title}`).toBe(201);
  return (await res.json()) as { id: number; slug: string; title: string };
};

const makePublic = async (api: APIRequestContext, pageId: number) => {
  const grant = await api.post(`/api/pages/${pageId}/permissions`, {
    data: { entityType: 'public', permission: 'viewer' },
  });
  expect(grant.status()).toBe(201);
};

/** What react-query listens to for "the window has focus again". */
const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));

const autosaveOf = (page: Page, pageId: number, contains: string) =>
  page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/pages/${pageId}/autosave` &&
      r.request().method() === 'PUT' &&
      JSON.stringify(r.request().postDataJSON()).includes(contains)
  );

test('embed a page from the slash menu and with ![[, storing only its id', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const user = await registerTestUser(request, 'embed');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const first = await createPage(api, `Embed First ${stamp}`, `First body ${stamp}`);
  const second = await createPage(api, `Embed Second ${stamp}`, `Second body ${stamp}`);
  const source = await createPage(api, `Embed Source ${stamp}`, 'Intro');

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${source.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');

    // "/페이지 임베드" on a new line opens the picker; picking embeds the page in place.
    const body = page.locator('[data-page-body] textarea').first();
    await body.click();
    await body.press('End');
    await body.press('Enter');
    await page.keyboard.type('/페이지');
    await page.getByRole('button', { name: /페이지 임베드/ }).click();
    const search = page.getByRole('combobox', { name: '임베드할 문서 선택' });
    await expect(search).toBeFocused();
    await search.fill(first.title);
    // Wait for the search results (the list before them shows every recent page).
    await expect(page.getByRole('option', { name: second.title })).toHaveCount(0);
    const savedFirst = autosaveOf(page, source.id, '"page_embed"');
    await page.getByRole('option', { name: first.title }).click();
    expect((await savedFirst).ok()).toBe(true);

    const firstEmbed = page.getByTestId('page-embed-block').first();
    await expect(firstEmbed.getByTestId('page-embed-title')).toHaveText(first.title);
    await expect(firstEmbed.getByTestId('page-embed-content')).toContainText(`First body ${stamp}`);
    await expect(firstEmbed.getByRole('link', { name: '열기' })).toHaveAttribute(
      'href',
      `/page/${first.slug}`
    );

    // Enter on the embed adds a paragraph below; typing "![[" there embeds another page.
    await expect(firstEmbed).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.type('![[');
    await expect(search).toBeFocused();
    await search.fill(second.title);
    await expect(page.getByRole('option', { name: first.title })).toHaveCount(0);
    const savedSecond = autosaveOf(page, source.id, `"pageId":${second.id}`);
    await page.getByRole('option', { name: second.title }).click();
    expect((await savedSecond).ok()).toBe(true);
    await expect(page.getByTestId('page-embed-title')).toHaveText([first.title, second.title]);

    // Stored: the tokens only, nothing of the embedded pages (content, search text, versions).
    const stored = await (await api.get(`/api/pages/${source.id}`)).json();
    expect(stored.content).toBe(`Intro\n\n![[page:${first.id}]]\n\n![[page:${second.id}]]`);
    for (const text of [`First body ${stamp}`, `Second body ${stamp}`, first.title]) {
      expect(JSON.stringify(stored)).not.toContain(text);
    }
    const versions = await (await api.get(`/api/pages/${source.id}/versions`)).text();
    expect(versions).not.toContain(`First body ${stamp}`);

    // An embed is a link: the target lists the source as a backlink.
    const backlinks = await (await api.get(`/api/pages/${first.id}/backlinks`)).json();
    expect(backlinks.map((p: { id: number }) => p.id)).toEqual([source.id]);
  } finally {
    for (const id of [source.id, first.id, second.id]) {
      await api.delete(`/api/pages/${id}`).catch(() => {});
    }
    await api.dispose();
  }
});

test('readers see the embedded page live, and nothing of a page they cannot read', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const owner = await registerTestUser(request, 'embed-owner');
  const reader = await registerTestUser(request, 'embed-reader');
  const ownerApi = await createAuthenticatedApiContext(owner.email, owner.password);
  const readerApi = await createAuthenticatedApiContext(reader.email, reader.password);
  const stamp = Date.now();
  const target = await createPage(ownerApi, `Shared Target ${stamp}`, `Target body ${stamp}`);
  const secret = await createPage(ownerApi, `Secret Target ${stamp}`, `Secret body ${stamp}`);
  const source = await createPage(
    ownerApi,
    `Shared Source ${stamp}`,
    `Intro\n\n![[page:${target.id}]]\n\n![[page:${secret.id}]]`
  );
  const context = await browser.newContext();

  try {
    await makePublic(ownerApi, source.id);
    await makePublic(ownerApi, target.id);
    expect([403, 404]).toContain((await readerApi.get(`/api/pages/${secret.id}`)).status());

    // The embed answer for the secret page is the unknown page's answer, no title or text.
    const secretEmbed = await (await readerApi.get(`/api/pages/${secret.id}/embed`)).json();
    const missing = await (await readerApi.get('/api/pages/2147483000/embed')).json();
    expect(secretEmbed).toEqual({ id: secret.id, accessible: false });
    expect({ ...missing, id: undefined }).toEqual({ ...secretEmbed, id: undefined });

    const page = await context.newPage();
    await loginPageWithCookies(page, reader.email, reader.password);
    await page.goto(`/page/${source.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');

    const shown = page.locator('[data-page-embed-state="ok"]');
    await expect(shown).toHaveCount(1);
    await expect(shown.getByTestId('page-embed-title')).toHaveText(target.title);
    await expect(shown.getByTestId('page-embed-content')).toContainText(`Target body ${stamp}`);
    await expect(page.locator('[data-page-embed-state="inaccessible"]')).toHaveText(
      '접근할 수 없는 페이지'
    );
    const html = await page.content();
    expect(html).not.toContain(secret.title);
    expect(html).not.toContain(`Secret body ${stamp}`);

    // The target changes; the reader's embed follows when the window regains focus. The new
    // content embeds the source again: a cycle, shown as a notice instead of recursing.
    const updated = await ownerApi.put(`/api/pages/${target.id}`, {
      data: { content: `Updated body ${stamp}\n\n![[page:${source.id}]]` },
    });
    expect(updated.ok()).toBe(true);
    const refetched = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/pages/${target.id}/embed`
    );
    await refocus(page);
    expect((await refetched).ok()).toBe(true);
    await expect(shown.getByTestId('page-embed-content')).toContainText(`Updated body ${stamp}`);
    await expect(shown.getByTestId('page-embed-content')).not.toContainText(`Target body ${stamp}`);
    await expect(shown.locator('[data-page-embed-state="limited"]')).toContainText(
      '이미 위에 임베드되어'
    );
    // The page itself still stores only the tokens.
    const stored = await (await readerApi.get(`/api/pages/${source.id}`)).json();
    expect(stored.content).not.toContain('Updated body');
  } finally {
    await context.close();
    for (const id of [source.id, target.id, secret.id]) {
      await ownerApi.delete(`/api/pages/${id}`).catch(() => {});
    }
    await ownerApi.dispose();
    await readerApi.dispose();
  }
});
