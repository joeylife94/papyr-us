/**
 * Notifications belong to the account they address and to the organization they were created in,
 * and cannot be created across organizations (WP0a, #124 X1b), end to end against the real server,
 * authentication, organizations and PostgreSQL. Synthetic accounts, a team and pages only; no
 * roster row is created anywhere. Route rules: server/tests/notifications-accounts-route.test.ts;
 * SQL rules: tests/integration-layer4/notifications-scope.test.ts; socket rules:
 * server/tests/realtime.notifications.socket.test.ts (no browser or socket client is used here).
 *
 * Accounts are `users` rows and are the only identity: a freshly registered account, which has no
 * roster row, receives a notification. The second organization is made through DATABASE_URL (as
 * tests/security-organizations.spec.ts does), and so is an account's deactivation and its move
 * between organizations.
 *
 * Rules under test:
 * - a notification is listed, counted, opened, changed, marked read and deleted only by the
 *   account it addresses, while that account belongs to the organization it was created in;
 *   anyone else gets nothing, and an id that is not theirs answers 404 like an unknown one;
 * - a notification can only be created for an active account of the caller's organization, from
 *   the caller (the server sets the sender and the organization), pointing at records the caller
 *   may read; a body that names a roster id, a sender or an organization is refused;
 * - who a notification is for, who sent it, its organization and what it points at cannot be
 *   edited;
 * - a notification stays in its organization: after its recipient moves to another one it is not
 *   listed or opened, and it is there again when the recipient returns (nothing is deleted);
 * - without a session: 401.
 *
 * Add to the `test:gj` list in package.json when integrating.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const DATABASE_URL = process.env.DATABASE_URL;

type Row = {
  id: number;
  title: string;
  recipientUserId: number;
  organizationId: number;
  senderUserId: number | null;
  isRead: boolean;
};
type Listed = { notifications: Row[] };

test.describe('Notifications follow the account and the organization', () => {
  test('lists, opens and writes only for the recipient; creation stays inside the organization', async ({
    request,
  }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to make a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const title = `secn-${stamp}`;

    const userA = await registerTestUser(request, 'secn-a');
    const userB = await registerTestUser(request, 'secn-b');
    const outsider = await registerTestUser(request, 'secn-outsider');
    const inactive = await registerTestUser(request, 'secn-inactive');
    const aCtx = await createAuthenticatedApiContext(userA.email, userA.password);
    const bCtx = await createAuthenticatedApiContext(userB.email, userB.password);
    const oCtx = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const contexts = [aCtx, bCtx, oCtx, anonymous];
    let bOriginalOrganization: number | null = null;
    let bUserId = 0;

    const idOf = async (ctx: APIRequestContext) =>
      Number((await (await ctx.get('/api/auth/me')).json()).id);
    const idByEmail = async (email: string) =>
      Number((await db.query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id);
    const organizationOf = async (userId: number) =>
      Number(
        (
          await db.query('SELECT organization_id FROM organization_members WHERE user_id = $1', [
            userId,
          ])
        ).rows[0].organization_id
      );
    const listed = async (ctx: APIRequestContext) => {
      const response = await ctx.get('/api/notifications?limit=100');
      expect(response.status()).toBe(200);
      return ((await response.json()) as Listed).notifications;
    };
    const unreadCount = async (ctx: APIRequestContext) =>
      Number((await (await ctx.get('/api/notifications/unread-count')).json()).count);
    const create = (ctx: APIRequestContext, data: Record<string, unknown>) =>
      ctx.post('/api/notifications', {
        data: { type: 'mention', title, content: 'synthetic', ...data },
      });

    try {
      // ── Arrange ──
      const aId = await idOf(aCtx);
      const bId = await idOf(bCtx);
      bUserId = bId;
      const oId = await idOf(oCtx);
      const inactiveId = await idByEmail(inactive.email);
      const defaultOrganization = await organizationOf(aId);
      expect(await organizationOf(bId)).toBe(defaultOrganization);
      bOriginalOrganization = defaultOrganization;
      const { rows: org } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [`secn-org-${stamp}`]
      );
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        org[0].id,
        oId,
      ]);
      await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [inactiveId]);
      // The reason for the change: B has no roster row and is still a recipient.
      const roster = await db.query(
        'SELECT count(*)::int AS n FROM members WHERE email = ANY($1)',
        [[userA.email, userB.email, outsider.email]]
      );
      expect(roster.rows[0].n).toBe(0);

      const teamResponse = await aCtx.post('/api/teams', {
        data: { name: `secn-team-${stamp}`, displayName: `secn team ${stamp}` },
      });
      expect(teamResponse.status()).toBe(201);
      const teamA = (await teamResponse.json()) as { id: number };
      const taskResponse = await aCtx.post('/api/tasks', {
        data: { title: `secn task ${stamp}`, teamId: String(teamA.id) },
      });
      expect(taskResponse.status()).toBe(201);
      const teamTask = (await taskResponse.json()) as { id: number };
      const pageResponse = await aCtx.post('/api/pages', {
        data: {
          title: `secn page ${stamp}`,
          slug: `secn-page-${stamp}`,
          content: 'synthetic',
          folder: `secn-${stamp}`,
          tags: [],
          author: userA.email,
          teamId: teamA.id,
        },
      });
      expect(pageResponse.status()).toBe(201);
      const teamPage = (await pageResponse.json()) as { id: number };
      const commentResponse = await aCtx.post(`/api/pages/${teamPage.id}/comments`, {
        data: { content: 'synthetic comment' },
      });
      expect(commentResponse.status()).toBe(201);
      const teamComment = (await commentResponse.json()) as { id: number };

      // ── 1. No session, nothing ──
      for (const path of [
        '/api/notifications',
        '/api/notifications/unread-count',
        '/api/notifications/1',
      ]) {
        expect((await anonymous.get(path)).status(), `anonymous GET ${path}`).toBe(401);
      }
      const anonymousPost = await anonymous.post('/api/notifications', {
        data: { type: 'mention', title, content: 'x', recipientUserId: bId },
      });
      expect(anonymousPost.status()).toBe(401);

      // ── 2. A notifies B, a fresh account with no roster row ──
      const made = await create(aCtx, { recipientUserId: bId });
      expect(made.status()).toBe(201);
      const notification = (await made.json()) as Row & { recipientId?: number };
      expect(notification).toMatchObject({
        recipientUserId: bId,
        senderUserId: aId,
        organizationId: defaultOrganization,
      });
      expect(notification, 'no roster field is answered').not.toHaveProperty('recipientId');

      expect((await listed(bCtx)).map((n) => n.id)).toContain(notification.id);
      expect(
        (await listed(aCtx)).map((n) => n.id),
        'sender is not the recipient'
      ).not.toContain(notification.id);
      expect(await unreadCount(bCtx)).toBeGreaterThanOrEqual(1);
      expect((await bCtx.get(`/api/notifications/${notification.id}`)).status()).toBe(200);

      // ── 3. The outsider (another organization) gets nothing ──
      expect((await listed(oCtx)).map((n) => n.id)).not.toContain(notification.id);
      expect(await unreadCount(oCtx)).toBe(0);
      const unknownId = 2_000_000_000;
      const unknownBody = await (await oCtx.get(`/api/notifications/${unknownId}`)).text();
      for (const call of [
        () => oCtx.get(`/api/notifications/${notification.id}`),
        () => oCtx.put(`/api/notifications/${notification.id}`, { data: { isRead: true } }),
        () => oCtx.patch(`/api/notifications/${notification.id}/read`),
        () => oCtx.delete(`/api/notifications/${notification.id}`),
        () => aCtx.get(`/api/notifications/${notification.id}`),
        () => aCtx.delete(`/api/notifications/${notification.id}`),
      ]) {
        const response = await call();
        expect(response.status()).toBe(404);
        expect(await response.text(), 'same answer as an unknown id').toBe(unknownBody);
      }
      const readAll = await oCtx.patch('/api/notifications/read-all');
      expect(readAll.status()).toBe(200);
      const stillUnread = await bCtx.get(`/api/notifications/${notification.id}`);
      expect((await stillUnread.json()).isRead, 'outsider read-all leaves B untouched').toBe(false);

      // A body that still names a roster id is refused and creates nothing: the roster id is
      // never read as an account id (here it would address B).
      const beforeRoster = (await listed(bCtx)).length;
      const rosterBody = await create(aCtx, { recipientId: bId });
      expect(rosterBody.status()).toBe(400);
      expect((await rosterBody.json()).message).toBe('Invalid notification data');
      expect((await listed(bCtx)).length, 'nothing was created').toBe(beforeRoster);

      // ── 4. Creation stays inside the organization, the identity and the readable records ──
      expect((await create(oCtx, { recipientUserId: bId })).status(), 'other organization').toBe(
        400
      );
      expect(
        (await create(aCtx, { recipientUserId: oId })).status(),
        'to the other organization'
      ).toBe(400);
      expect((await create(aCtx, { recipientUserId: inactiveId })).status(), 'inactive').toBe(400);
      for (const [label, extra] of [
        ['senderId', { senderId: aId }],
        ['senderUserId', { senderUserId: aId }],
        ['organizationId', { organizationId: defaultOrganization }],
      ] as const) {
        const refused = await create(oCtx, { recipientUserId: oId, ...extra });
        expect(refused.status(), `a body naming ${label}`).toBe(400);
      }
      const ownSender = await create(oCtx, { recipientUserId: oId });
      expect(ownSender.status(), 'own account, no references').toBe(201);
      expect(await ownSender.json(), 'the sender is the caller').toMatchObject({
        senderUserId: oId,
        organizationId: Number(org[0].id),
      });
      expect(
        (await create(oCtx, { recipientUserId: oId, relatedPageId: teamPage.id })).status(),
        'page of another organization'
      ).toBe(400);
      expect(
        (await create(aCtx, { recipientUserId: bId, relatedPageId: teamPage.id })).status(),
        'own readable page'
      ).toBe(201);
      expect(
        (await create(aCtx, { recipientUserId: bId, relatedPageId: 2_000_000_000 })).status(),
        'unknown page'
      ).toBe(400);
      // The other organization's account naming the default organization's page, a comment on it
      // and a task of its team, for its own account: each answers like an unknown id.
      const unknownRefusal = { message: 'Invalid notification data' };
      for (const [label, references] of [
        ['page', { relatedPageId: teamPage.id }],
        ['comment', { relatedCommentId: teamComment.id }],
        ['task', { relatedTaskId: teamTask.id }],
      ] as const) {
        const refused = await create(oCtx, { recipientUserId: oId, ...references });
        expect(refused.status(), `other organization's ${label}`).toBe(400);
        expect(await refused.json(), `${label}: same body as an unknown id`).toEqual(
          unknownRefusal
        );
      }
      const unknownReference = await create(oCtx, {
        recipientUserId: oId,
        relatedTaskId: 2_000_000_000,
      });
      expect(unknownReference.status()).toBe(400);
      expect(await unknownReference.json()).toEqual(unknownRefusal);
      // The same records, named by an account that may read them, are accepted.
      for (const references of [
        { relatedCommentId: teamComment.id },
        { relatedTaskId: teamTask.id },
      ]) {
        expect((await create(aCtx, { recipientUserId: bId, ...references })).status()).toBe(201);
      }
      // Other organization, inactive and unknown recipients are refused with one and the same body.
      const refusedBody = await (await create(oCtx, { recipientUserId: bId })).json();
      expect(refusedBody).toEqual(unknownRefusal);
      expect(await (await create(aCtx, { recipientUserId: inactiveId })).json()).toEqual(
        refusedBody
      );
      expect(await (await create(aCtx, { recipientUserId: 2_000_000_000 })).json()).toEqual(
        refusedBody
      );

      // ── 5. What a notification is about cannot be edited ──
      for (const data of [
        { recipientUserId: oId },
        { senderUserId: oId },
        { organizationId: Number(org[0].id) },
        { relatedPageId: teamPage.id },
      ]) {
        const refused = await bCtx.put(`/api/notifications/${notification.id}`, { data });
        expect(refused.status(), JSON.stringify(data)).toBe(400);
        expect(await refused.json()).toEqual({ message: 'Invalid update data' });
      }
      const rosterName = await bCtx.put(`/api/notifications/${notification.id}`, {
        data: { recipientId: bId },
      });
      expect(rosterName.status()).toBe(400);
      const echo = await bCtx.put(`/api/notifications/${notification.id}`, {
        data: {
          recipientUserId: bId,
          senderUserId: aId,
          organizationId: defaultOrganization,
          isRead: true,
          title: `${title}-edited`,
        },
      });
      expect(echo.status()).toBe(200);
      expect(await echo.json()).toMatchObject({ recipientUserId: bId, isRead: true });
      expect((await listed(oCtx)).map((n) => n.recipientUserId)).not.toContain(bId);

      // ── 6. The recipient manages their own ──
      const second = await create(aCtx, { recipientUserId: bId });
      expect(second.status()).toBe(201);
      const secondId = ((await second.json()) as { id: number }).id;
      const read = await bCtx.patch(`/api/notifications/${secondId}/read`);
      expect(read.status()).toBe(200);
      expect((await bCtx.delete(`/api/notifications/${secondId}`)).status()).toBe(200);
      expect((await bCtx.get(`/api/notifications/${secondId}`)).status()).toBe(404);

      // ── 7. A notification stays in its organization ──
      const third = await create(aCtx, { recipientUserId: bId });
      const thirdId = ((await third.json()) as { id: number }).id;
      expect((await listed(bCtx)).map((n) => n.id)).toContain(thirdId);
      const unreadBefore = await unreadCount(bCtx);
      expect(unreadBefore).toBeGreaterThanOrEqual(1);
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        org[0].id,
        bId,
      ]);
      expect(
        (await listed(bCtx)).map((n) => n.id),
        'not listed after the move'
      ).not.toContain(thirdId);
      expect(await unreadCount(bCtx)).toBe(0);
      expect((await bCtx.get(`/api/notifications/${thirdId}`)).status()).toBe(404);
      expect((await bCtx.delete(`/api/notifications/${thirdId}`)).status()).toBe(404);
      const kept = await db.query('SELECT count(*)::int AS n FROM notifications WHERE id = $1', [
        thirdId,
      ]);
      expect(kept.rows[0].n, 'nothing was deleted').toBe(1);
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        defaultOrganization,
        bId,
      ]);
      expect(
        (await listed(bCtx)).map((n) => n.id),
        'listed again after the return'
      ).toContain(thirdId);
      expect(await unreadCount(bCtx)).toBe(unreadBefore);
    } finally {
      if (bUserId && bOriginalOrganization !== null) {
        await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
          bOriginalOrganization,
          bUserId,
        ]);
      }
      for (const ctx of contexts) await ctx.dispose();
      await db.end();
    }
  });
});
