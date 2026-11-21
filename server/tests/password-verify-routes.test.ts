/**
 * Password verification routes (POST /api/teams/verify, POST /api/directory/verify).
 *
 * Rules under test, in both ENFORCE_AUTH_WRITES modes, with real tokens and a mocked storage:
 * - both need a session: a request without one, with an invalid token, or from a deactivated
 *   account answers 401 and nothing is verified; an account that cannot be read answers 500;
 * - a team is looked up in the caller's organization only: storage is asked with that organization,
 *   an account without an organization gets `{ isValid: false }` without any lookup, and a team of
 *   another organization answers exactly as a team that does not exist;
 * - each route has its own per-account allowance (10 a minute), after which it answers 429; another
 *   account is unaffected, and requests without a session are not counted.
 *
 * The directory table carries no organization, so that lookup stays by name (stated in the route).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const SECRET = 'password-verify-secret';
const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'password-verify-secret',
  adminEmails: [] as string[],
  enforceAuthForWrites: false,
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
  featureFlags: { PAPYR_MODE: 'team', FEATURE_TEAMS: true, FEATURE_ADMIN: true },
  isFeatureEnabled: () => true,
}));
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';
const s: any = storage;

const bearer = (id: number) => ({
  Authorization: `Bearer ${jwt.sign({ id, email: `user-${id}@example.com` }, SECRET)}`,
});

// The team that exists, and the organization it is in
const TEAM = { name: 'locked-team', organizationId: 1 };
const CALLER_ORGANIZATION = 1;

let app: Express;
let server: http.Server;
let nextAccount = 100;

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
  mockConfig.rateLimitEnabled = false;
  s.getUserAccount.mockImplementation(async (id: number) => ({
    id,
    email: `user-${id}@example.com`,
    isActive: true,
  }));
  s.getUserOrganizationId.mockResolvedValue(CALLER_ORGANIZATION);
  // Like the real lookup: the team is found in the named organization only
  s.verifyTeamPassword.mockImplementation(
    async (name: string, password: string, organizationId: number) =>
      name === TEAM.name && organizationId === TEAM.organizationId && password === 'right'
  );
  s.verifyDirectoryPassword.mockImplementation(
    async (name: string, password: string) => name === 'docs' && password === 'right'
  );
});

describe.each([true, false])('with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mockConfig.enforceAuthForWrites = enforce;
  });

  describe.each([
    ['/api/teams/verify', { teamName: TEAM.name, password: 'right' }, 'verifyTeamPassword'],
    [
      '/api/directory/verify',
      { directoryName: 'docs', password: 'right' },
      'verifyDirectoryPassword',
    ],
  ])('POST %s needs a session', (path, body, method) => {
    it('answers 401 without a session and verifies nothing', async () => {
      const res = await request(app).post(path).send(body);
      expect(res.status).toBe(401);
      expect(s[method]).not.toHaveBeenCalled();
    });

    it('answers 401 for a token that does not verify', async () => {
      const forged = jwt.sign({ id: 5 }, 'another-secret');
      const res = await request(app)
        .post(path)
        .set({ Authorization: `Bearer ${forged}` })
        .send(body);
      expect(res.status).toBe(401);
      expect(s[method]).not.toHaveBeenCalled();
    });

    it('answers 401 for a deactivated account and verifies nothing', async () => {
      s.getUserAccount.mockResolvedValue({ id: 5, email: 'x@example.com', isActive: false });
      const res = await request(app).post(path).set(bearer(5)).send(body);
      expect(res.status).toBe(401);
      expect(s[method]).not.toHaveBeenCalled();
    });

    it('answers 500 when the account cannot be read, and verifies nothing', async () => {
      s.getUserAccount.mockRejectedValue(new Error('database unavailable'));
      const res = await request(app).post(path).set(bearer(5)).send(body);
      expect(res.status).toBe(500);
      expect(s[method]).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/teams/verify', () => {
    const verify = (account: number, body: unknown) =>
      request(app)
        .post('/api/teams/verify')
        .set(bearer(account))
        .send(body as object);

    it('answers { isValid: true } for the right password of a team in the caller organization', async () => {
      const res = await verify(7, { teamName: TEAM.name, password: 'right' });
      expect([res.status, res.body]).toEqual([200, { isValid: true }]);
      expect(s.verifyTeamPassword).toHaveBeenCalledWith(TEAM.name, 'right', CALLER_ORGANIZATION);
    });

    it('answers { isValid: false } for a wrong password', async () => {
      const res = await verify(7, { teamName: TEAM.name, password: 'wrong' });
      expect([res.status, res.body]).toEqual([200, { isValid: false }]);
    });

    it('looks the team up in the caller organization only', async () => {
      s.getUserOrganizationId.mockResolvedValue(2);
      const otherOrganization = await verify(7, { teamName: TEAM.name, password: 'right' });
      const missing = await verify(7, { teamName: 'no-such-team', password: 'right' });
      expect(s.verifyTeamPassword).toHaveBeenNthCalledWith(1, TEAM.name, 'right', 2);
      expect([otherOrganization.status, otherOrganization.body]).toEqual([200, { isValid: false }]);
      expect([otherOrganization.status, otherOrganization.body]).toEqual([
        missing.status,
        missing.body,
      ]);
    });

    it('answers { isValid: false } for an account without an organization, without a lookup', async () => {
      s.getUserOrganizationId.mockResolvedValue(null);
      const res = await verify(7, { teamName: TEAM.name, password: 'right' });
      expect([res.status, res.body]).toEqual([200, { isValid: false }]);
      expect(s.verifyTeamPassword).not.toHaveBeenCalled();
    });

    it('answers { isValid: false } for a name or password that is not text', async () => {
      for (const body of [
        { teamName: { $ne: '' }, password: 'right' },
        { teamName: TEAM.name, password: { $ne: '' } },
        { teamName: TEAM.name },
        {},
      ]) {
        const res = await verify(7, body);
        expect([res.status, res.body], JSON.stringify(body)).toEqual([200, { isValid: false }]);
      }
      expect(s.verifyTeamPassword).not.toHaveBeenCalled();
    });

    it('answers 500 when the lookup fails', async () => {
      s.verifyTeamPassword.mockRejectedValue(new Error('database unavailable'));
      const res = await verify(7, { teamName: TEAM.name, password: 'right' });
      expect(res.status).toBe(500);
    });

    it('allows 10 verifications a minute per account, then answers 429; another account is unaffected', async () => {
      mockConfig.rateLimitEnabled = true;
      const account = nextAccount++;
      const other = nextAccount++;
      for (let i = 0; i < 10; i++) {
        expect((await verify(account, { teamName: TEAM.name, password: 'wrong' })).status).toBe(
          200
        );
      }
      const refused = await verify(account, { teamName: TEAM.name, password: 'right' });
      expect(refused.status).toBe(429);
      expect(refused.body).not.toHaveProperty('isValid');
      expect((await verify(other, { teamName: TEAM.name, password: 'right' })).status).toBe(200);
    });

    it('does not count requests without a session against an account', async () => {
      mockConfig.rateLimitEnabled = true;
      for (let i = 0; i < 15; i++) {
        expect(
          (await request(app).post('/api/teams/verify').send({ teamName: TEAM.name })).status
        ).toBe(401);
      }
    });
  });

  describe('POST /api/directory/verify', () => {
    const verify = (account: number, body: unknown) =>
      request(app)
        .post('/api/directory/verify')
        .set(bearer(account))
        .send(body as object);

    it('answers { success } for a signed-in caller', async () => {
      const right = await verify(7, { directoryName: 'docs', password: 'right' });
      const wrong = await verify(7, { directoryName: 'docs', password: 'wrong' });
      expect([right.status, right.body]).toEqual([200, { success: true }]);
      expect([wrong.status, wrong.body]).toEqual([200, { success: false }]);
    });

    it('allows 10 verifications a minute per account, then answers 429; the team route has its own allowance', async () => {
      mockConfig.rateLimitEnabled = true;
      const account = nextAccount++;
      const other = nextAccount++;
      for (let i = 0; i < 10; i++) {
        expect((await verify(account, { directoryName: 'docs', password: 'wrong' })).status).toBe(
          200
        );
      }
      expect((await verify(account, { directoryName: 'docs', password: 'right' })).status).toBe(
        429
      );
      expect((await verify(other, { directoryName: 'docs', password: 'right' })).status).toBe(200);
      const teamRoute = await request(app)
        .post('/api/teams/verify')
        .set(bearer(account))
        .send({ teamName: TEAM.name, password: 'right' });
      expect(teamRoute.status).toBe(200);
    });
  });
});
