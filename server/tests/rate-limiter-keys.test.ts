/**
 * The shared rate limiters count a request under a verified account, or else under the client
 * address; a token that is not verified never names an account.
 *
 * Rules under test (RATE_LIMIT_ENABLED on; limits and the admin address list unchanged):
 * - a request with a valid access token is counted under its account, whatever the address;
 * - a request with no token, or a token that does not verify (another secret, expired, a refresh
 *   token, no account id, not a token) is counted under the client address, and cannot use up the
 *   allowance of the account its claims name;
 * - two accounts behind one address have an allowance each; one account from two addresses has one;
 * - the same holds on the real routes behind rlAuth (sign-in) and rlAdmin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const SECRET = 'rate-limiter-keys-secret';
const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'rate-limiter-keys-secret',
  adminEmails: [] as string[],
  enforceAuthForWrites: true,
  rateLimitEnabled: true,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 100000,
  adminIpWhitelist: [] as string[],
  port: 5001,
  host: '0.0.0.0',
  isProduction: false,
  isReplit: false,
}));

vi.mock('../config', () => ({ config: mockConfig }));
vi.mock('../features', () => ({
  featureFlags: { PAPYR_MODE: 'team', FEATURE_TEAMS: true, FEATURE_ADMIN: true },
  isFeatureEnabled: () => true,
}));
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { buildRateLimiter } from '../middleware';
import { registerRoutes } from '../routes';
import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const tokenFor = (id: number, secret = SECRET, extra: Record<string, unknown> = {}) =>
  jwt.sign({ id, email: `u${id}@example.com`, role: 'user', ...extra }, secret, {
    expiresIn: '1h',
  });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Not tokens that verify, each naming account `id` in its claims. */
const unverifiedTokens = (id: number): Array<[string, string]> => [
  ['signed with another secret', tokenFor(id, 'another-secret')],
  ['expired', jwt.sign({ id, email: `u${id}@example.com` }, SECRET, { expiresIn: -60 })],
  ['a refresh token', jwt.sign({ id, type: 'refresh' }, SECRET, { expiresIn: '30d' })],
  [
    'without a signature',
    `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id, email: `u${id}@example.com` })).toString('base64url')}.`,
  ],
  ['not a token', 'not-a-token'],
];

describe('buildRateLimiter', () => {
  let server: http.Server;
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfig.adminIpWhitelist = [];
    app = express();
    app.set('trust proxy', true);
    app.use(cookieParser());
    app.get('/limited', buildRateLimiter({ windowMs: 60_000, max: 2 }), (_req, res) => {
      res.json({ ok: true });
    });
    server = http.createServer(app);
  });
  afterEach(() => {
    server.close();
  });

  const hit = (ip: string, headers: Record<string, string> = {}) =>
    request(server).get('/limited').set('X-Forwarded-For', ip).set(headers);
  const statuses = async (n: number, ip: string, headers: Record<string, string> = {}) => {
    const out: number[] = [];
    for (let i = 0; i < n; i += 1) out.push((await hit(ip, headers)).status);
    return out;
  };

  it('counts a valid access token under its account, from any address', async () => {
    const token = bearer(tokenFor(21));
    expect(await statuses(2, '10.0.0.1', token)).toEqual([200, 200]);
    expect((await hit('10.0.0.2', token)).status).toBe(429);
    expect((await hit('10.0.0.3', token)).status).toBe(429);
  });

  it('gives two accounts behind one address an allowance each', async () => {
    expect(await statuses(3, '10.0.1.1', bearer(tokenFor(31)))).toEqual([200, 200, 429]);
    expect(await statuses(3, '10.0.1.1', bearer(tokenFor(32)))).toEqual([200, 200, 429]);
  });

  it('counts a request without a token under the client address', async () => {
    expect(await statuses(3, '10.0.2.1')).toEqual([200, 200, 429]);
    expect(await statuses(2, '10.0.2.2')).toEqual([200, 200]);
    // and the address's allowance is not the allowance of an account behind it
    expect(await statuses(2, '10.0.2.1', bearer(tokenFor(41)))).toEqual([200, 200]);
  });

  it.each(unverifiedTokens(51))(
    'a token %s is counted under the address and never uses up account 51',
    async (_label, token) => {
      const flood = await statuses(4, '10.0.3.1', bearer(token));
      expect(flood).toEqual([200, 200, 429, 429]);
      // the account the token names is untouched, from the same address and from another one
      expect(await statuses(2, '10.0.3.1', bearer(tokenFor(51)))).toEqual([200, 200]);
      expect((await hit('10.0.3.9', bearer(tokenFor(51)))).status).toBe(429);
    }
  );

  it('a forged token in the session cookie is counted like one in the header', async () => {
    const forged = unverifiedTokens(61)[0][1];
    expect(await statuses(3, '10.0.4.1', { Cookie: `accessToken=${forged}` })).toEqual([
      200, 200, 429,
    ]);
    expect(await statuses(2, '10.0.4.1', { Cookie: `accessToken=${tokenFor(61)}` })).toEqual([
      200, 200,
    ]);
  });

  it('changing what a forged token claims does not give it a fresh allowance', async () => {
    const results: number[] = [];
    for (const id of [71, 72, 73, 74]) {
      results.push((await hit('10.0.5.1', bearer(tokenFor(id, 'another-secret')))).status);
    }
    expect(results).toEqual([200, 200, 429, 429]);
  });

  it('is switched off by RATE_LIMIT_ENABLED and skips the admin address list, as before', async () => {
    mockConfig.rateLimitEnabled = false;
    expect(await statuses(4, '10.0.6.1')).toEqual([200, 200, 200, 200]);
    mockConfig.rateLimitEnabled = true;
    mockConfig.adminIpWhitelist = ['10.0.6.2'];
    expect(await statuses(4, '10.0.6.2')).toEqual([200, 200, 200, 200]);
  });
});

describe('the shared limiters on the real routes', () => {
  let server: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    // A new application per test: its limiters start empty
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    ({ httpServer: server } = await registerRoutes(app, storage));
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const login = (headers: Record<string, string> = {}) =>
    request(server)
      .post('/api/auth/login')
      .set(headers)
      .send({ email: 'x@example.com', password: 'p' });

  it('sign-in (rlAuth, 20 a minute): forged tokens naming an account do not use up its allowance', async () => {
    const forged = unverifiedTokens(81)[0][1];
    const flood: number[] = [];
    for (let i = 0; i < 22; i += 1) flood.push((await login(bearer(forged))).status);
    expect(flood.slice(0, 20).every((s) => s !== 429)).toBe(true);
    expect(flood.slice(20)).toEqual([429, 429]);
    // account 81 itself is not limited by that flood
    expect((await login(bearer(tokenFor(81)))).status).not.toBe(429);
  });

  it('sign-in (rlAuth): requests of a verified account do not use up the address allowance', async () => {
    for (let i = 0; i < 21; i += 1) await login(bearer(tokenFor(91)));
    expect((await login(bearer(tokenFor(91)))).status).toBe(429);
    expect((await login()).status).not.toBe(429);
  });

  it('admin routes (rlAdmin, 30 a minute) count a forged token under the address too', async () => {
    const forged = unverifiedTokens(101)[0][1];
    const flood: number[] = [];
    for (let i = 0; i < 32; i += 1) {
      flood.push((await request(server).get('/api/admin/session').set(bearer(forged))).status);
    }
    expect(flood.slice(30)).toEqual([429, 429]);
    const own = await request(server)
      .get('/api/admin/session')
      .set(bearer(tokenFor(101)));
    expect(own.status).not.toBe(429);
  });
});
