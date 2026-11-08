import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #135: a synced block reference shows its original live, fetched with the viewer's own
// access, and never writes the original's content into the referencing page. A reader who may
// not read the original's page sees "접근할 수 없는 블록" and nothing of it, even where an older
// client had saved a copy.

const paragraph = (id: string, text: string) => [{ id, type: 'paragraph', content: text }];

const referenceBlock = (id: string, originalBlockId: string, extra: object = {}) => ({
  id,
  type: 'synced_block',
  content: '',
  properties: { originalBlockId, isOriginal: false, ...extra },
  order: 0,
});

const createPage = async (
  api: APIRequestContext,
  title: string,
  blocks: unknown[],
  content = ''
) => {
  const res = await api.post('/api/pages', {
    data: {
      title,
      slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`,
      content,
      blocks,
      folder: 'docs',
      author: 'u',
      tags: [],
    },
  });
  expect(res.status(), `create ${title}`).toBe(201);
  return (await res.json()) as { id: number; slug: string; title: string };
};

const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));

test('a synced block reference shows the original live and saves no copy of it', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const owner = await registerTestUser(request, 'sbref-owner');
  const reader = await registerTestUser(request, 'sbref-reader');
  const ownerApi = await createAuthenticatedApiContext(owner.email, owner.password);
  const readerApi = await createAuthenticatedApiContext(reader.email, reader.password);
  const stamp = Date.now();
  const originalBlockId = `synced_ref_${stamp}`;
  const originalText = `Original text ${stamp}`;
  const created: number[] = [];
  const context = await browser.newContext();

  try {
    // The original lives on a page only its owner can read.
    const originalPage = await createPage(ownerApi, `Synced Original ${stamp}`, []);
    created.push(originalPage.id);
    const block = await ownerApi.post('/api/synced-blocks', {
      data: {
        pageId: originalPage.id,
        originalBlockId,
        content: paragraph('o1', originalText),
      },
    });
    expect(block.status()).toBe(201);

    // The referencing page is public; one version as an older client saved it, with a copy.
    const referencing = await createPage(ownerApi, `Synced Reference ${stamp}`, [
      referenceBlock(`ref_${stamp}`, originalBlockId),
      { id: `p_${stamp}`, type: 'paragraph', content: 'Mine', order: 1 },
    ]);
    const stale = await createPage(ownerApi, `Synced Stale ${stamp}`, [
      referenceBlock(`stale_${stamp}`, originalBlockId, {
        syncedContent: paragraph('c1', `Stale copy ${stamp}`),
      }),
      { id: `q_${stamp}`, type: 'paragraph', content: 'Stale page text', order: 1 },
    ]);
    created.push(referencing.id, stale.id);
    for (const id of [referencing.id, stale.id]) {
      const grant = await ownerApi.post(`/api/pages/${id}/permissions`, {
        data: { entityType: 'public', permission: 'viewer' },
      });
      expect(grant.status()).toBe(201);
    }

    // ── The owner's editor shows the original live ──
    await loginPageWithCookies(page, owner.email, owner.password);
    const fetched = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/synced-blocks/${originalBlockId}` &&
        r.request().method() === 'GET'
    );
    await page.goto(`/page/${referencing.slug}`);
    expect((await fetched).status()).toBe(200);
    const reference = page.locator('[data-synced-block-state="ok"]');
    await expect(reference.getByText(originalText, { exact: true })).toBeVisible();

    // Editing the page saves its blocks; the reference still holds only originalBlockId.
    const saved = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/pages/${referencing.id}/autosave` &&
        r.request().method() === 'PUT'
    );
    const text = page.locator('[data-page-body] textarea').first();
    await text.click();
    await text.press('End');
    await page.keyboard.type(' edited');
    const autosave = await saved;
    expect(autosave.ok()).toBe(true);
    expect(JSON.stringify(autosave.request().postDataJSON())).not.toContain(originalText);
    const stored = await (await ownerApi.get(`/api/pages/${referencing.id}`)).json();
    expect(stored.blocks[0].properties).toEqual({ originalBlockId, isOriginal: false });
    expect(JSON.stringify(stored)).not.toContain(originalText);

    // The original changes; the reference follows when the window regains focus.
    const changed = await ownerApi.patch(`/api/synced-blocks/${originalBlockId}`, {
      data: { content: paragraph('o1', `Changed text ${stamp}`) },
    });
    expect(changed.status()).toBe(200);
    await refocus(page);
    await expect(reference.getByText(`Changed text ${stamp}`, { exact: true })).toBeVisible();

    // ── A reader without access to the original sees the placeholder, never the content ──
    expect((await readerApi.get(`/api/synced-blocks/${originalBlockId}`)).status()).toBe(404);
    const readerPage = await context.newPage();
    await loginPageWithCookies(readerPage, reader.email, reader.password);
    for (const target of [referencing, stale]) {
      await readerPage.goto(`/page/${target.slug}`);
      await expect(readerPage.getByTestId('page-title')).toHaveAttribute(
        'contenteditable',
        'false'
      );
      await expect(readerPage.locator('[data-synced-block-state="inaccessible"]')).toHaveText(
        '접근할 수 없는 블록'
      );
      const html = await readerPage.content();
      expect(html).not.toContain(`Changed text ${stamp}`);
      expect(html).not.toContain(`Stale copy ${stamp}`);
    }
    await expect(readerPage.getByText('Stale page text')).toBeVisible();

    // The next save of the stale page drops its old copy.
    const restored = await ownerApi.put(`/api/pages/${stale.id}/autosave`, {
      data: {
        blocks: [
          referenceBlock(`stale_${stamp}`, originalBlockId, {
            syncedContent: paragraph('c1', `Stale copy ${stamp}`),
          }),
          { id: `q_${stamp}`, type: 'paragraph', content: 'Stale page text, saved', order: 1 },
        ],
      },
    });
    expect(restored.ok()).toBe(true);
    const cleaned = await (await ownerApi.get(`/api/pages/${stale.id}`)).json();
    expect(JSON.stringify(cleaned)).not.toContain(`Stale copy ${stamp}`);
    expect(cleaned.blocks[0].properties).toEqual({ originalBlockId, isOriginal: false });
  } finally {
    await context.close();
    for (const id of created.reverse()) await ownerApi.delete(`/api/pages/${id}`).catch(() => {});
    await ownerApi.dispose();
    await readerApi.dispose();
  }
});
