import { mkdir } from 'fs/promises';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #134: an editor adds a preset cover, changes it to an uploaded image, repositions it
// (keyboard and drag) and removes it; everything autosaves into metadata.cover. A reader sees the
// cover without controls. A share link shows a preset cover, and an uploaded image only to a
// viewer who may load it (an anonymous viewer gets no cover, not a broken image).

// 8x24 PNG: red top half, blue bottom half.
const COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAYCAMAAADwB0wiAAAABlBMVEUoWsjcPDxXzeY7AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQI12NghAIGOjDoCAA9mABhw/uo3QAAAABJRU5ErkJggg==',
  'base64'
);
const IMAGE_PATH =
  /^\/api\/uploads\/images\/\d{10,16}-[0-9a-f]{16}-[A-Za-z0-9_-]{0,50}\.(?:png|jpe?g|gif|webp)$/i;

const SHOTS = process.env.COVER_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const waitForCoverSave = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/pages/${pageId}/autosave` &&
      response.request().method() === 'PUT' &&
      'cover' in (response.request().postDataJSON() ?? {}) &&
      response.ok()
  );

async function storedMetadata(api: APIRequestContext, pageId: number) {
  const response = await api.get(`/api/pages/${pageId}`);
  expect(response.status()).toBe(200);
  return ((await response.json()).metadata ?? {}) as Record<string, any>;
}

const imageLoaded = (page: Page) =>
  page
    .getByTestId('page-cover')
    .locator('img')
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);

test('an editor adds, changes, repositions and removes a cover; a reader only sees it', async ({
  page,
  browser,
  request,
}) => {
  const owner = await registerTestUser(request, 'cover');
  const reader = await registerTestUser(request, 'cover-reader');
  const api = await createAuthenticatedApiContext(owner.email, owner.password);
  const readerApi = await createAuthenticatedApiContext(reader.email, reader.password);
  const stamp = Date.now();
  const slug = `cover-${stamp}`;
  const created = await api.post('/api/pages', {
    data: {
      title: `Cover Page ${stamp}`,
      slug,
      content: 'body',
      folder: 'docs',
      author: owner.email,
      tags: [],
      metadata: { source: 'kept' },
    },
  });
  expect(created.status()).toBe(201);
  const pageId: number = (await created.json()).id;
  const readerId: number = (await (await readerApi.get('/api/auth/me')).json()).id;
  const grant = await api.post(`/api/pages/${pageId}/permissions`, {
    data: { entityType: 'user', entityId: readerId, permission: 'viewer' },
  });
  expect(grant.status()).toBe(201);
  let uploaded: string | null = null;

  try {
    await loginPageWithCookies(page, owner.email, owner.password);
    await page.goto(`/page/${slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect(page.getByTestId('page-cover')).toHaveCount(0);

    // ── Add a preset cover ──
    let saved = waitForCoverSave(page, pageId);
    await page.getByRole('button', { name: '커버 추가' }).click();
    const picker = page.getByRole('dialog', { name: '커버 선택' });
    await expect(picker).toBeVisible();
    await shot(page, '01-picker');
    await picker.getByRole('button', { name: '바다' }).click();
    await saved;
    await expect(picker).toBeHidden();
    const cover = page.getByTestId('page-cover');
    await expect(cover).toHaveAttribute('data-cover-preset', 'ocean');
    expect(await storedMetadata(api, pageId)).toEqual({
      source: 'kept',
      cover: { type: 'preset', id: 'ocean' },
    });
    await expect(page.getByRole('button', { name: '커버 추가' })).toHaveCount(0);
    await shot(page, '02-preset');

    // ── Persists across a reload; a preset has no position to adjust ──
    await page.reload();
    await expect(page.getByTestId('page-cover')).toHaveAttribute('data-cover-preset', 'ocean');
    const controls = page.getByRole('group', { name: '커버' });
    await expect(controls.getByRole('button', { name: '위치 조정' })).toHaveCount(0);

    // ── Change it to an uploaded image ──
    saved = waitForCoverSave(page, pageId);
    const uploadResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/upload' && response.request().method() === 'POST'
    );
    await controls.getByRole('button', { name: '커버 변경' }).click();
    await expect(picker.getByRole('button', { name: '바다' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await picker.getByTestId('page-cover-file-input').setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: COVER_PNG,
    });
    expect((await uploadResponse).status()).toBe(201);
    await saved;
    let stored = await storedMetadata(api, pageId);
    expect(stored.source).toBe('kept');
    expect(stored.cover).toMatchObject({ type: 'image', offsetY: 50 });
    expect(stored.cover.path).toMatch(IMAGE_PATH);
    uploaded = stored.cover.path;
    await expect(cover).toHaveAttribute('data-cover-type', 'image');
    const image = cover.locator('img');
    await expect(image).toHaveAttribute('src', stored.cover.path);
    // Decorative: empty alt text.
    await expect(image).toHaveAttribute('alt', '');
    await expect.poll(() => imageLoaded(page)).toBe(true);
    await cover.hover();
    await shot(page, '03-image-controls');

    // ── Reposition with the keyboard, then by dragging; save ──
    await controls.getByRole('button', { name: '위치 조정' }).click();
    const slider = page.getByRole('slider', { name: '커버 세로 위치' });
    await expect(slider).toBeFocused();
    await expect(slider).toHaveAttribute('aria-valuenow', '50');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(slider).toHaveAttribute('aria-valuenow', '40');
    await expect(image).toHaveCSS('object-position', '50% 40%');
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - box.height / 4, {
      steps: 5,
    });
    await page.mouse.up();
    // Dragging the image up by a quarter of the cover's height shows a lower part: 40 + 25.
    await expect(slider).toHaveAttribute('aria-valuenow', '65');
    await shot(page, '04-reposition');
    saved = waitForCoverSave(page, pageId);
    await page.getByRole('button', { name: '위치 저장' }).click();
    await saved;
    await expect(slider).toHaveCount(0);
    stored = await storedMetadata(api, pageId);
    expect(stored.cover).toEqual({ type: 'image', path: uploaded, offsetY: 65 });

    // Escape leaves the position as it was, without saving.
    await controls.getByRole('button', { name: '위치 조정' }).click();
    await expect(slider).toBeFocused();
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '100');
    await page.keyboard.press('Escape');
    await expect(slider).toHaveCount(0);
    await expect(image).toHaveCSS('object-position', '50% 65%');

    await page.reload();
    await expect(page.getByTestId('page-cover').locator('img')).toHaveCSS(
      'object-position',
      '50% 65%'
    );
    expect((await storedMetadata(api, pageId)).cover.offsetY).toBe(65);

    // ── A reader sees the cover without any cover control, and cannot change it ──
    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await loginPageWithCookies(readerPage, reader.email, reader.password);
    await readerPage.goto(`/page/${slug}`);
    await expect(readerPage.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
    await expect(readerPage.getByTestId('page-cover')).toHaveAttribute('data-cover-type', 'image');
    await expect.poll(() => imageLoaded(readerPage)).toBe(true);
    await shot(readerPage, '05-reader');
    for (const name of ['커버 추가', '커버 변경', '위치 조정', '커버 제거']) {
      await expect(readerPage.getByRole('button', { name })).toHaveCount(0);
    }
    const denied = await readerApi.put(`/api/pages/${pageId}/autosave`, {
      data: { cover: null },
    });
    expect(denied.status()).toBe(403);
    await readerContext.close();

    // ── Remove the cover ──
    saved = waitForCoverSave(page, pageId);
    await page
      .getByRole('group', { name: '커버' })
      .getByRole('button', { name: '커버 제거' })
      .click();
    await saved;
    await expect(page.getByTestId('page-cover')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '커버 추가' })).toBeVisible();
    await shot(page, '06-removed');
    expect(await storedMetadata(api, pageId)).toEqual({ source: 'kept' });
  } finally {
    if (uploaded) await api.delete(uploaded).catch(() => {});
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await readerApi.dispose();
    await api.dispose();
  }
});

