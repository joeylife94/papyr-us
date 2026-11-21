/**
 * The `state` of the Google and GitHub sign-in flows, through the real routes and the real
 * strategies (only the two requests to the provider are stood in).
 *
 * Rules under test:
 * - every sign-in start sets a random state in a short-lived (10 minutes) httpOnly SameSite=Lax
 *   cookie (`__Host-` and path `/` on HTTPS) and sends the same value to the provider;
 * - the callback proceeds only when the returned state equals the cookie's; a missing or different
 *   state, or no cookie, goes to /login?error=oauth_state and no account is looked up;
 * - the cookie is cleared on every return, accepted or refused;
 * - two starts make two different states.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import passport from 'passport';

const mode = vi.hoisted(() => ({ secure: false }));
// The real configuration asks for a signing secret once it is in production mode
process.env.JWT_SECRET = process.env.JWT_SECRET || 'oauth-state-test-secret-0123456789abcdef';

vi.mock('../config', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const config = Object.create(actual.config, {
    googleClientId: { value: 'google-id' },
    googleClientSecret: { value: 'google-secret' },
    githubClientId: { value: 'github-id' },
    githubClientSecret: { value: 'github-secret' },
    isProduction: { get: () => mode.secure },
  });
  return { ...actual, config };
});

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  const mod = mockStorageModuleFrom(actual);
  mod.storage.db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  return mod;
});

vi.mock('../organizations', () => ({
  createUserInDefaultOrganization: vi.fn(async (_db: unknown, values: any) => ({
    id: 77,
    isActive: true,
    ...values,
  })),
  defaultOrganizationId: vi.fn(async () => 1),
}));

import { registerRoutes } from '../routes';
import { storage } from '../storage';

const store: any = storage;
const PROVIDERS = {
  google: { host: 'accounts.google.com', profile: { id: 'g-1', displayName: 'Old Person' } },
  github: {
    host: 'github.com',
    profile: { id: 'h-1', displayName: 'Old Person', username: 'old' },
  },
} as const;

let app: express.Express;
let server: http.Server;
let tokenRequests = 0;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  const result = await registerRoutes(app, storage);
  server = result.httpServer;
  // The provider's side: a code buys a token, a token buys the profile of an existing account.
  for (const [name, { profile }] of Object.entries(PROVIDERS)) {
    const strategy = (passport as any)._strategy(name);
    strategy._oauth2.getOAuthAccessToken = (_code: string, _params: unknown, cb: any) => {
      tokenRequests += 1;
      cb(null, 'access', 'refresh', {});
    };
    strategy._loadUserProfile = (_token: string, cb: any) =>
      cb(null, {
        ...profile,
        _json: { email: 'old@example.com' },
        emails: [{ value: 'old@example.com', verified: true, primary: true }],
      });
  }
});
afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  vi.clearAllMocks();
  tokenRequests = 0;
  store.db.select.mockReturnThis();
  store.db.from.mockReturnThis();
  store.db.where.mockResolvedValue([{ id: 5, email: 'old@example.com', isActive: true }]);
});
afterEach(() => {
  mode.secure = false;
});

function setCookies(res: request.Response): string[] {
  const header = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  return Array.isArray(header) ? header : header ? [header] : [];
}
function cookieNamed(res: request.Response, name: string): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}
function valueOf(cookie: string): string {
  return cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
}
async function start(provider: 'google' | 'github') {
  const res = await request(server).get(`/api/auth/${provider}`);
  const stateInUrl = new URL(res.headers.location).searchParams.get('state');
  return { res, stateInUrl };
}
const isCleared = (cookie: string | undefined) =>
  !!cookie && /^[^=]+=;/.test(cookie) && /Expires=Thu, 01 Jan 1970/.test(cookie);

describe.each(['google', 'github'] as const)('%s sign-in state', (provider) => {
  const COOKIE = 'oauth_state';

  it('a start sets a random state in a short-lived httpOnly SameSite=Lax cookie and sends the same value to the provider', async () => {
    const { res, stateInUrl } = await start(provider);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).host).toBe(PROVIDERS[provider].host);
    const cookie = cookieNamed(res, COOKIE);
    expect(cookie).toBeDefined();
    expect(stateInUrl).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(valueOf(cookie!)).toBe(stateInUrl);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=600(;|$)/);
    expect(cookie).toMatch(/Path=\/api\/auth(;|$)/);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('two starts make two different states', async () => {
    const a = await start(provider);
    const b = await start(provider);
    expect(a.stateInUrl).not.toBe(b.stateInUrl);
  });

  it('on HTTPS the cookie is __Host-prefixed, Secure, path / and without Domain', async () => {
    mode.secure = true;
    const { res, stateInUrl } = await start(provider);
    const cookie = cookieNamed(res, '__Host-oauth_state');
    expect(cookie).toBeDefined();
    expect(valueOf(cookie!)).toBe(stateInUrl);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\/(;|$)/);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookieNamed(res, COOKIE)).toBeUndefined();
  });

  it('a callback with the state of the same browser signs in and clears the cookie', async () => {
    const { stateInUrl } = await start(provider);
    const res = await request(server)
      .get(`/api/auth/${provider}/callback`)
      .query({ code: 'c', state: stateInUrl! })
      .set('Cookie', `${COOKIE}=${stateInUrl}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(cookieNamed(res, 'accessToken')).toBeDefined();
    expect(isCleared(cookieNamed(res, COOKIE))).toBe(true);
    expect(tokenRequests).toBe(1);
  });

  it('on HTTPS the callback reads and clears the __Host- cookie', async () => {
    mode.secure = true;
    const { stateInUrl } = await start(provider);
    const res = await request(server)
      .get(`/api/auth/${provider}/callback`)
      .query({ code: 'c', state: stateInUrl! })
      .set('Cookie', `__Host-oauth_state=${stateInUrl}`);
    expect(res.headers.location).toBe('/');
    expect(isCleared(cookieNamed(res, '__Host-oauth_state'))).toBe(true);
  });

  const refused = [
    ['no state returned', (s: string) => ({ query: { code: 'c' }, cookie: `${COOKIE}=${s}` })],
    [
      'an empty state returned',
      (s: string) => ({ query: { code: 'c', state: '' }, cookie: `${COOKIE}=${s}` }),
    ],
    [
      'a different state returned',
      (s: string) => ({ query: { code: 'c', state: `${s}x` }, cookie: `${COOKIE}=${s}` }),
    ],
    [
      'a state of another start returned',
      (_s: string) => ({
        query: { code: 'c', state: 'b'.repeat(43) },
        cookie: `${COOKIE}=${'a'.repeat(43)}`,
      }),
    ],
    ['no cookie', (s: string) => ({ query: { code: 'c', state: s }, cookie: undefined })],
    ['an empty cookie', (s: string) => ({ query: { code: 'c', state: s }, cookie: `${COOKIE}=` })],
    [
      'the cookie of the other protocol mode only',
      (s: string) => ({ query: { code: 'c', state: s }, cookie: `__Host-oauth_state=${s}` }),
    ],
  ] as const;

  it.each(refused)(
    '%s is refused with oauth_state and nothing is looked up',
    async (_label, build) => {
      const { stateInUrl } = await start(provider);
      const { query, cookie } = build(stateInUrl!);
      let req = request(server).get(`/api/auth/${provider}/callback`).query(query);
      if (cookie) req = req.set('Cookie', cookie);
      const res = await req;
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login?error=oauth_state');
      expect(cookieNamed(res, 'accessToken')).toBeUndefined();
      expect(cookieNamed(res, 'refreshToken')).toBeUndefined();
      expect(isCleared(cookieNamed(res, COOKIE))).toBe(true);
      expect(tokenRequests).toBe(0);
      expect(store.db.where).not.toHaveBeenCalled();
    }
  );

  it('a state is used for one sign-in: the cleared cookie cannot be replayed from this browser', async () => {
    const { stateInUrl } = await start(provider);
    const first = await request(server)
      .get(`/api/auth/${provider}/callback`)
      .query({ code: 'c', state: stateInUrl! })
      .set('Cookie', `${COOKIE}=${stateInUrl}`);
    expect(first.headers.location).toBe('/');
    // the browser dropped the cleared cookie, so the same returned state has nothing to match
    const replay = await request(server)
      .get(`/api/auth/${provider}/callback`)
      .query({ code: 'c', state: stateInUrl! });
    expect(replay.headers.location).toBe('/login?error=oauth_state');
  });

  it('a provider error return clears the cookie too', async () => {
    const { stateInUrl } = await start(provider);
    const res = await request(server)
      .get(`/api/auth/${provider}/callback`)
      .query({ error: 'access_denied', state: stateInUrl! })
      .set('Cookie', `${COOKIE}=${stateInUrl}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
    expect(isCleared(cookieNamed(res, COOKIE))).toBe(true);
  });
});
