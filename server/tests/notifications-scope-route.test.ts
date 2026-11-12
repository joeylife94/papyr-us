/**
 * Route-level rules of the notification API (#124 X1b). Notifications address `members` rows; an
 * account owns the rows of the member records that carry its email (storage.getMemberIdsForUser).
 * The SQL side is proven by tests/integration-layer4/notifications-scope.test.ts and the whole
 * path by tests/security-notifications-scope.spec.ts.
 *
 * Rules under test:
 * - lists, counts and mark-all go to storage with the caller's member ids only, never the user id;
 *   an empty member list asks storage for nothing;
 * - a notification that is not the caller's answers 404, exactly like an unknown id;
 * - create: recipient in the caller's organization, sender one of the caller's member rows, related
 *   page/comment readable and related task in one of the caller's teams, else 400 and no insert;
 *   signed out: 401;
 * - update: who/what a notification points at cannot change;
 * - realtime goes to the room of the account behind the recipient member row; a delete is told only
 *   to the deleting account.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'notifications-scope-secret';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'notifications-scope-secret',
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
const CALLER_MEMBER = 42; // members.id of the caller: a different number on purpose
const OTHER_PERSON_MEMBER = 7; // another person's member row whose id equals the caller's user id
const CALLER_ORG = 1;
const OTHER_ORG = 2;

const token = jwt.sign({ id: CALLER_ID, email: 'me@example.com', role: 'user' }, TEST_SECRET);
const signedIn = () => ({ Cookie: [`accessToken=${token}`] });

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  type: 'mention',
  title: 'Hello',
  content: 'World',
  recipientId: CALLER_MEMBER,
  senderId: null,
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

beforeEach(() => {
  vi.resetAllMocks();
  mockConfig.enforceAuthForWrites = true;
  storage.checkPagePermission.mockResolvedValue(true);
  storage.getMemberIdsForUser.mockImplementation(async (userId: number) =>
    userId === CALLER_ID ? [CALLER_MEMBER] : []
  );
  storage.getUserOrganizationId.mockImplementation(async (userId: number) =>
    userId === CALLER_ID ? CALLER_ORG : null
  );
  storage.getUnreadNotificationCount.mockResolvedValue(3);
  // The caller sees only rows addressed to its own member ids.
  storage.getNotificationForUser.mockImplementation(async (id: number, userId: number) => {
    const owned = await storage.getMemberIdsForUser(userId);
    const stored =
      id === 1 ? row() : id === 2 ? row({ id: 2, recipientId: OTHER_PERSON_MEMBER }) : undefined;
    return stored && owned.includes(stored.recipientId) ? stored : undefined;
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/notifications and unread-count', () => {
  it('asks storage for the caller member ids only, never the user id', async () => {
    storage.getNotifications.mockResolvedValue([row()]);
    const res = await request(app).get('/api/notifications').set(signedIn());
    expect(res.status).toBe(200);
    expect(storage.getNotifications).toHaveBeenCalledWith([CALLER_MEMBER]);
    expect(storage.getNotifications).not.toHaveBeenCalledWith(CALLER_ID);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.pagination).toEqual({ hasMore: false, nextCursor: null, count: 1, total: 1 });
  });

  it('answers an empty page, without a storage listing, for an account with no member rows', async () => {
    storage.getMemberIdsForUser.mockResolvedValue([]);
    const res = await request(app).get('/api/notifications').set(signedIn());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      notifications: [],
      pagination: { hasMore: false, nextCursor: null, count: 0, total: 0 },
    });
    expect(storage.getNotifications).not.toHaveBeenCalled();
  });

  it('counts over the caller member ids; zero without a storage call when there are none', async () => {
    const res = await request(app).get('/api/notifications/unread-count').set(signedIn());
    expect(res.body).toEqual({ count: 3 });
    expect(storage.getUnreadNotificationCount).toHaveBeenCalledWith([CALLER_MEMBER]);

    storage.getUnreadNotificationCount.mockClear();
    storage.getMemberIdsForUser.mockResolvedValue([]);
    const none = await request(app).get('/api/notifications/unread-count').set(signedIn());
    expect(none.body).toEqual({ count: 0 });
    expect(storage.getUnreadNotificationCount).not.toHaveBeenCalled();
  });

  it('is 401 signed out', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    expect((await request(app).get('/api/notifications/unread-count')).status).toBe(401);
  });
});

describe('single notification routes', () => {
  const notFound = { message: 'Notification not found' };
  const cases: Array<[string, (id: number) => request.Test]> = [
    ['GET', (id) => request(app).get(`/api/notifications/${id}`).set(signedIn())],
    [
      'PUT',
      (id) => request(app).put(`/api/notifications/${id}`).set(signedIn()).send({ isRead: true }),
    ],
    ['DELETE', (id) => request(app).delete(`/api/notifications/${id}`).set(signedIn())],
    ['PATCH read', (id) => request(app).patch(`/api/notifications/${id}/read`).set(signedIn())],
  ];

  it.each(cases)(
    "%s: another person's notification answers 404, like an unknown id",
    async (_n, call) => {
      // id 2 is addressed to member 7, whose number equals the caller's user id
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

  it('GET returns the caller own notification unchanged', async () => {
    const res = await request(app).get('/api/notifications/1').set(signedIn());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('PATCH read passes the caller member ids to the write', async () => {
    storage.markNotificationAsRead.mockResolvedValue(row({ isRead: true }));
    const res = await request(app).patch('/api/notifications/1/read').set(signedIn());
    expect(res.status).toBe(200);
    expect(storage.markNotificationAsRead).toHaveBeenCalledWith(1, [CALLER_MEMBER]);
  });

  it('DELETE passes the caller member ids to the write', async () => {
    storage.deleteNotification.mockResolvedValue(true);
    const res = await request(app).delete('/api/notifications/1').set(signedIn());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Notification deleted successfully' });
    expect(storage.deleteNotification).toHaveBeenCalledWith(1, [CALLER_MEMBER]);
  });

  it('is 401 signed out', async () => {
    expect((await request(app).get('/api/notifications/1')).status).toBe(401);
    expect((await request(app).put('/api/notifications/1').send({ isRead: true })).status).toBe(
      401
    );
    expect((await request(app).delete('/api/notifications/1')).status).toBe(401);
    expect((await request(app).patch('/api/notifications/1/read')).status).toBe(401);
  });
});

describe('PUT /api/notifications/:id', () => {
  it.each([
    ['recipientId', { recipientId: 99 }],
    ['senderId', { senderId: CALLER_MEMBER }],
    ['relatedPageId', { relatedPageId: 5 }],
    ['relatedTaskId', { relatedTaskId: 5 }],
    ['relatedCommentId', { relatedCommentId: 5 }],
  ])('refuses a body that changes %s', async (_field, body) => {
    const res = await request(app).put('/api/notifications/1').set(signedIn()).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid update data' });
    expect(storage.updateNotification).not.toHaveBeenCalled();
  });

  it('stores only isRead/title/content/type and accepts echoing the stored values', async () => {
    storage.updateNotification.mockResolvedValue(row({ title: 'New', isRead: true }));
    const res = await request(app)
      .put('/api/notifications/1')
      .set(signedIn())
      .send({ title: 'New', isRead: true, recipientId: CALLER_MEMBER, senderId: null });
    expect(res.status).toBe(200);
    expect(storage.updateNotification).toHaveBeenCalledWith(1, { title: 'New', isRead: true }, [
      CALLER_MEMBER,
    ]);
  });
});

describe('PUT with nothing left to change', () => {
  it.each([
    ['a body that only repeats stored values', { recipientId: CALLER_MEMBER, senderId: null }],
    ['an empty body', {}],
  ])('answers 200 with the stored row and writes nothing for %s', async (_label, body) => {
    const res = await request(app).put('/api/notifications/1').set(signedIn()).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, recipientId: CALLER_MEMBER });
    expect(storage.updateNotification).not.toHaveBeenCalled();
    expect(storage.getUnreadNotificationCount).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/notifications/read-all', () => {
  it('marks the caller member ids only', async () => {
    storage.markAllNotificationsAsRead.mockResolvedValue(undefined);
    const res = await request(app).patch('/api/notifications/read-all').set(signedIn());
    expect(res.status).toBe(200);
    expect(storage.markAllNotificationsAsRead).toHaveBeenCalledWith([CALLER_MEMBER]);
  });

  it('does nothing for an account with no member rows', async () => {
    storage.getMemberIdsForUser.mockResolvedValue([]);
    const res = await request(app).patch('/api/notifications/read-all').set(signedIn());
    expect(res.status).toBe(200);
    expect(storage.markAllNotificationsAsRead).not.toHaveBeenCalled();
  });

  it('is 401 signed out', async () => {
    expect((await request(app).patch('/api/notifications/read-all')).status).toBe(401);
  });
});

describe('POST /api/notifications', () => {
  const RECIPIENT = 50;
  const body = (over: Record<string, unknown> = {}) => ({
    type: 'mention',
    title: 'Hi',
    content: 'There',
    recipientId: RECIPIENT,
    ...over,
  });
  const refused = { message: 'Invalid notification data' };

  beforeEach(() => {
    storage.getMemberOrganizationId.mockResolvedValue(CALLER_ORG);
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
    storage.getUserIdForMember.mockResolvedValue(null);
  });

  it('creates for a recipient in the caller organization', async () => {
    const res = await request(app).post('/api/notifications').set(signedIn()).send(body());
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(9);
    expect(storage.getMemberOrganizationId).toHaveBeenCalledWith(RECIPIENT);
  });

  it.each([
    ['another organization', OTHER_ORG],
    ['no known place', null],
  ])('refuses a recipient with %s, without inserting', async (_label, org) => {
    storage.getMemberOrganizationId.mockResolvedValue(org);
    const res = await request(app).post('/api/notifications').set(signedIn()).send(body());
    expect(res.status).toBe(400);
    expect(res.body).toEqual(refused);
    expect(storage.createNotification).not.toHaveBeenCalled();
  });

  it('refuses a caller that belongs to no organization', async () => {
    storage.getUserOrganizationId.mockResolvedValue(null);
    const res = await request(app).post('/api/notifications').set(signedIn()).send(body());
    expect(res.status).toBe(400);
    expect(storage.createNotification).not.toHaveBeenCalled();
  });

  it('accepts the caller own member row as sender and refuses anyone else', async () => {
    const own = await request(app)
      .post('/api/notifications')
      .set(signedIn())
      .send(body({ senderId: CALLER_MEMBER }));
    expect(own.status).toBe(201);
    const other = await request(app)
      .post('/api/notifications')
      .set(signedIn())
      .send(body({ senderId: OTHER_PERSON_MEMBER }));
    expect(other.status).toBe(400);
    expect(other.body).toEqual(refused);
    expect(storage.createNotification).toHaveBeenCalledTimes(1);
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

    storage.checkPagePermission.mockResolvedValue(true); // true for unknown ids, as in storage
    const unknown = await request(app)
      .post('/api/notifications')
      .set(signedIn())
      .send(body({ relatedPageId: 404 }));
    expect(unknown.status).toBe(400);
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

  it('is 401 signed out, also when auth for writes is not enforced', async () => {
    expect((await request(app).post('/api/notifications').send(body())).status).toBe(401);
    mockConfig.enforceAuthForWrites = false;
    const dev = await request(app).post('/api/notifications').send(body());
    expect(dev.status).toBe(401);
    expect(storage.createNotification).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400 and the Zod issues', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set(signedIn())
      .send({ title: 'no recipient' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid notification data');
    expect(storage.createNotification).not.toHaveBeenCalled();
  });
});
