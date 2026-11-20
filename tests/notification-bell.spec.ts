/**
 * The notification bell of a signed-in account (WP0a), in a browser against the real server.
 *
 * Notifications are addressed to accounts, so the bell needs no roster row: two freshly registered
 * accounts, A and B (neither has a roster row), and a third, C. A notifies B through the API; B's
 * bell shows the unread count and the item (the list response is `{ notifications, pagination }`
 * and the bell reads that shape), clicking the item marks it read (exactly one PATCH, and the
 * count is refetched and drops), and C, who was not addressed, sees the bell without a badge.
 * Everything is made by the spec; it can run twice against the same database.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const readRequests = (page: Page) => {
  const seen: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && /\/api\/notifications\/\d+\/read$/.test(req.url())) {
      seen.push(req.url());
    }
  });
  return seen;
};

test.describe('Notification bell', () => {
  test('an account without a roster row sees its notification, marks it read, and a third account sees none', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const title = `bell-${stamp}`;
    const userA = await registerTestUser(request, 'bell-a');
    const userB = await registerTestUser(request, 'bell-b');
    const userC = await registerTestUser(request, 'bell-c');
    const aApi = await createAuthenticatedApiContext(userA.email, userA.password);
    const bApi = await createAuthenticatedApiContext(userB.email, userB.password);
    const bId = Number((await (await bApi.get('/api/auth/me')).json()).id);

    const bContext = await browser.newContext();
    const cContext = await browser.newContext();
    try {
      const made = await aApi.post('/api/notifications', {
        data: { type: 'mention', title, content: 'A mentioned you', recipientUserId: bId },
      });
      expect(made.status()).toBe(201);
      // A second kind a person may send; the list shows both.
      const system = await aApi.post('/api/notifications', {
        data: {
          type: 'task_due',
          title: `${title}-system`,
          content: 'a task is due',
          recipientUserId: bId,
        },
      });
      expect(system.status()).toBe(201);

      // ── B ──
      const bPage = await bContext.newPage();
      const patches = readRequests(bPage);
      await loginPageWithCookies(bPage, userB.email, userB.password);
      await bPage.goto('/');
      const bell = bPage.getByTestId('notification-bell');
      await expect(bell).toBeVisible();
      await expect(bPage.getByTestId('notification-unread-badge')).toHaveText('2');

      await bell.click();
      const items = bPage.getByTestId('notification-item');
      await expect(items).toHaveCount(2);
      await expect(items.filter({ hasText: title }).first()).toBeVisible();
      await expect(bPage.getByText(`${title}-system`)).toBeVisible();

      const refetched = bPage.waitForResponse(
        (res) =>
          res.url().endsWith('/api/notifications/unread-count') &&
          res.request().method() === 'GET' &&
          patches.length === 1
      );
      await bPage.getByText('A mentioned you').click();
      await refetched;
      await expect(bPage.getByTestId('notification-unread-badge')).toHaveText('1');
      expect(patches).toHaveLength(1);
      expect(Number((await (await bApi.get('/api/notifications/unread-count')).json()).count)).toBe(
        1
      );

      // ── C, who was not addressed ──
      const cPage = await cContext.newPage();
      await loginPageWithCookies(cPage, userC.email, userC.password);
      // The screen is only evidence once the server has answered: wait for both responses and
      // check what they say before looking at the screen.
      const answered = (path: string) =>
        cPage.waitForResponse(
          (res) => new URL(res.url()).pathname === path && res.request().method() === 'GET'
        );
      const countAnswer = answered('/api/notifications/unread-count');
      const listAnswer = answered('/api/notifications');
      await cPage.goto('/');
      const countBody = await (await countAnswer).json();
      const listBody = await (await listAnswer).json();
      expect(Number(countBody.count)).toBe(0);
      expect(listBody.notifications).toEqual([]);
      await expect(cPage.getByTestId('notification-bell')).toBeVisible();
      await expect(cPage.getByTestId('notification-unread-badge')).toHaveCount(0);
      await cPage.getByTestId('notification-bell').click();
      await expect(cPage.getByTestId('notification-item')).toHaveCount(0);
    } finally {
      await bContext.close();
      await cContext.close();
      await aApi.dispose();
      await bApi.dispose();
    }
  });
});
