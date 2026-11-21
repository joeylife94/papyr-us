/**
 * Comment creation and editing are limited per verified account: 30 new comments and 60 edits a
 * minute, in both modes of ENFORCE_AUTH_WRITES. A person typing never reaches either. The limit
 * follows the account, not the address, and a request without a session is never counted. (The
 * shared account limiter is switched on by RATE_LIMIT_ENABLED, and by default in production only;
 * this test switches it on, as the other account-limited routes' tests do.)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'comment-rate-secret';
const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'comment-rate-secret',
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
  featureFlags: { PAPYR_MODE: 'team', FEATURE_TEAMS: true, FEATURE_NOTIFICATIONS: true },
  isFeatureEnabled: () => true,
}));
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

let app: Express;
let server: http.Server;
let nextAccount = 1000;

const cookieFor = (id: number) => ({
  Cookie: [
    `accessToken=${jwt.sign({ id, email: `u${id}@example.com`, role: 'user' }, TEST_SECRET)}`,
  ],
});

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.resetAllMocks();
  storage.getUserAccount.mockImplementation(async (id: number) => ({
    id,
    email: `u${id}@example.com`,
    isActive: true,
  }));
  storage.getUserOrganizationId.mockResolvedValue(1);
  storage.checkPagePermission.mockResolvedValue(true);
  storage.getWikiPage.mockResolvedValue({
    id: 10,
    title: 'P',
    organizationId: 1,
    createdByUserId: null,
  });
  storage.getReadableOrganizationMembers.mockResolvedValue(new Map());
  storage.getActiveAccountNames.mockResolvedValue(new Map());
  storage.createComment.mockImplementation(async (data: any) => ({ id: 1, ...data }));
  storage.getComment.mockImplementation(async (id: number) => ({
    id,
    pageId: 10,
    authorUserId: currentAuthor,
    content: 'x',
  }));
  storage.updateComment.mockImplementation(async (id: number, data: any) => ({ id, ...data }));
});

let currentAuthor = 0;

for (const enforce of [true, false]) {
  describe(`comment limits (ENFORCE_AUTH_WRITES=${enforce})`, () => {
    beforeEach(() => {
      mockConfig.enforceAuthForWrites = enforce;
    });

    it('allows 30 new comments a minute per account, then answers 429; another account is unaffected', async () => {
      const account = nextAccount++;
      const other = nextAccount++;
      const post = (id: number) =>
        request(app).post('/api/pages/10/comments').set(cookieFor(id)).send({ content: 'hi' });
      for (let i = 0; i < 30; i++) expect((await post(account)).status).toBe(201);
      expect((await post(account)).status).toBe(429);
      expect((await post(other)).status).toBe(201);
    });

    it('allows 60 edits a minute per account, then answers 429', async () => {
      const account = nextAccount++;
      currentAuthor = account;
      const put = (id: number) =>
        request(app).put('/api/comments/1').set(cookieFor(id)).send({ content: 'edit' });
      for (let i = 0; i < 60; i++) expect((await put(account)).status).toBe(200);
      expect((await put(account)).status).toBe(429);
    });

    it('does not count requests without a session', async () => {
      for (let i = 0; i < 35; i++) {
        expect(
          (await request(app).post('/api/pages/10/comments').send({ content: 'hi' })).status
        ).not.toBe(429);
      }
    });
  });
}
