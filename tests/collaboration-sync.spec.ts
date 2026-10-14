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
    await page.goto(`/edit/${pageId}`);
    await expect(page.getByRole('heading', { name: 'Edit Page' })).toBeVisible();
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

  const saved = a.page.waitForResponse(
    (r) => r.url().includes(`/api/pages/${pageId}`) && r.request().method() === 'PUT'
  );
  await a.page.getByRole('button', { name: 'Update Page' }).click();
  expect((await saved).status()).toBe(200);
  const stored = await (await api.get(`/api/pages/${pageId}`)).json();
  expect(stored.content).toBe(`from B ${stamp}`);

  await a.context.close();
  await b.context.close();
  await api.delete(`/api/pages/${pageId}`).catch(() => {});
  await api.dispose();
});
