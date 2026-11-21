/**
 * A session belongs to an active account, read when each request arrives.
 *
 * Rules under test, with real tokens and a mocked storage, in both ENFORCE_AUTH_WRITES modes:
 * - a still-valid access token of an account that is not active (deactivated, or no longer
 *   existing) is no session: a route that requires one answers 401, a route that reads one if
 *   present sees a signed-out caller, and no storage permission is asked in the account's name;
 * - an active account is unaffected;
 * - when the account cannot be read, the request is not treated as signed in (a route that
 *   requires a session answers 500, a route that reads one sees a signed-out caller);
 * - the active flag is read per request: an account deactivated after a first request is refused
 *   on the next one with the same token, and one reactivated is accepted again.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const SECRET = 'auth-inactive-account-secret';
const mode = vi.hoisted(() => ({ enforce: true }));

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'auth-inactive-account-secret',
    adminEmails: ['admin@example.com'],
    get enforceAuthForWrites() {
      return mode.enforce;
    },
    rateLimitEnabled: false,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 1000,
    adminIpWhitelist: [],
    port: 5001,
    host: '0.0.0.0',
    isProduction: false,
    isReplit: false,
  },
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const USER = { id: 7, name: 'Reader', email: 'reader@example.com' };
const token = jwt.sign({ id: USER.id, email: USER.email, role: 'user' }, SECRET, {
  expiresIn: '1h',
});
const bearer = { Authorization: `Bearer ${token}` };

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  storage.db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([USER]),
  };
  storage.getUserAccount.mockResolvedValue({ id: USER.id, email: USER.email, isActive: true });
  storage.checkPagePermission.mockResolvedValue(true);
  storage.getWikiPage.mockResolvedValue({ id: 3, title: 'P', blocks: [], tags: [] });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** The account id storage was asked a page permission for, per call. */
const permissionAskedFor = () =>
  storage.checkPagePermission.mock.calls.map((call: unknown[]) => call[0]);

describe.each([true, false])('with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mode.enforce = enforce;
  });

  describe.each([
    ['deactivated', { id: USER.id, email: USER.email, isActive: false }],
    ['no longer existing', undefined],
  ])('an account that is %s', (_label, account) => {
    beforeEach(() => {
      storage.getUserAccount.mockResolvedValue(account);
    });

    it('is refused by a route that requires a session, with the token as cookie or Bearer', async () => {
      const viaBearer = await request(app).get('/api/auth/me').set(bearer);
      expect(viaBearer.status).toBe(401);
      const viaCookie = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`accessToken=${token}`]);
      expect(viaCookie.status).toBe(401);
      expect(storage.db.select).not.toHaveBeenCalled();
    });

    it('is a signed-out caller on a route that reads a session if present', async () => {
      await request(app).get('/api/pages/3').set(bearer);
      expect(permissionAskedFor()).toEqual([undefined]);
    });

    it('cannot use a page, comment or team route', async () => {
      const attempts = [
        request(app).get('/api/pages/3/permissions').set(bearer),
        request(app).put('/api/pages/3').set(bearer).send({ title: 'x' }),
        request(app).post('/api/pages/3/comments').set(bearer).send({ content: 'x' }),
        request(app).post('/api/teams').set(bearer).send({ name: 'x' }),
      ];
      const results = await Promise.all(attempts);
      // With enforcement the write gate refuses all four. Without it the PUT reaches its handler as
      // a signed-out caller (development behaviour; its mocked update finds no page), while the
      // routes that always need a session still answer 401.
      const expected = enforce
        ? [
            [401, { message: 'Invalid token' }],
            [401, { message: 'Invalid token' }],
            [401, { message: 'Invalid token' }],
            [401, { message: 'Invalid token' }],
          ]
        : [
            [401, { message: 'Invalid token' }],
            [404, { message: 'Page not found' }],
            [401, { message: 'Invalid token' }],
            [401, { error: 'Authentication required' }],
          ];
      expect(results.map((r) => [r.status, r.body])).toEqual(expected);
      expect(storage.updateWikiPage).toHaveBeenCalledTimes(enforce ? 0 : 1);
      expect(storage.createTeamWithOwner).not.toHaveBeenCalled();
      expect(storage.createComment).not.toHaveBeenCalled();
      expect(permissionAskedFor().every((id: unknown) => id === undefined)).toBe(true);
    });
  });

  it('an active account signs in as before', async () => {
    const me = await request(app).get('/api/auth/me').set(bearer);
    expect(me.status).toBe(200);
    await request(app).get('/api/pages/3').set(bearer);
    expect(permissionAskedFor()).toEqual([USER.id]);
    expect(storage.getUserAccount).toHaveBeenCalledWith(USER.id);
  });

  it('reads the active flag per request', async () => {
    expect((await request(app).get('/api/auth/me').set(bearer)).status).toBe(200);
    storage.getUserAccount.mockResolvedValue({ id: USER.id, email: USER.email, isActive: false });
    expect((await request(app).get('/api/auth/me').set(bearer)).status).toBe(401);
    storage.getUserAccount.mockResolvedValue({ id: USER.id, email: USER.email, isActive: true });
    expect((await request(app).get('/api/auth/me').set(bearer)).status).toBe(200);
  });

  it('an account that cannot be read is not signed in', async () => {
    storage.getUserAccount.mockRejectedValue(new Error('database unavailable'));
    const me = await request(app).get('/api/auth/me').set(bearer);
    expect(me.status).toBe(500);
    expect(JSON.stringify(me.body)).not.toMatch(/database unavailable/);
    await request(app).get('/api/pages/3').set(bearer);
    expect(permissionAskedFor()).toEqual([undefined]);
  });

  it('a token without an account id is not a session', async () => {
    const anonymous = jwt.sign({ email: USER.email, role: 'user' }, SECRET, { expiresIn: '1h' });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${anonymous}`);
    expect(me.status).toBe(401);
    expect(storage.getUserAccount).not.toHaveBeenCalled();
  });
});
