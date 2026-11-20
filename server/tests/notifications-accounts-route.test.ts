/**
 * Route-level rules of the notification API once notifications are addressed to accounts (WP0a).
 * A notification belongs to an account (`users.id`) and to the organization it was created in;
 * the caller's identity and organization come from the session and from storage, never from the
 * request. The SQL side is proven by tests/integration-layer4/notifications-scope.test.ts and the
 * whole path by tests/security-notifications-scope.spec.ts.
 *
 * Rules under test, in both modes of ENFORCE_AUTH_WRITES:
 * - list, count, read, update, delete, mark-read and mark-all call storage with the session user
 *   and that user's organization, and with nothing taken from the request;
 * - an account without an organization, or whose organization lookup fails, gets 403 before any
 *   notification method runs;
 * - a notification that is not the caller's answers 404, exactly like an unknown id;
 * - create: the recipient is an active account of the caller's organization, the sender and the
 *   organization are written by the server, a body that names a roster id, a sender or an
 *   organization is refused, related page/comment readable and related task in one of the
 *   caller's teams, every refusal answers the same body;
 * - update: who a notification is for, who sent it, its organization and what it points at cannot
 *   change; echoing the stored values is accepted;
 * - signed out: 401 on all eight routes, nothing read or written.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'notifications-accounts-secret';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'notifications-accounts-secret',
  adminEmails: [] as string[],
  enforceAuthForWrites: true,
  rateLimitEnabled: false,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 1000,
  adminIpWhitelist: [] as string[],
  port: 5001,
  host: '0.0.0.0',
  isProduction: false,
  isReplit: false,
}));

vi.mock('../config', () => ({ config: mockConfig }));

vi.mock('../features', () => ({
  featureFlags: {
    PAPYR_MODE: 'team',
    FEATURE_TEAMS: true,
    FEATURE_NOTIFICATIONS: true,
  },
  isFeatureEnabled: () => true,
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const CALLER_ID = 7; // users.id
const OTHER_USER_ID = 8;
const CALLER_ORG = 1;
const OTHER_ORG = 2;

const token = jwt.sign({ id: CALLER_ID, email: 'me@example.com', role: 'user' }, TEST_SECRET);
const signedIn = () => ({ Cookie: [`accessToken=${token}`] });

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  type: 'mention',
  title: 'Hello',
  content: 'World',
  recipientUserId: CALLER_ID,
  organizationId: CALLER_ORG,
  senderUserId: null,
  relatedPageId: null,
  relatedTaskId: null,
  relatedCommentId: null,
  isRead: false,
  createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
  ...over,
});

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const notFound = { message: 'Notification not found' };
const noOrganization = { message: 'Your account does not belong to an organization' };
const refused = { message: 'Invalid notification data' };

for (const enforce of [true, false]) {
  describe(`notifications are addressed to accounts (ENFORCE_AUTH_WRITES=${enforce})`, () => {
    beforeEach(() => {
      vi.resetAllMocks();
      mockConfig.enforceAuthForWrites = enforce;
      storage.checkPagePermission.mockResolvedValue(true);
      storage.getUserOrganizationId.mockImplementation(async (userId: number) =>
        userId === CALLER_ID ? CALLER_ORG : null
      );
      storage.getUnreadNotificationCount.mockResolvedValue(3);
      // The caller sees only its own row in its own organization.
      storage.getNotificationForUser.mockImplementation(
        async (id: number, userId: number, organizationId: number) => {
          const stored =
            id === 1
              ? row()
              : id === 2
                ? row({ id: 2, recipientUserId: OTHER_USER_ID })
                : undefined;
          return stored &&
            stored.recipientUserId === userId &&
            stored.organizationId === organizationId
            ? stored
            : undefined;
        }
      );
    });

    describe('reads', () => {
      it('lists with the session user and its organization, nothing from the request', async () => {
        storage.getNotifications.mockResolvedValue([row()]);
        const res = await request(app)
          .get('/api/notifications?recipientUserId=99&organizationId=99&recipientId=99')
          .set(signedIn());
        expect(res.status).toBe(200);
        expect(storage.getNotifications).toHaveBeenCalledTimes(1);
        expect(storage.getNotifications).toHaveBeenCalledWith(CALLER_ID, CALLER_ORG);
        expect(res.body.notifications).toHaveLength(1);
        expect(res.body.pagination).toEqual({
          hasMore: false,
          nextCursor: null,
          count: 1,
          total: 1,
        });
      });

      it('counts with the session user and its organization', async () => {
        const res = await request(app).get('/api/notifications/unread-count').set(signedIn());
        expect(res.body).toEqual({ count: 3 });
        expect(storage.getUnreadNotificationCount).toHaveBeenCalledWith(CALLER_ID, CALLER_ORG);
      });

      it('opens the caller own notification', async () => {
        const res = await request(app).get('/api/notifications/1').set(signedIn());
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: 1, recipientUserId: CALLER_ID });
        expect(storage.getNotificationForUser).toHaveBeenCalledWith(1, CALLER_ID, CALLER_ORG);
      });
    });

    describe('single notification routes', () => {
      const cases: Array<[string, (id: number) => request.Test]> = [
        ['GET', (id) => request(app).get(`/api/notifications/${id}`).set(signedIn())],
        [
          'PUT',
          (id) =>
            request(app).put(`/api/notifications/${id}`).set(signedIn()).send({ isRead: true }),
        ],
        ['DELETE', (id) => request(app).delete(`/api/notifications/${id}`).set(signedIn())],
        ['PATCH read', (id) => request(app).patch(`/api/notifications/${id}/read`).set(signedIn())],
      ];

      it.each(cases)(
        "%s: another account's notification answers like an unknown id",
        async (_n, call) => {
          const foreign = await call(2);
          const unknown = await call(999);
          expect(foreign.status).toBe(404);
          expect(foreign.body).toEqual(notFound);
          expect(unknown.status).toBe(404);
          expect(unknown.body).toEqual(notFound);
          expect(storage.updateNotification).not.toHaveBeenCalled();
          expect(storage.deleteNotification).not.toHaveBeenCalled();
          expect(storage.markNotificationAsRead).not.toHaveBeenCalled();
        }
      );

      it('mark-read writes with the session user and its organization', async () => {
        storage.markNotificationAsRead.mockResolvedValue(row({ isRead: true }));
        const res = await request(app).patch('/api/notifications/1/read').set(signedIn());
        expect(res.status).toBe(200);
        expect(storage.markNotificationAsRead).toHaveBeenCalledWith(1, CALLER_ID, CALLER_ORG);
      });

      it('delete writes with the session user and its organization', async () => {
        storage.deleteNotification.mockResolvedValue(true);
        const res = await request(app).delete('/api/notifications/1').set(signedIn());
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'Notification deleted successfully' });
        expect(storage.deleteNotification).toHaveBeenCalledWith(1, CALLER_ID, CALLER_ORG);
      });

      it('mark-all writes with the session user and its organization', async () => {
        storage.markAllNotificationsAsRead.mockResolvedValue(undefined);
        const res = await request(app).patch('/api/notifications/read-all').set(signedIn());
        expect(res.status).toBe(200);
        expect(storage.markAllNotificationsAsRead).toHaveBeenCalledTimes(1);
        expect(storage.markAllNotificationsAsRead).toHaveBeenCalledWith(CALLER_ID, CALLER_ORG);
      });
    });

    describe('PUT /api/notifications/:id', () => {
      it.each([
        ['recipientUserId', { recipientUserId: 99 }],
        ['senderUserId', { senderUserId: CALLER_ID }],
        ['organizationId', { organizationId: OTHER_ORG }],
        ['relatedPageId', { relatedPageId: 5 }],
        ['relatedTaskId', { relatedTaskId: 5 }],
        ['relatedCommentId', { relatedCommentId: 5 }],
      ])('refuses a body that changes %s', async (_field, body) => {
        const res = await request(app).put('/api/notifications/1').set(signedIn()).send(body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid update data');
        expect(storage.updateNotification).not.toHaveBeenCalled();
      });

      it.each([
        ['recipientId', { recipientId: CALLER_ID }],
        ['senderId', { senderId: null }],
      ])('refuses the roster name %s', async (_field, body) => {
        const res = await request(app).put('/api/notifications/1').set(signedIn()).send(body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid update data');
        expect(storage.updateNotification).not.toHaveBeenCalled();
      });

      it('stores only isRead/title/content/type and accepts echoing the stored values', async () => {
        storage.updateNotification.mockResolvedValue(row({ title: 'New', isRead: true }));
        const res = await request(app).put('/api/notifications/1').set(signedIn()).send({
          title: 'New',
          isRead: true,
          recipientUserId: CALLER_ID,
          organizationId: CALLER_ORG,
          senderUserId: null,
        });
        expect(res.status).toBe(200);
        expect(storage.updateNotification).toHaveBeenCalledWith(
          1,
          { title: 'New', isRead: true },
          CALLER_ID,
          CALLER_ORG
        );
      });

      it.each([
        [
          'a body that only repeats stored values',
          { recipientUserId: CALLER_ID, senderUserId: null },
        ],
        ['an empty body', {}],
      ])('answers 200 with the stored row and writes nothing for %s', async (_label, body) => {
        const res = await request(app).put('/api/notifications/1').set(signedIn()).send(body);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: 1, recipientUserId: CALLER_ID });
        expect(storage.updateNotification).not.toHaveBeenCalled();
      });
    });

    describe('POST /api/notifications', () => {
      const RECIPIENT = 50;
      const body = (over: Record<string, unknown> = {}) => ({
        type: 'mention',
        title: 'Hi',
        content: 'There',
        recipientUserId: RECIPIENT,
        ...over,
      });

      beforeEach(() => {
        storage.getNotificationRecipientOrganizationId.mockResolvedValue(CALLER_ORG);
        storage.createNotification.mockImplementation(async (n: any) => ({
          id: 9,
          isRead: false,
          ...n,
        }));
        storage.getWikiPage.mockImplementation(async (id: number) =>
          id === 5 ? { id: 5 } : undefined
        );
        storage.getComment.mockImplementation(async (id: number) =>
          id === 8 ? { id: 8, pageId: 5 } : undefined
        );
        storage.getTask.mockImplementation(async (id: number) =>
          id === 3 ? { id: 3, teamId: '11' } : undefined
        );
        storage.getUserTeamIds.mockResolvedValue([11]);
      });

      it('creates for an account of the caller organization; the server writes sender and organization', async () => {
        const res = await request(app).post('/api/notifications').set(signedIn()).send(body());
        expect(res.status).toBe(201);
        expect(res.body.id).toBe(9);
        expect(storage.getNotificationRecipientOrganizationId).toHaveBeenCalledWith(RECIPIENT);
        expect(storage.createNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            recipientUserId: RECIPIENT,
            senderUserId: CALLER_ID,
            organizationId: CALLER_ORG,
          })
        );
      });

      it.each([
        ['recipientId', { recipientId: 50 }],
        ['senderId', { senderId: 3 }],
        ['senderUserId', { senderUserId: 3 }],
        ['organizationId', { organizationId: OTHER_ORG }],
      ])('refuses a body that names %s, and writes nothing', async (_key, extra) => {
        const res = await request(app).post('/api/notifications').set(signedIn()).send(body(extra));
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid notification data');
        expect(storage.createNotification).not.toHaveBeenCalled();
      });

      it('refuses a body that addresses a roster id instead of an account', async () => {
        const res = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send({ type: 'mention', title: 'Hi', content: 'There', recipientId: 50 });
        expect(res.status).toBe(400);
        expect(storage.createNotification).not.toHaveBeenCalled();
        expect(storage.getNotificationRecipientOrganizationId).not.toHaveBeenCalled();
      });

      it.each([
        ['in another organization', OTHER_ORG],
        ['inactive, without an organization or unknown', null],
      ])('refuses a recipient %s with one body, without inserting', async (_label, org) => {
        storage.getNotificationRecipientOrganizationId.mockResolvedValue(org);
        const res = await request(app).post('/api/notifications').set(signedIn()).send(body());
        expect(res.status).toBe(400);
        expect(res.body).toEqual(refused);
        expect(storage.createNotification).not.toHaveBeenCalled();
      });

      it('refuses a caller that belongs to no organization', async () => {
        storage.getUserOrganizationId.mockResolvedValue(null);
        const res = await request(app).post('/api/notifications').set(signedIn()).send(body());
        expect(res.status).toBe(400);
        expect(res.body).toEqual(refused);
        expect(storage.createNotification).not.toHaveBeenCalled();
      });

      it('refuses when the recipient lookup fails', async () => {
        storage.getNotificationRecipientOrganizationId.mockRejectedValue(new Error('db down'));
        const res = await request(app).post('/api/notifications').set(signedIn()).send(body());
        expect(res.status).toBe(400);
        expect(storage.createNotification).not.toHaveBeenCalled();
      });

      it('checks the related page: readable passes, unreadable and unknown refuse', async () => {
        const ok = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send(body({ relatedPageId: 5 }));
        expect(ok.status).toBe(201);

        storage.checkPagePermission.mockResolvedValue(false);
        const denied = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send(body({ relatedPageId: 5 }));
        expect(denied.status).toBe(400);
        expect(denied.body).toEqual(refused);

        storage.checkPagePermission.mockResolvedValue(true);
        const unknown = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send(body({ relatedPageId: 404 }));
        expect(unknown.status).toBe(400);
        expect(unknown.body).toEqual(refused);
        expect(storage.createNotification).toHaveBeenCalledTimes(1);
      });

      it('checks the page of a related comment', async () => {
        const ok = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send(body({ relatedCommentId: 8 }));
        expect(ok.status).toBe(201);

        storage.checkPagePermission.mockResolvedValue(false);
        const denied = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send(body({ relatedCommentId: 8 }));
        expect(denied.status).toBe(400);

        const unknown = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send(body({ relatedCommentId: 404 }));
        expect(unknown.status).toBe(400);
      });

      it('allows a related task only from one of the caller teams', async () => {
        const ok = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send(body({ relatedTaskId: 3 }));
        expect(ok.status).toBe(201);

        storage.getUserTeamIds.mockResolvedValue([12]);
        const denied = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send(body({ relatedTaskId: 3 }));
        expect(denied.status).toBe(400);
        expect(denied.body).toEqual(refused);

        const unknown = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send(body({ relatedTaskId: 404 }));
        expect(unknown.status).toBe(400);
      });

      it('rejects a malformed body with 400', async () => {
        const res = await request(app)
          .post('/api/notifications')
          .set(signedIn())
          .send({ title: 'no recipient' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid notification data');
        expect(storage.createNotification).not.toHaveBeenCalled();
      });
    });

    describe('an account without an organization reads and changes no notification', () => {
      beforeEach(() => {
        storage.getUserOrganizationId.mockResolvedValue(null);
        storage.getNotifications.mockResolvedValue([row()]);
        storage.updateNotification.mockResolvedValue(row());
        storage.deleteNotification.mockResolvedValue(true);
        storage.markNotificationAsRead.mockResolvedValue(row());
      });

      const calls: Array<[string, () => request.Test]> = [
        ['list', () => request(app).get('/api/notifications').set(signedIn())],
        ['count', () => request(app).get('/api/notifications/unread-count').set(signedIn())],
        ['read', () => request(app).get('/api/notifications/1').set(signedIn())],
        [
          'update',
          () => request(app).put('/api/notifications/1').set(signedIn()).send({ isRead: true }),
        ],
        ['delete', () => request(app).delete('/api/notifications/1').set(signedIn())],
        ['mark-read', () => request(app).patch('/api/notifications/1/read').set(signedIn())],
        ['read-all', () => request(app).patch('/api/notifications/read-all').set(signedIn())],
      ];

      const nothingTouched = () => {
        expect(storage.getNotifications).not.toHaveBeenCalled();
        expect(storage.getNotificationForUser).not.toHaveBeenCalled();
        expect(storage.getUnreadNotificationCount).not.toHaveBeenCalled();
        expect(storage.updateNotification).not.toHaveBeenCalled();
        expect(storage.deleteNotification).not.toHaveBeenCalled();
        expect(storage.markNotificationAsRead).not.toHaveBeenCalled();
        expect(storage.markAllNotificationsAsRead).not.toHaveBeenCalled();
      };

      for (const [name, call] of calls) {
        it(`${name}: 403 before any notification method is called`, async () => {
          const response = await call();
          expect(response.status).toBe(403);
          expect(response.body).toEqual(noOrganization);
          nothingTouched();
        });

        it(`${name}: a failing organization lookup is 403 too, never treated as allowed`, async () => {
          storage.getUserOrganizationId.mockRejectedValue(new Error('db down'));
          const response = await call();
          expect(response.status).toBe(403);
          expect(response.body).toEqual(noOrganization);
          nothingTouched();
        });
      }
    });

    describe('signed out', () => {
      const body = () => ({ type: 'mention', title: 'Hi', content: 'There', recipientUserId: 50 });
      const calls: Array<[string, () => request.Test]> = [
        ['list', () => request(app).get('/api/notifications')],
        ['count', () => request(app).get('/api/notifications/unread-count')],
        ['read', () => request(app).get('/api/notifications/1')],
        ['create', () => request(app).post('/api/notifications').send(body())],
        ['update', () => request(app).put('/api/notifications/1').send({ isRead: true })],
        ['delete', () => request(app).delete('/api/notifications/1')],
        ['mark-read', () => request(app).patch('/api/notifications/1/read')],
        ['read-all', () => request(app).patch('/api/notifications/read-all')],
      ];

      it.each(calls)('%s is 401 and nothing is read or written', async (_name, call) => {
        const response = await call();
        expect(response.status).toBe(401);
        expect(storage.getUserOrganizationId).not.toHaveBeenCalled();
        expect(storage.getNotifications).not.toHaveBeenCalled();
        expect(storage.getNotificationForUser).not.toHaveBeenCalled();
        expect(storage.getNotificationRecipientOrganizationId).not.toHaveBeenCalled();
        expect(storage.createNotification).not.toHaveBeenCalled();
        expect(storage.updateNotification).not.toHaveBeenCalled();
        expect(storage.deleteNotification).not.toHaveBeenCalled();
        expect(storage.markNotificationAsRead).not.toHaveBeenCalled();
        expect(storage.markAllNotificationsAsRead).not.toHaveBeenCalled();
      });
    });
  });
}
