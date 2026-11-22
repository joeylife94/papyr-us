/**
 * Toggle blocks and indentation (WP11), end to end against the real server and PostgreSQL.
 * Every account and page is made by the spec; it can run twice against the same database.
 *
 * - A toggle is made from the slash menu; Enter in its summary adds the first nested block, Enter
 *   in a nested block adds a sibling, Shift+Tab leaves the toggle; collapsing hides the nested
 *   blocks, the collapsed state survives a reload in that tab and is not the page's: a second
 *   browser context of the same account sees the toggle open and the stored blocks carry no
 *   collapse state;
 * - Tab and Shift+Tab indent and outdent list items and to-dos together with the blocks nested
 *   under them, numbered lists number per level, an indent that is not allowed changes nothing;
 * - Alt+Down and the drag handle's keyboard mode move a toggle together with the blocks nested
 *   under it;
 * - a reader (viewer grant) sees the toggle, opens and closes it, and cannot edit; the stored page
 *   a save with an inconsistent tree produced is normalised.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const SHOTS = process.env.WP11_SHOTS_DIR;

const waitForAutosave = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/pages/${pageId}/autosave` &&
      response.request().method() === 'PUT' &&
      response.ok()
  );

const block = (
  stamp: number,
  id: string,
  type: string,
  content: string,
  extra: Record<string, unknown> = {}
) => ({
  id: `block_${id}_${stamp}`,
  type,
  content,
  properties: type === 'checkbox' ? { checked: false } : {},
  order: 0,
  children: [],
  ...extra,
});

async function createPage(api: APIRequestContext, stamp: number, slug: string, blocks: any[]) {
  const created = await api.post('/api/pages', {
    data: {
      title: `Nesting ${slug}`,
      slug,
      content: blocks.map((b) => b.content).join('\n\n'),
      blocks: blocks.map((b, order) => ({ ...b, order })),
      folder: 'docs',
      author: 'u',
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id as number;
  // A page made through the API keeps the content it was sent; an autosave derives the Markdown
  // content from the blocks, as the editor's saves do, and that is what readers see.
  const derived = await api.put(`/api/pages/${id}/autosave`, {
    data: { blocks: blocks.map((b, order) => ({ ...b, order })) },
  });
  expect(derived.status()).toBe(200);
  return id;
}

/** Each row's text, depth and type, as the editor shows them. */
const rowsOf = (page: Page) =>
  page.locator('[data-page-body] [data-block-row]').evaluateAll((rows) =>
    rows.map((row) => ({
      text: (row.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? '',
      indent: Number(row.getAttribute('data-block-indent')),
      type: row.getAttribute('data-block-type'),
    }))
  );

const shape = (rows: Array<{ text: string; indent: number }>) =>
  rows.map((row) => `${row.indent}:${row.text}`);

const storedShape = async (api: APIRequestContext, pageId: number) =>
  ((await (await api.get(`/api/pages/${pageId}`)).json()).blocks as any[]).map(
    (b) => `${b.indent ?? 0}:${b.content}`
  );

const rowIndent = (rows: ReturnType<Page['locator']>, i: number) =>
  rows.nth(i).getAttribute('data-block-indent');

const openEditor = async (page: Page, slug: string) => {
  await page.goto(`/page/${slug}`);
  await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
};

test.describe('toggle blocks and indentation', () => {
  test('a toggle made from the slash menu holds nested blocks, collapses per viewer and survives a reload', async ({
    page,
    browser,
    request,
  }) => {
    const user = await registerTestUser(request, 'toggle');
    const api = await createAuthenticatedApiContext(user.email, user.password);
    const stamp = Date.now();
    const slug = `toggle-${stamp}`;
    const pageId = await createPage(api, stamp, slug, [block(stamp, 'first', 'paragraph', '')]);
    try {
      await loginPageWithCookies(page, user.email, user.password);
      await openEditor(page, slug);
      const rows = page.locator('[data-page-body] [data-block-row]');
      await expect(rows).toHaveCount(1);

      // Slash menu: "/toggle" turns the empty block into a toggle with a disclosure triangle.
      await rows.first().locator('textarea').click();
      await page.keyboard.type('/toggle');
      await page.keyboard.press('Enter');
      await expect(rows.first()).toHaveAttribute('data-block-type', 'toggle');
      const disclosure = rows.first().getByTestId('toggle-disclosure');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      // The button is named by the summary once there is one.
      await page.keyboard.type('Summary line');
      await expect(disclosure).toHaveAttribute('aria-label', 'Summary line 접기');

      // Enter in the summary adds the first nested block, Enter in that one a sibling, and
      // Shift+Tab on a third leaves the toggle.
      await page.keyboard.press('Enter');
      await expect(rows).toHaveCount(2);
      await page.keyboard.type('child one');
      await page.keyboard.press('Enter');
      await page.keyboard.type('child two');
      await page.keyboard.press('Enter');
      await page.keyboard.type('after the toggle');
      await page.keyboard.press('Shift+Tab');
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:Summary line', '1:child one', '1:child two', '0:after the toggle']);

      // The nesting is stored: indent and the recomputed parentId; nothing about collapsing.
      await expect
        .poll(async () => storedShape(api, pageId), { timeout: 30_000 })
        .toEqual(['0:Summary line', '1:child one', '1:child two', '0:after the toggle']);
      const stored = (await (await api.get(`/api/pages/${pageId}`)).json()).blocks as any[];
      expect(stored[1].parentId).toBe(stored[0].id);
      expect(stored[2].parentId).toBe(stored[0].id);
      expect(stored[3].parentId).toBeUndefined();
      expect(stored[3].indent).toBeUndefined();
      expect(JSON.stringify(stored)).not.toMatch(/collapsed|open/i);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/toggle-open-desktop.png` });

      // Collapse: the nested blocks are hidden, the block after the toggle is still there.
      await disclosure.click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:Summary line', '0:after the toggle']);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/toggle-collapsed-desktop.png` });

      // A reload keeps the structure and this tab's collapsed state.
      await page.reload();
      await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:Summary line', '0:after the toggle']);
      await expect(rows.first().getByTestId('toggle-disclosure')).toHaveAttribute(
        'aria-expanded',
        'false'
      );

      // The collapsed state is the viewer's own: another browser context of the same account
      // sees the toggle open.
      const other = await browser.newContext();
      try {
        const otherPage = await other.newPage();
        await loginPageWithCookies(otherPage, user.email, user.password);
        await openEditor(otherPage, slug);
        await expect
          .poll(async () => shape(await rowsOf(otherPage)))
          .toEqual(['0:Summary line', '1:child one', '1:child two', '0:after the toggle']);
      } finally {
        await other.close();
      }

      // Open again: the nested blocks come back.
      await rows.first().getByTestId('toggle-disclosure').click();
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:Summary line', '1:child one', '1:child two', '0:after the toggle']);

      if (SHOTS) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: `${SHOTS}/toggle-open-390.png` });
        await page.setViewportSize({ width: 1280, height: 720 });
      }

      // Enter at the summary of a collapsed toggle adds a block after the toggle's blocks.
      await rows.first().getByTestId('toggle-disclosure').click();
      await rows.first().locator('textarea').click();
      const saved = waitForAutosave(page, pageId);
      await page.keyboard.press('Enter');
      await page.keyboard.type('sibling');
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:Summary line', '0:sibling', '0:after the toggle']);
      await saved;
      expect(await storedShape(api, pageId)).toEqual([
        '0:Summary line',
        '1:child one',
        '1:child two',
        '0:sibling',
        '0:after the toggle',
      ]);
    } finally {
      await api.delete(`/api/pages/${pageId}`).catch(() => {});
      await api.dispose();
    }
  });

  test('Tab and Shift+Tab indent list items and to-dos with the blocks nested under them', async ({
    page,
    request,
  }) => {
    const user = await registerTestUser(request, 'indent');
    const api = await createAuthenticatedApiContext(user.email, user.password);
    const stamp = Date.now();
    const slug = `indent-${stamp}`;
    const pageId = await createPage(api, stamp, slug, [
      block(stamp, 'a', 'bulleted_list', 'A'),
      block(stamp, 'b', 'bulleted_list', 'B'),
      block(stamp, 'c', 'bulleted_list', 'C'),
      block(stamp, 'd', 'checkbox', 'D'),
      block(stamp, 'e', 'numbered_list', 'E'),
      block(stamp, 'f', 'numbered_list', 'F'),
      block(stamp, 'g', 'code', 'code'),
    ]);
    try {
      await loginPageWithCookies(page, user.email, user.password);
      await openEditor(page, slug);
      const rows = page.locator('[data-page-body] [data-block-row]');
      await expect(rows).toHaveCount(7);
      const field = (i: number) => rows.nth(i).locator('textarea');
      const rowIndent = (i: number) => rows.nth(i).getAttribute('data-block-indent');

      // The first block cannot be indented: Tab then moves focus on, as it always did, and
      // changes nothing.
      await field(0).click();
      await page.keyboard.press('Tab');
      await expect(field(0)).not.toBeFocused();
      expect(await rowIndent(0)).toBe('0');

      // B indents under A; C indents twice (under B); D (to-do) follows.
      await field(1).click();
      await page.keyboard.press('Tab');
      await expect.poll(() => rowIndent(1)).toBe('1');
      await field(2).click();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect.poll(() => rowIndent(2)).toBe('2');
      // A third Tab is refused (a block goes one level deeper than the block before it, and C
      // already is): nothing changes and Tab moves focus on.
      await page.keyboard.press('Tab');
      expect(await rowIndent(2)).toBe('2');
      await expect(field(2)).not.toBeFocused();
      await field(3).click();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect.poll(() => rowIndent(3)).toBe('2');

      // Numbered lists number each level on its own: F nests under E and starts at 1.
      const marker = (i: number) => rows.nth(i).locator('[aria-hidden="true"]').first();
      await expect(marker(4)).toHaveText('1.');
      await expect(marker(5)).toHaveText('2.');
      await field(5).click();
      await page.keyboard.press('Tab');
      await expect.poll(() => rowIndent(5)).toBe('1');
      await expect(marker(5)).toHaveText('1.');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/indent-desktop.png` });

      // Shift+Tab on B takes the blocks nested under it (C, D) along, keeping their relative depth.
      await field(1).click();
      await page.keyboard.press('Shift+Tab');
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:A', '0:B', '1:C', '1:D', '0:E', '1:F', '0:code']);

      // Tab on B again moves the same group back under A.
      const saved = waitForAutosave(page, pageId);
      await page.keyboard.press('Tab');
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:A', '1:B', '2:C', '2:D', '0:E', '1:F', '0:code']);
      await saved;
      await expect
        .poll(async () => storedShape(api, pageId), { timeout: 30_000 })
        .toEqual(['0:A', '1:B', '2:C', '2:D', '0:E', '1:F', '0:code']);

      // Ctrl+] and Ctrl+[ indent and outdent too (they work where Tab has to stay a way to move
      // on, such as from a block that shows page links).
      await field(4).click();
      await page.keyboard.press('Control+]');
      await expect.poll(() => rowIndent(4)).toBe('1');
      await page.keyboard.press('Control+[');
      await expect.poll(() => rowIndent(4)).toBe('0');

      // Code keeps Tab as text (two spaces in the code): the block does not indent.
      await field(6).click();
      const codeSaved = waitForAutosave(page, pageId);
      await page.keyboard.press('Tab');
      await expect.poll(async () => (await field(6).inputValue()).length).toBe(6);
      await codeSaved;
      expect(await rowIndent(6)).toBe('0');
      const codeText = await field(6).inputValue();

      // Reload: the same structure, with the nesting drawn as an offset.
      await page.reload();
      await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:A', '1:B', '2:C', '2:D', '0:E', '1:F', `0:${codeText}`]);
      const left = (i: number) =>
        rows
          .nth(i)
          .locator('textarea')
          .evaluate((el) => el.getBoundingClientRect().left);
      expect(await left(2)).toBeGreaterThan(await left(1));
      expect(await left(1)).toBeGreaterThan(await left(0));
    } finally {
      await api.delete(`/api/pages/${pageId}`).catch(() => {});
      await api.dispose();
    }
  });

  test('Alt+arrows and the drag handle move a toggle together with its nested blocks', async ({
    page,
    request,
  }) => {
    const user = await registerTestUser(request, 'move');
    const api = await createAuthenticatedApiContext(user.email, user.password);
    const stamp = Date.now();
    const slug = `move-${stamp}`;
    const pageId = await createPage(api, stamp, slug, [
      block(stamp, 't', 'toggle', 'T'),
      block(stamp, 'c1', 'paragraph', 'c1', { indent: 1 }),
      block(stamp, 'c2', 'paragraph', 'c2', { indent: 1 }),
      block(stamp, 'p', 'paragraph', 'P'),
      block(stamp, 'q', 'paragraph', 'Q'),
    ]);
    try {
      await loginPageWithCookies(page, user.email, user.password);
      await openEditor(page, slug);
      const rows = page.locator('[data-page-body] [data-block-row]');
      await expect(rows).toHaveCount(5);

      // Alt+Down on the toggle takes c1 and c2 with it, below P.
      let saved = waitForAutosave(page, pageId);
      await rows.first().locator('textarea').click();
      await page.keyboard.press('Alt+ArrowDown');
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:P', '0:T', '1:c1', '1:c2', '0:Q']);
      await expect(rows.nth(1).locator('textarea')).toBeFocused();
      await saved;

      // Alt+Up on Q goes above the toggle, which keeps its nested blocks.
      await rows.nth(4).locator('textarea').click();
      saved = waitForAutosave(page, pageId);
      await page.keyboard.press('Alt+ArrowUp');
      await expect
        .poll(async () => shape(await rowsOf(page)))
        .toEqual(['0:P', '0:Q', '0:T', '1:c1', '1:c2']);
      await saved;

      // Collapse the toggle; its drag handle (keyboard mode) moves it above P with c1 and c2.
      await rows.nth(2).getByTestId('toggle-disclosure').click();
      await expect.poll(async () => shape(await rowsOf(page))).toEqual(['0:P', '0:Q', '0:T']);
      saved = waitForAutosave(page, pageId);
      await rows.nth(2).getByTestId('block-drag-handle').focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Space');
      await expect.poll(async () => shape(await rowsOf(page))).toEqual(['0:T', '0:P', '0:Q']);
      await saved;
      await expect
        .poll(async () => storedShape(api, pageId), { timeout: 30_000 })
        .toEqual(['0:T', '1:c1', '1:c2', '0:P', '0:Q']);

      // The tree the server stores is consistent: the moved blocks hang under the toggle.
      const stored = (await (await api.get(`/api/pages/${pageId}`)).json()).blocks as any[];
      expect(stored[1].parentId).toBe(stored[0].id);
      expect(stored[2].parentId).toBe(stored[0].id);
    } finally {
      await api.delete(`/api/pages/${pageId}`).catch(() => {});
      await api.dispose();
    }
  });

  test('the keyboard can always leave the editor body; Escape turns Tab into a way out, and the keys are announced', async ({
    page,
    request,
  }) => {
    const user = await registerTestUser(request, 'keys');
    const api = await createAuthenticatedApiContext(user.email, user.password);
    const stamp = Date.now();
    const slug = `keys-${stamp}`;
    const pageId = await createPage(api, stamp, slug, [
      block(stamp, 'a', 'paragraph', 'A'),
      block(stamp, 'b', 'bulleted_list', 'B'),
      block(stamp, 'c', 'paragraph', 'C'),
    ]);
    try {
      await loginPageWithCookies(page, user.email, user.password);
      await openEditor(page, slug);
      const rows = page.locator('[data-page-body] [data-block-row]');
      await expect(rows).toHaveCount(3);
      const field = (i: number) => rows.nth(i).locator('textarea');
      const insideBody = () =>
        page.evaluate(() =>
          document.querySelector('[data-page-body]')!.contains(document.activeElement)
        );
      const status = page.locator('[data-page-body] [role="status"]');

      // Text blocks name their keys for assistive technology.
      const hintId = await field(0).getAttribute('aria-describedby');
      await expect(page.locator(`[id="${hintId}"]`)).toContainText('Esc 다음 Tab');

      // Backwards: Shift+Tab at level 0 changes nothing and moves focus on.
      await field(1).click();
      await page.keyboard.press('Shift+Tab');
      await expect(field(1)).not.toBeFocused();
      expect(await rowIndent(rows, 1)).toBe('0');

      // Forwards: Tab on a block that can be indented indents it ...
      await field(1).click();
      await page.keyboard.press('Tab');
      await expect.poll(() => rowIndent(rows, 1)).toBe('1');
      await page.keyboard.press('Shift+Tab');
      await expect.poll(() => rowIndent(rows, 1)).toBe('0');

      // ... and after Escape, Tab moves focus instead, announced, until something is typed.
      await field(2).click();
      await page.keyboard.press('Escape');
      await expect(status).toHaveText('Tab이 다음 요소로 이동합니다');
      for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
      expect(await insideBody()).toBe(false);
      expect(await rowsOf(page).then(shape)).toEqual(['0:A', '0:B', '0:C']);

      // Typing ends the mode: Tab indents again.
      await field(1).click();
      await page.keyboard.press('Escape');
      await page.keyboard.type('!');
      await page.keyboard.press('Tab');
      await expect.poll(() => rowIndent(rows, 1)).toBe('1');
      await expect.poll(async () => shape(await rowsOf(page))).toEqual(['0:A', '1:B!', '0:C']);
      // The level change was announced, and so was the refusal and the move.
      await expect(status).toHaveText('들여쓰기 수준: 1단계');
      await page.keyboard.press('Control+[');
      await page.keyboard.press('Control+[');
      await expect(status).toHaveText('더 내어쓸 수 없습니다');
      const saved = waitForAutosave(page, pageId);
      await page.keyboard.press('Alt+ArrowDown');
      await expect(status).toHaveText('블록을 3번째 위치로 옮겼습니다 (3개 중)');
      await saved;
    } finally {
      await api.delete(`/api/pages/${pageId}`).catch(() => {});
      await api.dispose();
    }
  });

  test('a reader opens and closes a toggle and cannot edit; an inconsistent tree is stored normalised', async ({
    page,
    browser,
    request,
  }) => {
    const owner = await registerTestUser(request, 'owner');
    const reader = await registerTestUser(request, 'reader');
    const api = await createAuthenticatedApiContext(owner.email, owner.password);
    const readerApi = await createAuthenticatedApiContext(reader.email, reader.password);
    let richPageId: number | null = null;
    const readerId = Number((await (await readerApi.get('/api/auth/me')).json()).id);
    const stamp = Date.now();
    const slug = `reader-toggle-${stamp}`;
    // The tree the client sends is inconsistent: too deep, a parent that does not exist.
    const pageId = await createPage(api, stamp, slug, [
      block(stamp, 't', 'toggle', 'Question <b>one</b>'),
      block(stamp, 'a', 'paragraph', 'Answer text', { indent: 5, parentId: 'ghost' }),
      block(stamp, 'l', 'bulleted_list', 'point', { indent: 2 }),
      block(stamp, 'z', 'paragraph', 'Outside', { parentId: 'ghost' }),
    ]);
    try {
      const stored = (await (await api.get(`/api/pages/${pageId}`)).json()).blocks as any[];
      expect(stored.map((b) => [b.indent ?? 0, b.parentId ?? null])).toEqual([
        [0, null],
        [1, stored[0].id],
        [2, stored[1].id],
        [0, null],
      ]);

      const granted = await api.post(`/api/pages/${pageId}/permissions`, {
        data: { entityType: 'user', entityId: readerId, permission: 'viewer' },
      });
      expect(granted.status()).toBe(201);

      const context = await browser.newContext();
      try {
        const readerPage = await context.newPage();
        await loginPageWithCookies(readerPage, reader.email, reader.password);
        await readerPage.goto(`/page/${slug}`);
        await expect(readerPage.getByTestId('page-title')).toHaveAttribute(
          'contenteditable',
          'false'
        );
        const details = readerPage.locator('[data-markdown-root] details');
        await expect(details).toHaveCount(1);
        const summary = details.locator('> summary');
        // The summary is text: its markup is shown, not run.
        await expect(summary).toHaveText('Question <b>one</b>');
        await expect(details.locator('b')).toHaveCount(0);
        await expect(details).toHaveJSProperty('open', true);
        await expect(details.getByText('Answer text')).toBeVisible();
        if (SHOTS) await readerPage.screenshot({ path: `${SHOTS}/reader-open-desktop.png` });

        if (SHOTS) {
          await readerPage.setViewportSize({ width: 390, height: 844 });
          await readerPage.screenshot({ path: `${SHOTS}/reader-open-390.png` });
          await readerPage.setViewportSize({ width: 1280, height: 720 });
        }
        await summary.click();
        await expect(details).toHaveJSProperty('open', false);
        await expect(details.getByText('Answer text')).toBeHidden();
        await expect(readerPage.getByText('Outside')).toBeVisible();
        await summary.click();
        await expect(details).toHaveJSProperty('open', true);
        await expect(details.getByText('Answer text')).toBeVisible();

        // A multi-line, formatted summary: the first line is the summary (inline Markdown), the
        // rest a paragraph inside the toggle; the editor shows the text as typed.
        const richSlug = `${slug}-rich`;
        const richId = await createPage(api, stamp, richSlug, [
          block(
            stamp,
            'rt',
            'toggle',
            '**Bold** summary with `code` and [a link](https://example.com)\nsecond line, _italic_'
          ),
          block(stamp, 'rc', 'paragraph', 'nested child', { indent: 1 }),
        ]);
        richPageId = richId;
        expect(
          (
            await api.post(`/api/pages/${richId}/permissions`, {
              data: { entityType: 'user', entityId: readerId, permission: 'viewer' },
            })
          ).status()
        ).toBe(201);
        await readerPage.goto(`/page/${richSlug}`);
        const richDetails = readerPage.locator('[data-markdown-root] details');
        await expect(richDetails.locator('> summary strong')).toHaveText('Bold');
        await expect(richDetails.locator('> summary code')).toHaveText('code');
        await expect(richDetails.locator('> summary a')).toHaveText('a link');
        await expect(richDetails.locator('> p').first()).toHaveText('second line, italic');
        await expect(richDetails.getByText('nested child')).toBeVisible();
        if (SHOTS) {
          await readerPage.screenshot({ path: `${SHOTS}/rich-summary-reader-desktop.png` });
          await loginPageWithCookies(page, owner.email, owner.password);
          await page.goto(`/page/${richSlug}`);
          await page.locator('[data-page-body] textarea').first().waitFor();
          await page.screenshot({ path: `${SHOTS}/rich-summary-editor-desktop.png` });
        }

        // Nothing to edit: no text fields in the page body, and a save is refused.
        await expect(readerPage.locator('[data-page-body] textarea')).toHaveCount(0);
        const refused = await readerApi.put(`/api/pages/${pageId}/autosave`, {
          data: { blocks: [] },
        });
        expect(refused.status()).toBe(403);
      } finally {
        await context.close();
      }
    } finally {
      await api.delete(`/api/pages/${pageId}`).catch(() => {});
      if (richPageId) await api.delete(`/api/pages/${richPageId}`).catch(() => {});
      await api.dispose();
      await readerApi.dispose();
    }
  });
});
