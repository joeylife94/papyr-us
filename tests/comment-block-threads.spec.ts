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
  test('a page saved with content only offers its seeded blocks, a block added just now can be commented on, and a link to a resolved thread opens it', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const stamp = Date.now().toString(36);
    const owner = await signedIn(`bsown${stamp}`);
    const c = await signedIn(`bsc${stamp}`);
    const contexts = [];

    try {
      const slug = `bs-page-${stamp}`;
      // Saved with content only: no stored blocks, so the editor shows blocks seeded from the text.
      const created = await owner.ctx.post('/api/pages', {
        data: {
          title: `Seeded ${stamp}`,
          slug,
          content: 'Seeded alpha\n\nSeeded beta',
          folder: 'bt',
          tags: [],
        },
      });
      expect(created.status()).toBe(201);
      const pageId: number = (await created.json()).id;
      const shared = await owner.ctx.post(`/api/pages/${pageId}/permissions`, {
        data: { entityType: 'user', entityId: c.id, permission: 'commenter' },
      });
      expect(shared.ok()).toBe(true);

      // ── A reader who may comment gets the seeded blocks in the picker and can anchor to one ──
      const readerContext = await browser.newContext();
      contexts.push(readerContext);
      const readerPage = await readerContext.newPage();
      await loginPageWithCookies(readerPage, c.email, c.password);
      await readerPage.goto(`/page/${slug}`);
      const select = readerPage.getByTestId('comment-block-select');
      await expect(select.locator('option')).toHaveText([
        '문서 전체',
        'Seeded alpha',
        'Seeded beta',
      ]);
      await select.selectOption({ label: 'Seeded beta' });
      await readerPage.getByTestId('comment-input').fill('About the seeded beta');
      const readerPosted = readerPage.waitForResponse(apiResponse(pageId, 'comments', 'POST', 201));
      await readerPage.getByRole('button', { name: 'Post Comment' }).click();
      const readerComment = await (await readerPosted).json();
      expect(readerComment.blockId).toBe(`block_seed_${pageId}_1`);
      expect(readerComment.blockExcerpt).toBe('Seeded beta');
      await expect(readerPage.getByTestId('thread-anchor')).toHaveText('Seeded beta');

      // ── The owner comments on a seeded row, and on a block added a moment ago ──
      const ownerContext = await browser.newContext();
      contexts.push(ownerContext);
      const ownerPage = await ownerContext.newPage();
      await loginPageWithCookies(ownerPage, owner.email, owner.password);
      await ownerPage.goto(`/page/${slug}`);
      const seededRow = ownerPage.locator(`[data-block-row="block_seed_${pageId}_0"]`);
      await expect(seededRow).toBeVisible();
      await expect(
        ownerPage
          .locator(`[data-block-row="block_seed_${pageId}_1"]`)
          .getByTestId('block-comment-marker')
      ).toHaveText('1');
      await seededRow.getByTestId('block-comment-button').click();
      await ownerPage.getByTestId('comment-input').fill('On the seeded alpha');
      const seededPosted = ownerPage.waitForResponse(apiResponse(pageId, 'comments', 'POST', 201));
      await ownerPage.getByRole('button', { name: 'Post Comment' }).click();
      expect((await (await seededPosted).json()).blockExcerpt).toBe('Seeded alpha');

      await ownerPage.getByRole('button', { name: '블록 추가', exact: true }).click();
      await ownerPage.getByRole('menuitem', { name: '단락' }).click();
      const rows = ownerPage.locator('[data-block-row]');
      await expect(rows).toHaveCount(3);
      const fresh = rows.nth(2);
      await fresh.locator('textarea').fill('Typed just now');
      // No wait for the autosave: posting the comment saves the pending edit first.
      await fresh.getByTestId('block-comment-button').click();
      await expect(ownerPage.getByTestId('block-filter')).toContainText('Typed just now');
      await ownerPage.getByTestId('comment-input').fill('About the new block');
      const freshPosted = ownerPage.waitForResponse(apiResponse(pageId, 'comments', 'POST', 201));
      await ownerPage.getByRole('button', { name: 'Post Comment' }).click();
      const freshComment = await (await freshPosted).json();
      expect(freshComment.blockExcerpt).toBe('Typed just now');
      await expect(fresh.getByTestId('block-comment-marker')).toHaveText('1');

      // ── A link to a comment of a resolved thread opens the tab that holds it ──
      const resolved = await c.ctx.post(`/api/comments/${readerComment.id}/resolve`);
      expect(resolved.status()).toBe(200);
      await readerPage.reload();
      await readerPage.goto(`/page/${slug}#comment-${readerComment.id}`);
      await expect(readerPage.getByTestId('thread-filter-resolved')).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(readerPage.getByText('About the seeded beta')).toBeVisible();
      // And a link to an open thread, followed from the resolved tab, switches back.
      await readerPage.reload();
      await readerPage.getByTestId('thread-filter-resolved').click();
      await readerPage.goto(`/page/${slug}#comment-${freshComment.id}`);
      await expect(readerPage.getByTestId('thread-filter-open')).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(readerPage.getByText('About the new block')).toBeVisible();
    } finally {
      for (const context of contexts) await context.close();
      await owner.ctx.dispose();
      await c.ctx.dispose();
    }
  });
  test("opening a block's threads on one page does not filter or anchor another page opened in the app", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const stamp = Date.now().toString(36);
    const owner = await signedIn(`bnav${stamp}`);
    const contexts = [];
    try {
      const make = async (slug: string, title: string, id: string, text: string) => {
        const created = await owner.ctx.post('/api/pages', {
          data: {
            title,
            slug,
            content: text,
            blocks: [block(id, text, 0)],
            folder: 'bn',
            tags: [],
          },
        });
        expect(created.status()).toBe(201);
        return (await created.json()).id as number;
      };
      const slugA = `bn-a-${stamp}`;
      const slugB = `bn-b-${stamp}`;
      const pageA = await make(slugA, `Nav A ${stamp}`, 'nav-a', 'Text on page A');
      const pageB = await make(slugB, `Nav B ${stamp}`, 'nav-b', 'Text on page B');
      const onA = await owner.ctx.post(`/api/pages/${pageA}/comments`, {
        data: { content: 'Thread on A', blockId: 'nav-a' },
      });
      expect(onA.status()).toBe(201);
      const onB = await owner.ctx.post(`/api/pages/${pageB}/comments`, {
        data: { content: 'Thread on B' },
      });
      expect(onB.status()).toBe(201);

      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await loginPageWithCookies(page, owner.email, owner.password);
      await page.goto(`/page/${slugA}`);
      await page.locator('[data-block-row="nav-a"]').getByTestId('block-comment-marker').click();
      await expect(page.getByTestId('block-filter')).toContainText('Text on page A');
      await expect(page.getByTestId('comment-block-select')).toHaveValue('nav-a');

      // Open page B from the sidebar, without a reload.
      await page.locator(`a[href="/page/${slugB}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`/page/${slugB}$`));
      await expect(page.getByText('Thread on B')).toBeVisible();
      await expect(page.getByTestId('block-filter')).toHaveCount(0);
      await expect(page.getByTestId('comment-block-select')).toHaveValue('');
      await page.getByTestId('comment-input').fill('Page level on B');
      const posted = page.waitForResponse(apiResponse(pageB, 'comments', 'POST', 201));
      await page.getByRole('button', { name: 'Post Comment' }).click();
      expect((await (await posted).json()).blockId).toBeNull();
    } finally {
      for (const context of contexts) await context.close();
      await owner.ctx.dispose();
    }
  });
});
