/**
 * A refresh token is not a session, and a deactivated account gets none.
 *
 * Access and refresh tokens are signed with the same secret. Rules under test, with real
 * tokens (jsonwebtoken is not mocked) and mocked storage:
 * - `verifyAccessToken` accepts an access token and refuses a refresh token, a token signed with
 *   another secret, an expired token and anything that is not a token;
 * - a refresh token presented as the session (cookie or Bearer) is refused wherever a session is
 *   checked: a route that requires one, a route that reads one if present, an admin route;
 * - POST /api/auth/refresh still accepts a refresh token, and only a refresh token;
 * - a deactivated account cannot sign in with its password or extend its session, and gets no
 *   cookie; an active one still can.
 * The Socket.IO side is in realtime.notifications.socket.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';
import { verifyAccessToken } from '../auth-tokens';

const SECRET = 'auth-token-kinds-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'auth-token-kinds-secret',
    adminEmails: ['admin@example.com'],
    enforceAuthForWrites: true,
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
const accessToken = jwt.sign({ id: USER.id, email: USER.email, role: 'user' }, SECRET, {
  expiresIn: '1h',
});
const refreshToken = jwt.sign({ id: USER.id, type: 'refresh' }, SECRET, { expiresIn: '30d' });
const adminRefreshToken = jwt.sign({ id: 1, type: 'refresh' }, SECRET, { expiresIn: '30d' });

let app: Express;
let server: http.Server;
let passwordHash: string;

/** Makes the next `storage.db.select().from().where()` resolve to `rows`. */
function accountRows(rows: unknown[]) {
  storage.db.where.mockResolvedValue(rows);
}
const account = (over: Record<string, unknown> = {}) => ({
  ...USER,
  hashedPassword: passwordHash,
  isActive: true,
  ...over,
});
const cookiesOf = (response: request.Response): string[] =>
  ([] as string[]).concat(response.headers['set-cookie'] ?? []);
const setsSession = (response: request.Response) =>
  cookiesOf(response).some((cookie) => /^accessToken=[^;]+/.test(cookie));

beforeAll(async () => {
  passwordHash = await bcrypt.hash('Password123!', 4);
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
    where: vi.fn().mockResolvedValue([]),
  };
  storage.getUserTeamIds.mockResolvedValue([]);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('verifyAccessToken', () => {
  it('accepts an access token and returns its payload', () => {
    expect(verifyAccessToken(accessToken)).toMatchObject({ id: USER.id, email: USER.email });
  });

  it('refuses a refresh token', () => {
    expect(() => verifyAccessToken(refreshToken)).toThrow('Not an access token');
  });

  it('refuses a token it did not sign, an expired one and a non-token', () => {
    const foreign = jwt.sign({ id: USER.id }, 'another-secret');
    const expired = jwt.sign({ id: USER.id }, SECRET, { expiresIn: -10 });
    for (const token of [foreign, expired, 'not-a-token', '']) {
      expect(() => verifyAccessToken(token)).toThrow();
    }
  });
});

describe('a refresh token is not accepted as the session', () => {
  it('on a route that requires a session, as cookie or as Bearer', async () => {
    const asCookie = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`accessToken=${refreshToken}`]);
    expect(asCookie.status).toBe(401);

    const asBearer = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshToken}`);
    expect(asBearer.status).toBe(401);
    expect(storage.db.select).not.toHaveBeenCalled();
  });

  it('on a route that reads a session if present: the caller counts as signed out', async () => {
    const response = await request(app)
      .get('/api/analytics/popular')
      .set('Authorization', `Bearer ${refreshToken}`);
    expect(response.status).toBe(401);
    expect(storage.getUserTeamIds).not.toHaveBeenCalled();
  });

  it('on an admin route, even for an admin account', async () => {
    storage.getUserAccount.mockResolvedValue({
      id: 1,
      email: 'admin@example.com',
      isActive: true,
    });
    const response = await request(app)
      .get('/api/admin/session')
      .set('Authorization', `Bearer ${adminRefreshToken}`);
    expect([401, 403]).toContain(response.status);
    expect(storage.getUserAccount).not.toHaveBeenCalled();
  });

  it('while the access token still works', async () => {
    accountRows([USER]);
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`accessToken=${accessToken}`]);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: USER.id, email: USER.email });
  });
});

describe('POST /api/auth/refresh', () => {
  it('extends the session of an active account from its refresh token', async () => {
    accountRows([account()]);
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    expect(response.status).toBe(200);
    expect(setsSession(response)).toBe(true);
  });

  it('refuses an access token in the refresh cookie', async () => {
    accountRows([account()]);
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${accessToken}`]);
    expect(response.status).toBe(401);
    expect(setsSession(response)).toBe(false);
  });

  it('refuses a deactivated account and sets no session', async () => {
    accountRows([account({ isActive: false })]);
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Invalid refresh token' });
    expect(setsSession(response)).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  const credentials = { email: USER.email, password: 'Password123!' };

  it('signs an active account in', async () => {
    accountRows([account()]);
    const response = await request(app).post('/api/auth/login').send(credentials);
    expect(response.status).toBe(200);
    expect(setsSession(response)).toBe(true);
  });

  it('refuses a deactivated account that knows its password, and sets no session', async () => {
    accountRows([account({ isActive: false })]);
    const response = await request(app).post('/api/auth/login').send(credentials);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'Account is deactivated' });
    expect(setsSession(response)).toBe(false);
  });

  it('does not say an account is deactivated to someone with the wrong password', async () => {
    accountRows([account({ isActive: false })]);
    const response = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, password: 'Wrong123!' });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Invalid credentials' });
  });
});