test('a share link shows a preset cover, and an uploaded image only to viewers who may load it', async ({
  browser,
  request,
}) => {
  const owner = await registerTestUser(request, 'cover-share');
  const api = await createAuthenticatedApiContext(owner.email, owner.password);
  const stamp = Date.now();
  const title = `Shared Cover ${stamp}`;
  const created = await api.post('/api/pages', {
    data: {
      title,
      slug: `cover-share-${stamp}`,
      content: 'body',
      folder: 'docs',
      author: 'u',
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const pageId: number = (await created.json()).id;
  const upload = await api.post('/api/upload', {
    multipart: { files: { name: 'cover.png', mimeType: 'image/png', buffer: COVER_PNG } },
  });
  expect(upload.status()).toBe(201);
  const path: string = (await upload.json()).files[0].url;
  expect(path).toMatch(IMAGE_PATH);
  const setCover = async (cover: unknown) =>
    expect((await api.put(`/api/pages/${pageId}/autosave`, { data: { cover } })).status()).toBe(
      200
    );
  const share = await api.post(`/api/pages/${pageId}/share`, { data: {} });
  expect(share.status()).toBe(201);
  const token: string = (await share.json()).token;

  const anonymous = await browser.newContext();
  const viewer = await anonymous.newPage();
  try {
    // An anonymous viewer may not load the upload: the page shows, without a cover.
    await setCover({ type: 'image', path, offsetY: 20 });
    const imageRequest = viewer.waitForResponse(
      (response) => new URL(response.url()).pathname === path
    );
    await viewer.goto(`/share/${token}`);
    await expect(viewer.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    expect((await imageRequest).status()).toBe(401);
    await expect(viewer.getByTestId('page-cover')).toHaveCount(0);

    // A preset cover is plain CSS and always shows.
    await setCover({ type: 'preset', id: 'sunset' });
    await viewer.reload();
    await expect(viewer.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(viewer.getByTestId('page-cover')).toHaveAttribute('data-cover-preset', 'sunset');
    await expect(viewer.getByRole('button', { name: /커버/ })).toHaveCount(0);
    await shot(viewer, '07-share-preset');
  } finally {
    await anonymous.close();
    await api.delete(path).catch(() => {});
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
  }
});
