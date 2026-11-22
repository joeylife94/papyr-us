/**
 * Comments on a block, resolve and reopen, open discussions (WP15), end to end against the real
 * server, authentication and PostgreSQL. Every account is freshly registered.
 *
 * The owner writes a page with three blocks and shares it: C may comment, V may only view.
 * - the owner comments on a block from the row's comment button (keyboard reachable); the row then
 *   shows a marker with the open-thread count, the page header counts the open thread, and
 *   activating the marker lists only that block's threads in the comments panel;
 * - resolving moves the thread to "해결됨" (collapsed, naming who resolved it), the marker goes and
 *   the counts update; reopening brings it back;
 * - a viewer sees every thread and is offered no action (no block picker, no resolve, no reopen);
 * - a reader who may only comment (C, no editor) comments on a block from the panel and resolves it;
 * - deleting the anchored block in the editor leaves the thread saying the block is gone.
 * Everything is made by the spec; it can run twice against the same database.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type Page,
  type Response,
} from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const baseURL = () => process.env.BASE_URL || 'http://localhost:5003';

async function signedIn(prefix: string) {
  const fresh = await playwrightRequest.newContext({ baseURL: baseURL() });
  let user;
  try {
    user = await registerTestUser(fresh, prefix);
  } finally {
    await fresh.dispose();
  }
  const ctx = await createAuthenticatedApiContext(user.email, user.password);
  const me = await (await ctx.get('/api/auth/me')).json();
  return { ...user, ctx, id: Number(me.id) };
}

const block = (id: string, content: string, order: number) => ({
  id,
  type: 'paragraph',
  content,
  properties: {},
  order,
  children: [],
});

const apiResponse =
  (pageId: number, tail: string, method: string, status: number) => (res: Response) =>
    new URL(res.url()).pathname === `/api/pages/${pageId}/${tail}` &&
    res.request().method() === method &&
    res.status() === status;
const commentRoute = (action: string, status: number) => (res: Response) =>
  /^\/api\/comments\/\d+\//.test(new URL(res.url()).pathname) &&
  new URL(res.url()).pathname.endsWith(`/${action}`) &&
  res.request().method() === 'POST' &&
  res.status() === status;

/** Optional screenshots for review (WP15_SHOTS names a directory); asserts nothing. */
async function shot(page: Page, name: string) {
  const dir = process.env.WP15_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test.describe('Comments on a block, resolve and reopen', () => {
  test('a block comment, its marker and count, resolve and reopen, a viewer without actions, a commenter-only reader, a deleted block', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const stamp = Date.now().toString(36);
    const owner = await signedIn(`btown${stamp}`);
    const c = await signedIn(`btc${stamp}`);
    const v = await signedIn(`btv${stamp}`);
    const contexts = [];

    try {
      const slug = `bt-page-${stamp}`;
      const created = await owner.ctx.post('/api/pages', {
        data: {
          title: `Block threads ${stamp}`,
          slug,
          content: 'Alpha text\n\nBeta text\n\nGamma text',
          blocks: [
            block('blk-a', 'Alpha text', 0),
            block('blk-b', 'Beta text', 1),
            block('blk-c', 'Gamma text', 2),
          ],
          folder: 'bt',
          tags: [],
        },
      });
      expect(created.status()).toBe(201);
      const pageId: number = (await created.json()).id;
      for (const [who, permission] of [
        [c, 'commenter'],
        [v, 'viewer'],
      ] as const) {
        const shared = await owner.ctx.post(`/api/pages/${pageId}/permissions`, {
          data: { entityType: 'user', entityId: who.id, permission },
        });
        expect(shared.ok(), `share with ${permission}`).toBe(true);
      }

      // ── The owner comments on block B from its row ──
      const ownerContext = await browser.newContext();
      contexts.push(ownerContext);
      const ownerPage = await ownerContext.newPage();
      await loginPageWithCookies(ownerPage, owner.email, owner.password);
      await ownerPage.goto(`/page/${slug}`);
      const rowB = ownerPage.locator('[data-block-row="blk-b"]');
      await expect(rowB).toBeVisible();
      await expect(ownerPage.getByTestId('open-thread-count')).toHaveText('열린 토론 0');
      await expect(rowB.getByTestId('block-comment-marker')).toHaveCount(0);

      // The button is reachable from the keyboard and shows when it has focus.
      const commentButton = rowB.getByTestId('block-comment-button');
      await commentButton.focus();
      await expect(commentButton).toBeFocused();
      await expect(commentButton).toHaveAccessibleName('댓글');
      await commentButton.press('Enter');
      const panel = ownerPage.getByTestId('comments-panel');
      await expect(panel).toBeFocused();
      await expect(ownerPage.getByTestId('comment-block-select')).toHaveValue('blk-b');

      await ownerPage.getByTestId('comment-input').fill('Is this still right?');
      const posted = ownerPage.waitForResponse(apiResponse(pageId, 'comments', 'POST', 201));
      await ownerPage.getByRole('button', { name: 'Post Comment' }).click();
      const stored = await (await posted).json();
      expect(stored.blockId).toBe('blk-b');
      expect(stored.blockExcerpt).toBe('Beta text');

      // A page-level thread beside it.
      await ownerPage.getByTestId('comment-block-select').selectOption('');
      await ownerPage.getByTestId('comment-input').fill('General note');
      const postedPage = ownerPage.waitForResponse(apiResponse(pageId, 'comments', 'POST', 201));
      await ownerPage.getByRole('button', { name: 'Post Comment' }).click();
      expect((await (await postedPage).json()).blockId).toBeNull();

      // ── Marker with the count, header count ──
      const marker = rowB.getByTestId('block-comment-marker');
      await expect(marker).toHaveText('1');
      await expect(marker).toHaveAccessibleName('열린 토론 1개');
      await expect(ownerPage.getByTestId('open-thread-count')).toHaveText('열린 토론 2');
      await expect(ownerPage.getByTestId('thread-filter-open')).toHaveText('열린 토론 (2)');
      await shot(ownerPage, 'owner-threads-desktop');

      // Activating the marker lists only that block's threads.
      await ownerPage.getByRole('heading', { name: /^Comments/ }).scrollIntoViewIfNeeded();
      await marker.click();
      await expect(ownerPage.getByTestId('block-filter')).toContainText('Beta text');
      await expect(ownerPage.getByTestId('thread-anchor')).toHaveText('Beta text');
      await expect(ownerPage.getByText('General note')).toHaveCount(0);
      await expect(ownerPage.getByText('Is this still right?')).toBeVisible();
      await ownerPage.getByRole('button', { name: '모두 보기' }).click();
      await expect(ownerPage.getByText('General note')).toBeVisible();

      // ── Resolve: the thread moves to "해결됨", the marker goes, the counts update ──
      const thread = ownerPage
        .getByTestId('comment-item')
        .filter({ hasText: 'Is this still right?' });
      const resolved = ownerPage.waitForResponse(commentRoute('resolve', 200));
      await thread.getByTestId('resolve-thread').click();
      expect((await (await resolved).json()).resolvedAt).not.toBeNull();
      await expect(ownerPage.getByText('Is this still right?')).toHaveCount(0);
      await expect(ownerPage.getByTestId('thread-filter-open')).toHaveText('열린 토론 (1)');
      await expect(ownerPage.getByTestId('thread-filter-resolved')).toHaveText('해결됨 (1)');
      await expect(ownerPage.getByTestId('open-thread-count')).toHaveText('열린 토론 1');
      await expect(rowB.getByTestId('block-comment-marker')).toHaveCount(0);

      await ownerPage.getByTestId('thread-filter-resolved').click();
      const resolvedThread = ownerPage.getByTestId('comment-item').first();
      await expect(resolvedThread.getByTestId('thread-resolved')).toContainText('님이');
      await expect(resolvedThread.getByTestId('thread-resolved')).toContainText('해결함');
      // A resolved thread is collapsed: its text shows only once it is expanded.
      await expect(ownerPage.getByText('Is this still right?')).toHaveCount(0);
      await resolvedThread.getByRole('button', { name: '펼치기' }).click();
      await expect(ownerPage.getByText('Is this still right?')).toBeVisible();
      await shot(ownerPage, 'owner-resolved-desktop');

      // ── A viewer sees the thread, and no action ──
      const viewerContext = await browser.newContext();
      contexts.push(viewerContext);
      const viewerPage = await viewerContext.newPage();
      await loginPageWithCookies(viewerPage, v.email, v.password);
      await viewerPage.goto(`/page/${slug}`);
      await expect(viewerPage.getByTestId('comments-panel')).toBeVisible();
      await expect(viewerPage.getByTestId('open-thread-count')).toHaveText('열린 토론 1');
      await expect(viewerPage.getByText('General note')).toBeVisible();
      await expect(viewerPage.getByTestId('resolve-thread')).toHaveCount(0);
      await expect(viewerPage.getByTestId('comment-block-select')).toHaveCount(0);
      await viewerPage.getByTestId('thread-filter-resolved').click();
      await expect(viewerPage.getByTestId('thread-anchor')).toHaveText('Beta text');
      await expect(viewerPage.getByTestId('thread-resolved')).toContainText('해결함');
      await expect(viewerPage.getByTestId('reopen-thread')).toHaveCount(0);
      // The server refuses it as well.
      const viewerReopen = await v.ctx.post(`/api/comments/${stored.id}/reopen`);
      expect(viewerReopen.status()).toBe(403);

      // ── Reopen brings the marker back ──
      const reopened = ownerPage.waitForResponse(commentRoute('reopen', 200));
      await ownerPage.getByTestId('reopen-thread').click();
      expect((await (await reopened).json()).resolvedAt).toBeNull();
      await expect(rowB.getByTestId('block-comment-marker')).toHaveText('1');
      await expect(ownerPage.getByTestId('open-thread-count')).toHaveText('열린 토론 2');
      await expect(ownerPage.getByTestId('thread-filter-resolved')).toHaveText('해결됨 (0)');

      // ── A reader who may only comment: block comment from the panel, then resolve ──
      const readerContext = await browser.newContext();
      contexts.push(readerContext);
      const readerPage = await readerContext.newPage();
      await loginPageWithCookies(readerPage, c.email, c.password);
      await readerPage.goto(`/page/${slug}`);
      await expect(readerPage.locator('[data-block-row]')).toHaveCount(0);
      const select = readerPage.getByTestId('comment-block-select');
      await expect(select).toBeVisible();
      await select.selectOption('blk-c');
      await readerPage.getByTestId('comment-input').fill('Gamma needs a source');
      const readerPosted = readerPage.waitForResponse(apiResponse(pageId, 'comments', 'POST', 201));
      await readerPage.getByRole('button', { name: 'Post Comment' }).click();
      const readerComment = await (await readerPosted).json();
      expect(readerComment.blockId).toBe('blk-c');
      expect(readerComment.blockExcerpt).toBe('Gamma text');
      const readerThread = readerPage
        .getByTestId('comment-item')
        .filter({ hasText: 'Gamma needs a source' });
      await expect(readerThread.getByTestId('thread-anchor')).toHaveText('Gamma text');
      await shot(readerPage, 'reader-threads');
      const readerResolved = readerPage.waitForResponse(commentRoute('resolve', 200));
      await readerThread.getByTestId('resolve-thread').click();
      await readerResolved;
      await expect(readerPage.getByText('Gamma needs a source')).toHaveCount(0);

      // ── The owner removes block C in the editor: the thread says its block is gone ──
      await ownerPage.reload();
      const rowC = ownerPage.locator('[data-block-row="blk-c"]');
      await expect(rowC).toBeVisible();
      const textareaC = rowC.locator('textarea');
      await textareaC.click();
      await textareaC.press('ControlOrMeta+a');
      await textareaC.press('Backspace');
      await expect(textareaC).toHaveValue('');
      const saved = ownerPage.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === `/api/pages/${pageId}/autosave` &&
          res.status() === 200 &&
          !(res.request().postData() ?? '').includes('blk-c')
      );
      await textareaC.press('Backspace');
      await expect(rowC).toHaveCount(0);
      await saved;

      await readerPage.reload();
      await readerPage.getByTestId('thread-filter-all').click();
      // The anchors of both block threads, in the order they were made: B's block is there, C's is gone.
      await expect(readerPage.getByTestId('thread-anchor')).toHaveText([
        'Beta text',
        '원래 블록이 삭제되었습니다',
      ]);
      await shot(readerPage, 'reader-deleted-block');
    } finally {
      for (const context of contexts) await context.close();
      await owner.ctx.dispose();
      await c.ctx.dispose();
      await v.ctx.dispose();
    }
  });
});
