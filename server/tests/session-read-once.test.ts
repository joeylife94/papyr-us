/**
 * The verified session of a request is read once.
 *
 * Rules under test, with real tokens and a mocked storage, in both ENFORCE_AUTH_WRITES modes:
 * - the account behind the token is read from storage at most once per request, however many of
 *   the global write gate, the route's session requirement and its optional session read look at
 *   it (the result is kept on the request, never between requests: each request reads again);
 * - statuses and bodies do not change: an active account is served as before, a deactivated or
 *   missing account is refused (401) or seen as signed out, and an account that cannot be read
 *   answers 500 where a session is required.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const SECRET = 'session-read-once-secret';
const mode = vi.hoisted(() => ({ enforce: true }));

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'session-read-once-secret',
    adminEmails: [],
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
vi.mock('../features', () => ({
  featureFlags: { PAPYR_MODE: 'team', FEATURE_TEAMS: true },
  isFeatureEnabled: () => true,
}));
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';
const s: any = storage;

const USER = 7;
const bearer = {
  Authorization: `Bearer ${jwt.sign({ id: USER, email: 'user@example.com' }, SECRET)}`,
};
const PAGE = { id: 12, title: 'Live', slug: 'live', content: 'c', blocks: [], tags: [] };

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});
afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  vi.clearAllMocks();
  s.db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([]),
  };
  s.getUserAccount.mockResolvedValue({ id: USER, email: 'user@example.com', isActive: true });
  s.checkPagePermission.mockResolvedValue(true);
  s.getWikiPage.mockResolvedValue(PAGE);
  s.updateWikiPage.mockImplementation(async (_id: number, data: any) => ({ ...PAGE, ...data }));
  s.getUserTeamIds.mockResolvedValue([4]);
  s.getUserTeamRole.mockResolvedValue('owner');
  s.updateTeam.mockImplementation(async (id: number, data: any) => ({ id, name: 'team', ...data }));
});

const accountReads = () => s.getUserAccount.mock.calls.length;

describe.each([true, false])('with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mode.enforce = enforce;
  });

  it('PUT /api/teams/:id reads the account once', async () => {
    const res = await request(app).put('/api/teams/4').set(bearer).send({ displayName: 'Renamed' });
    expect(res.status).toBe(200);
    expect(accountReads()).toBe(1);
  });

  it('GET /api/pages/:id reads the account once', async () => {
    const res = await request(app).get('/api/pages/12').set(bearer);
    expect(res.status).toBe(200);
    expect(accountReads()).toBe(1);
  });

  it('each request reads the account again (nothing is kept between requests)', async () => {
    await request(app).put('/api/teams/4').set(bearer).send({ displayName: 'One' });
    await request(app).put('/api/teams/4').set(bearer).send({ displayName: 'Two' });
    expect(accountReads()).toBe(2);
  });

  it('a deactivated account is refused on a write, as before', async () => {
    s.getUserAccount.mockResolvedValue({ id: USER, email: 'user@example.com', isActive: false });
    const team = await request(app).put('/api/teams/4').set(bearer).send({ displayName: 'X' });
    expect(team.status).toBe(401);
    expect(s.updateTeam).not.toHaveBeenCalled();
  });
});

// Without enforcement a page write does not read the session at all (the route asks for none), so
// the page write is counted with enforcement on.
describe('PUT /api/pages/:id with ENFORCE_AUTH_WRITES=true', () => {
  beforeEach(() => {
    mode.enforce = true;
  });

  it('reads the account once', async () => {
    const res = await request(app).put('/api/pages/12').set(bearer).send({ title: 'Edited' });
    expect(res.status).toBe(200);
    expect(accountReads()).toBe(1);
  });

  it('refuses a deactivated account, as before', async () => {
    s.getUserAccount.mockResolvedValue({ id: USER, email: 'user@example.com', isActive: false });
    const res = await request(app).put('/api/pages/12').set(bearer).send({ title: 'X' });
    expect(res.status).toBe(401);
    expect(s.updateWikiPage).not.toHaveBeenCalled();
  });
});

describe('an account that cannot be read', () => {
  beforeEach(() => {
    s.getUserAccount.mockRejectedValue(new Error('database unavailable'));
  });

  it('answers 500 on a write where a session is required (enforcement on), after one read', async () => {
    mode.enforce = true;
    const team = await request(app).put('/api/teams/4').set(bearer).send({ displayName: 'X' });
    expect([team.status, team.body]).toEqual([500, { message: 'Authentication check failed' }]);
    expect(accountReads()).toBe(1);
    expect(s.updateTeam).not.toHaveBeenCalled();
  });

  it('is a signed-out caller where the session is only read (enforcement off), after one read', async () => {
    mode.enforce = false;
    const team = await request(app).put('/api/teams/4').set(bearer).send({ displayName: 'X' });
    expect([team.status, team.body]).toEqual([401, { error: 'Authentication required' }]);
    expect(accountReads()).toBe(1);
    expect(s.updateTeam).not.toHaveBeenCalled();
  });
});
