import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #103 E6: typing "@" opens a page picker that inserts an id-only link; the link renders
// as a chip with the target's current title (so a rename shows up), the target lists the
// backlink, and nothing about pages a viewer cannot read leaks through links, the picker or
// backlinks.

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

test('link a page with @, see the chip and the backlink, and a rename everywhere', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'links');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const target = await createPage(api, `Link Target ${stamp}`);
  const source = await createPage(api, `Link Source ${stamp}`, 'Intro');

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${source.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');

    // Type "@" after the text: the picker opens; search and pick with the keyboard.
    const body = page.locator('[data-page-body] textarea').first();
    await body.click();
    await body.press('End');
    const saved = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/pages/${source.id}/autosave` &&
        r.request().method() === 'PUT' &&
        JSON.stringify(r.request().postDataJSON()).includes(`[[page:${target.id}]]`)
    );
    await page.keyboard.type(' @');
    const search = page.getByRole('combobox', { name: '링크할 문서 선택' });
    await expect(search).toBeFocused();
    await search.fill(`Link Target ${stamp}`);
    await expect(page.getByRole('option', { name: target.title })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(body).toHaveValue(`Intro [[page:${target.id}]] `);
    expect((await saved).ok()).toBe(true);

    // Leaving the block shows the link as a chip with the target's title.
    await page.getByTestId('page-title').click();
    const chip = page.getByTestId('paragraph-preview').getByRole('link', { name: target.title });
    await expect(chip).toBeVisible();

    // The target lists the source as a backlink.
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/page/${target.slug}$`));
    await expect(
      page.getByTestId('backlinks').getByRole('link', { name: source.title })
    ).toBeVisible();

    // Renaming the target shows the new title wherever it is linked.
    const renamed = `Renamed Target ${stamp}`;
    expect((await api.put(`/api/pages/${target.id}`, { data: { title: renamed } })).ok()).toBe(
      true
    );
    await page.goto(`/page/${source.slug}`);
    await expect(
      page.getByTestId('paragraph-preview').getByRole('link', { name: renamed })
    ).toBeVisible();
    const stored = await (await api.get(`/api/pages/${source.id}`)).json();
    expect(stored.content).toContain(`[[page:${target.id}]]`);
    expect(stored.content).not.toContain(renamed);

    // Keyboard: Tab from the text being edited reaches the link row under it (the block stays
    // in edit mode), and Enter opens the link.
    await body.focus();
    await page.keyboard.press('Tab');
    const rowChip = page.locator('[data-page-body]').getByRole('link', { name: renamed });
    await expect(rowChip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/page/${target.slug}$`));
  } finally {
    await api.delete(`/api/pages/${source.id}`).catch(() => {});
    await api.delete(`/api/pages/${target.id}`).catch(() => {});
    await api.dispose();
  }
});

test('links, the picker and backlinks reveal nothing about unreadable pages', async ({
  browser,
  request,
}) => {
  const owner = await registerTestUser(request, 'links-owner');
  const reader = await registerTestUser(request, 'links-reader');
  const ownerApi = await createAuthenticatedApiContext(owner.email, owner.password);
  const readerApi = await createAuthenticatedApiContext(reader.email, reader.password);
  const stamp = Date.now();
  const secret = await createPage(ownerApi, `Secret Plan ${stamp}`);
  const shared = await createPage(ownerApi, `Shared Doc ${stamp}`, `See [[page:${secret.id}]].`);
  const created: Array<[APIRequestContext, number]> = [
    [ownerApi, shared.id],
    [ownerApi, secret.id],
  ];

  try {
    // The reader may read the shared page (public viewer), not the secret one.
    const grant = await ownerApi.post(`/api/pages/${shared.id}/permissions`, {
      data: { entityType: 'public', permission: 'viewer' },
    });
    expect(grant.status()).toBe(201);
    expect([403, 404]).toContain((await readerApi.get(`/api/pages/${secret.id}`)).status());

    // The link preview gives the reader no title, the same as for a page that does not exist.
    const preview = await (await readerApi.get(`/api/pages/${secret.id}/link-preview`)).json();
    const missing = await (await readerApi.get('/api/pages/2147483000/link-preview')).json();
    expect(preview).toEqual({ id: secret.id, accessible: false });
    expect({ ...missing, id: undefined }).toEqual({ ...preview, id: undefined });

    // The picker does not offer it, and its backlinks are closed to the reader.
    const search = await readerApi.get(`/api/page-links/search?q=${encodeURIComponent('Secret')}`);
    expect(search.status()).toBe(200);
    expect(await search.text()).not.toContain(`Secret Plan ${stamp}`);
    expect([403, 404]).toContain(
      (await readerApi.get(`/api/pages/${secret.id}/backlinks`)).status()
    );

    // A reader's own private page linking to the secret page is not in the owner's backlinks.
    const readerNote = await createPage(readerApi, `Reader note ${stamp}`, `[[page:${secret.id}]]`);
    created.push([readerApi, readerNote.id]);
    const ownerBacklinks = await (await ownerApi.get(`/api/pages/${secret.id}/backlinks`)).json();
    expect(ownerBacklinks.map((p: { id: number }) => p.id)).toEqual([shared.id]);

    // In the page itself, the reader sees "접근할 수 없는 페이지" and never the title.
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginPageWithCookies(page, reader.email, reader.password);
    await page.goto(`/page/${shared.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
    await expect(page.getByText('접근할 수 없는 페이지')).toBeVisible();
    expect(await page.content()).not.toContain(`Secret Plan ${stamp}`);
    await context.close();
  } finally {
    for (const [ctx, id] of created) await ctx.delete(`/api/pages/${id}`).catch(() => {});
    await ownerApi.dispose();
    await readerApi.dispose();
  }
});
