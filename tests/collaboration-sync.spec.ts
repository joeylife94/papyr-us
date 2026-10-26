import { test, expect, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Realtime (Yjs) collaboration is feature-flagged off by default. Run this spec against a
// server started with FEATURE_COLLABORATION=true; otherwise it is skipped.
test('two editors share edits in real time and the save keeps them', async ({
  browser,
  request,
}) => {
  const flags = await (await request.get('/api/features')).json();
  test.skip(!flags.FEATURE_COLLABORATION, 'FEATURE_COLLABORATION is disabled on this server');

  const user = await registerTestUser(request, 'collab');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const slug = `collab-${stamp}`;
  // No stored blocks: the server seeds the shared document from the page content.
  const created = await api.post('/api/pages', {
    data: {
      title: `Collab ${stamp}`,
      slug,
      content: 'seed',
      folder: 'docs',
      author: 'u',
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const pageId = (await created.json()).id;

  const openEditor = async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const yjsLogs: string[] = [];
    page.on('console', (message) => {
      if (message.text().startsWith('[Yjs]')) yjsLogs.push(message.text());
    });
    await loginPageWithCookies(page, user.email, user.password);
    // In-place editing (#103 E2): the page view is the collaborative editor.
    await page.goto(`/page/${slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect
      .poll(() => yjsLogs.some((log) => log.startsWith('[Yjs] Document initialized')))
      .toBe(true);
    return { context, page, yjsLogs };
  };
  const textarea = (page: Page) => page.locator('textarea').first();

  const a = await openEditor();
  const b = await openEditor();
  await expect(textarea(a.page)).toHaveValue('seed');
  await expect(textarea(b.page)).toHaveValue('seed');

  // The connection stays up while idle (no reconnect churn).
  const connectsBefore = a.yjsLogs.filter((log) => log.startsWith('[Yjs] Connected')).length;
  await a.page.waitForTimeout(2000);
  expect(a.yjsLogs.filter((log) => log.startsWith('[Yjs] Connected')).length).toBe(connectsBefore);

  await textarea(a.page).fill(`from A ${stamp}`);
  await expect(textarea(b.page)).toHaveValue(`from A ${stamp}`);
  await textarea(b.page).fill(`from B ${stamp}`);
  await expect(textarea(a.page)).toHaveValue(`from B ${stamp}`);

  // No save button: autosave (and the Yjs server's own saves) persist the merged text, and the
  // server derives `content` from the blocks.
  await expect
    .poll(async () => (await (await api.get(`/api/pages/${pageId}`)).json()).content, {
      timeout: 15_000,
    })
    .toBe(`from B ${stamp}`);

  // A block reorder (#103 E3) is one Yjs move, so both editors converge on the new order and
  // the stored content follows it.
  const order = (page: Page) =>
    page
      .locator('[data-page-body] [data-block-row] textarea')
      .evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
  await textarea(a.page).press('End');
  await textarea(a.page).press('Enter');
  const second = a.page.locator('[data-page-body] [data-block-row] textarea').nth(1);
  await expect(second).toBeFocused();
  await second.fill(`second ${stamp}`);
  await expect.poll(() => order(b.page)).toEqual([`from B ${stamp}`, `second ${stamp}`]);
  await second.press('Alt+ArrowUp');
  await expect.poll(() => order(a.page)).toEqual([`second ${stamp}`, `from B ${stamp}`]);
  await expect.poll(() => order(b.page)).toEqual([`second ${stamp}`, `from B ${stamp}`]);
  await expect
    .poll(async () => (await (await api.get(`/api/pages/${pageId}`)).json()).content, {
      timeout: 15_000,
    })
    .toBe(`second ${stamp}\n\nfrom B ${stamp}`);

  await a.context.close();
  await b.context.close();
  await api.delete(`/api/pages/${pageId}`).catch(() => {});
  await api.dispose();
});
