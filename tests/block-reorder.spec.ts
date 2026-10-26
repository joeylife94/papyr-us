import { test, expect, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #103 E3: blocks reorder by mouse drag, by Alt+↑/↓ inside a block, and by the drag
// handle's keyboard mode (Space, arrows, Space). Every reorder autosaves and survives a reload.

const blockTexts = (page: Page) =>
  page
    .locator('[data-page-body] [data-block-row] textarea')
    .evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));

const waitForAutosave = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/pages/${pageId}/autosave` &&
      response.request().method() === 'PUT' &&
      response.ok()
  );

test('blocks reorder by mouse, Alt+arrow and handle keyboard, and the order persists', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'reorder');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const slug = `reorder-${stamp}`;
  const paragraph = (id: string, order: number) => ({
    id: `block_${id}_${stamp}`,
    type: 'paragraph',
    content: id,
    properties: {},
    order,
    children: [],
  });
  const created = await api.post('/api/pages', {
    data: {
      title: `Reorder ${stamp}`,
      slug,
      content: 'A\n\nB\n\nC',
      blocks: [paragraph('A', 0), paragraph('B', 1), paragraph('C', 2)],
      folder: 'docs',
      author: 'u',
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const pageId: number = (await created.json()).id;

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect.poll(() => blockTexts(page)).toEqual(['A', 'B', 'C']);
    const rows = page.locator('[data-page-body] [data-block-row]');

    // 1. Alt+↑ twice inside block C moves it to the top; the caret stays in C.
    let saved = waitForAutosave(page, pageId);
    // Locators are lazy (nth(2) is a different block after a move), so keep pressing through
    // the keyboard: that also proves focus stays in the moved block.
    await rows.nth(2).locator('textarea').focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => blockTexts(page)).toEqual(['A', 'C', 'B']);
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => blockTexts(page)).toEqual(['C', 'A', 'B']);
    await expect(rows.nth(0).locator('textarea')).toBeFocused();
    await expect(page.getByText('블록을 1번째 위치로 옮겼습니다 (3개 중)')).toBeAttached();
    await saved;

    // 2. Mouse: drag B (last) by its handle above C (first).
    saved = waitForAutosave(page, pageId);
    await rows.nth(2).hover();
    const handle = await rows.nth(2).getByTestId('block-drag-handle').boundingBox();
    const top = await rows.nth(0).boundingBox();
    if (!handle || !top) throw new Error('block rows are not laid out');
    const x = handle.x + handle.width / 2;
    await page.mouse.move(x, handle.y + handle.height / 2);
    await page.mouse.down();
    // Past the drag threshold first, then onto the first row.
    await page.mouse.move(x, handle.y + handle.height / 2 - 12, { steps: 4 });
    await page.mouse.move(x, top.y + 2, { steps: 16 });
    await page.mouse.up();
    await expect.poll(() => blockTexts(page)).toEqual(['B', 'C', 'A']);
    await saved;

    // 3. Handle keyboard mode: lift A (last) with Space, move it up one slot, drop with Space.
    saved = waitForAutosave(page, pageId);
    await rows.nth(2).getByTestId('block-drag-handle').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    await expect.poll(() => blockTexts(page)).toEqual(['B', 'A', 'C']);
    await saved;

    // The order is stored: after a reload, and in the derived content.
    await page.reload();
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect.poll(() => blockTexts(page)).toEqual(['B', 'A', 'C']);
    const stored = await (await api.get(`/api/pages/${pageId}`)).json();
    expect(stored.content).toBe('B\n\nA\n\nC');
  } finally {
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
  }
});
