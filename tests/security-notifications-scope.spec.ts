/**
 * Notifications belong to the person they address, and cannot be created across organizations
 * (#124 X1b), end to end against the real server, authentication, organizations and PostgreSQL.
 * Synthetic accounts, a team and pages only. Route rules: server/tests/notifications-scope-route.test.ts;
 * SQL rules: tests/integration-layer4/notifications-scope.test.ts; socket rules:
 * server/tests/realtime.notifications.socket.test.ts (no browser or socket client is used here).
 *
 * Notifications address `members` rows, accounts are `users` rows, and the two are linked by exact
 * email. There is no API for roster rows, so the spec inserts them through DATABASE_URL, and
 * creates a second organization there (as tests/security-organizations.spec.ts does). One roster
 * row is numbered like the outsider's account, which used to be served that row's notifications.
 *
 * Rules under test:
 * - a notification is listed, counted, opened, changed, marked read and deleted only by the
 *   account whose email the recipient member row carries; anyone else, including the account whose
 *   id equals the member id, gets nothing, and an id that is not theirs answers 404 like an
 *   unknown one;
 * - a notification can only be created for a member of the caller's organization, from the
 *   caller's own member row, pointing at records the caller may read;
 * - who a notification is for and what it points at cannot be edited;
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

type Listed = { notifications: Array<{ id: number; title: string; recipientId: number }> };

test.describe('Notifications follow the recipient and the organization', () => {
  test('lists, opens and writes only for the recipient; creation stays inside the organization', async ({
    request,
  }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create roster rows');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const title = `secn-${stamp}`;

    const userA = await registerTestUser(request, 'secn-a');
    const userB = await registerTestUser(request, 'secn-b');
    const outsider = await registerTestUser(request, 'secn-outsider');
    const aCtx = await createAuthenticatedApiContext(userA.email, userA.password);
    const bCtx = await createAuthenticatedApiContext(userB.email, userB.password);
    const oCtx = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const contexts = [aCtx, bCtx, oCtx, anonymous];
    const memberIds: number[] = [];

    const idOf = async (ctx: APIRequestContext) =>
      Number((await (await ctx.get('/api/auth/me')).json()).id);
    const addMember = async (email: string) => {
      const { rows } = await db.query(
        `INSERT INTO members (name, email, role) VALUES ($1, $1, 'tester') RETURNING id`,
        [email]
      );
      memberIds.push(Number(rows[0].id));
      return Number(rows[0].id);
    };
    const listed = async (ctx: APIRequestContext) => {
      const response = await ctx.get('/api/notifications?limit=100');
      expect(response.status()).toBe(200);
      return ((await response.json()) as Listed).notifications;
    };
    const create = (ctx: APIRequestContext, data: Record<string, unknown>) =>
      ctx.post('/api/notifications', {
        data: { type: 'mention', title, content: 'synthetic', ...data },
      });

    try {
      // ── Arrange ──
      const outsiderUserId = await idOf(oCtx);
      const { rows: org } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [`secn-org-${stamp}`]
      );
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        org[0].id,
        outsiderUserId,
      ]);

      // The case where one account's id equals another person's member id cannot be made
      // deterministic here (the member id would have to be free in a shared database), so it is
      // proven in tests/integration-layer4/notifications-scope.test.ts, where ids are chosen. This
      // spec asserts the same rules on the ids it creates: a notification of B is never served to
      // the outsider or to A, whatever their ids.
      const mA = await addMember(userA.email);
      const mB = await addMember(userB.email);
      const mO = await addMember(outsider.email);

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
        data: { type: 'mention', title, content: 'x', recipientId: mB },
      });
      expect(anonymousPost.status()).toBe(401);

      // ── 2. A notifies B, inside the organization ──
      const made = await create(aCtx, { recipientId: mB, senderId: mA });
      expect(made.status()).toBe(201);
      const notification = (await made.json()) as { id: number; recipientId: number };
      expect(notification.recipientId).toBe(mB);

      expect((await listed(bCtx)).map((n) => n.id)).toContain(notification.id);
      expect(
        (await listed(aCtx)).map((n) => n.id),
        'sender is not the recipient'
      ).not.toContain(notification.id);
      expect(
        (await (await bCtx.get('/api/notifications/unread-count')).json()).count
      ).toBeGreaterThanOrEqual(1);
      expect((await bCtx.get(`/api/notifications/${notification.id}`)).status()).toBe(200);

      // ── 3. The outsider (users.id equal to B's member id, when free) gets nothing ──
      expect((await listed(oCtx)).map((n) => n.id)).not.toContain(notification.id);
      expect((await (await oCtx.get('/api/notifications/unread-count')).json()).count).toBe(0);
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

      // ── 4. Creation stays inside the organization, the identity and the readable records ──
      expect((await create(oCtx, { recipientId: mB })).status(), 'other organization').toBe(400);
      expect((await create(aCtx, { recipientId: mO })).status(), 'to the other organization').toBe(
        400
      );
      expect(
        (await create(oCtx, { recipientId: mO, senderId: mA })).status(),
        'impersonation'
      ).toBe(400);
      expect(
        (await create(oCtx, { recipientId: mO, relatedPageId: teamPage.id })).status(),
        'page of another organization'
      ).toBe(400);
      expect(
        (await create(aCtx, { recipientId: mB, relatedPageId: teamPage.id })).status(),
        'own readable page'
      ).toBe(201);
      expect(
        (await create(aCtx, { recipientId: mB, relatedPageId: 2_000_000_000 })).status(),
        'unknown page'
      ).toBe(400);
      expect((await create(oCtx, { recipientId: mO })).status(), 'own member, no references').toBe(
        201
      );
      // The other organization's account naming the default organization's page, a comment on it
      // and a task of its team, for its own member: each answers like an unknown id.
      const unknownRefusal = { message: 'Invalid notification data' };
      for (const [label, references] of [
        ['page', { relatedPageId: teamPage.id }],
        ['comment', { relatedCommentId: teamComment.id }],
        ['task', { relatedTaskId: teamTask.id }],
      ] as const) {
        const refused = await create(oCtx, { recipientId: mO, ...references });
        expect(refused.status(), `other organization's ${label}`).toBe(400);
        expect(await refused.json(), `${label}: same body as an unknown id`).toEqual(
          unknownRefusal
        );
      }
      const unknownReference = await create(oCtx, {
        recipientId: mO,
        relatedTaskId: 2_000_000_000,
      });
      expect(unknownReference.status()).toBe(400);
      expect(await unknownReference.json()).toEqual(unknownRefusal);
      // The same records, named by an account that may read them, are accepted.
      for (const references of [
        { relatedCommentId: teamComment.id },
        { relatedTaskId: teamTask.id },
      ]) {
        expect((await create(aCtx, { recipientId: mB, ...references })).status()).toBe(201);
      }
      const refusedBody = await (await create(oCtx, { recipientId: mB })).json();
      expect(refusedBody).toEqual({ message: 'Invalid notification data' });
      expect(await (await create(aCtx, { recipientId: 2_000_000_000 })).json()).toEqual(
        refusedBody
      );

      // ── 5. What a notification is about cannot be edited ──
      const reassign = await bCtx.put(`/api/notifications/${notification.id}`, {
        data: { recipientId: mO },
      });
      expect(reassign.status()).toBe(400);
      expect(await reassign.json()).toEqual({ message: 'Invalid update data' });
      const resender = await bCtx.put(`/api/notifications/${notification.id}`, {
        data: { senderId: mO },
      });
      expect(resender.status()).toBe(400);
      const edit = await bCtx.put(`/api/notifications/${notification.id}`, {
        data: { isRead: true, title: `${title}-edited` },
      });
      expect(edit.status()).toBe(200);
      expect(await edit.json()).toMatchObject({ recipientId: mB, isRead: true });
      expect((await listed(oCtx)).map((n) => n.recipientId)).not.toContain(mB);

      // ── 6. The recipient manages their own ──
      const second = await create(aCtx, { recipientId: mB });
      expect(second.status()).toBe(201);
      const secondId = ((await second.json()) as { id: number }).id;
      const read = await bCtx.patch(`/api/notifications/${secondId}/read`);
      expect(read.status()).toBe(200);
      expect((await bCtx.delete(`/api/notifications/${secondId}`)).status()).toBe(200);
      expect((await bCtx.get(`/api/notifications/${secondId}`)).status()).toBe(404);
    } finally {
      if (memberIds.length) {
        await db.query('DELETE FROM members WHERE id = ANY($1::int[])', [memberIds]);
      }
      for (const ctx of contexts) await ctx.dispose();
      await db.end();
    }
  });
});
