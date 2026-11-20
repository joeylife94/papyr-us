/**
 * Page creation routes, route level with a mocked storage: every page records the account that
 * created it, and the server decides who that is.
 *
 * Rules under test, in both modes of ENFORCE_AUTH_WRITES:
 * - POST /api/pages, POST /api/pages/:id/duplicate and POST /api/pages/import/markdown answer 401
 *   without a session and write nothing;
 * - with a session, storage is asked to create the page for `{ userId: <the session's id> }`;
 * - an `author` or a `createdByUserId` in the request never reaches storage.
 * The same rules are proven against the real server by tests/security-page-creator.spec.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'page-creator-test-secret';

const mode = vi.hoisted(() => ({ enforce: true }));

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-creator-test-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    get enforceAuthForWrites() {
      return mode.enforce;
    },
    allowAdminPassword: false,
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
  featureFlags: {
    PAPYR_MODE: 'team',
    FEATURE_TEAMS: true,
    FEATURE_ADMIN: true,
    FEATURE_CALENDAR: true,
    FEATURE_TEMPLATES: false,
    FEATURE_AUTOMATION: true,
    FEATURE_NOTIFICATIONS: true,
    FEATURE_AI_SEARCH: true,
    FEATURE_COLLABORATION: false,
  },
  isFeatureEnabled: () => true,
}));

vi.mock('../services/workflow', async () => ({
  triggerWorkflows: vi.fn().mockResolvedValue(undefined),
  initWorkflowService: vi.fn(),
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const USER = { id: 41, email: 'creator@example.com' };
const SOURCE = {
  id: 100,
  title: 'Plan',
  slug: 'plan',
  content: 'intro',
  blocks: [],
  folder: 'docs',
  tags: [],
  author: 'someone-else@example.com',
  parentId: null,
  teamId: null,
  isPublished: true,
  metadata: {},
  deletedAt: null,
};

const as = (user: { id: number; email: string }) => ({
  Authorization: `Bearer ${jwt.sign({ id: user.id, email: user.email, role: 'user' }, TEST_SECRET)}`,
});

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  storage.getWikiPage.mockImplementation(async (id: number) => (id === SOURCE.id ? SOURCE : null));
  storage.getWikiPageBySlug.mockResolvedValue(undefined);
  storage.checkPagePermission.mockResolvedValue(true);
  storage.getUserTeamIds.mockResolvedValue([]);
  storage.createWikiPage.mockImplementation(async (page: any) => ({ ...page, id: 200 }));
  storage.duplicateWikiPage.mockImplementation(async (_id: number, page: any) => ({
    ...page,
    id: 201,
  }));
});

const pageBody = {
  title: 'New page',
  slug: 'new-page',
  content: 'hello',
  folder: 'docs',
  tags: [],
};

const routes = {
  'POST /api/pages': {
    send: (user?: typeof USER, extra: Record<string, unknown> = {}) => {
      const call = request(app)
        .post('/api/pages')
        .send({ ...pageBody, ...extra });
      return user ? call.set(as(user)) : call;
    },
    created: () => storage.createWikiPage,
    other: () => storage.duplicateWikiPage,
    pageArg: (mock: any) => mock.mock.calls[0][0],
    creatorArg: (mock: any) => mock.mock.calls[0][1],
  },
  'POST /api/pages/:id/duplicate': {
    send: (user?: typeof USER, extra: Record<string, unknown> = {}) => {
      const call = request(app).post(`/api/pages/${SOURCE.id}/duplicate`).send(extra);
      return user ? call.set(as(user)) : call;
    },
    created: () => storage.duplicateWikiPage,
    other: () => storage.createWikiPage,
    pageArg: (mock: any) => mock.mock.calls[0][1],
    creatorArg: (mock: any) => mock.mock.calls[0][2],
  },
  'POST /api/pages/import/markdown': {
    send: (user?: typeof USER, extra: Record<string, unknown> = {}) => {
      const call = request(app)
        .post('/api/pages/import/markdown')
        .send({ title: 'Imported', content: '# Imported\n\nbody', ...extra });
      return user ? call.set(as(user)) : call;
    },
    created: () => storage.createWikiPage,
    other: () => storage.duplicateWikiPage,
    pageArg: (mock: any) => mock.mock.calls[0][0],
    creatorArg: (mock: any) => mock.mock.calls[0][1],
  },
};

describe.each([true, false])('page creation with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mode.enforce = enforce;
  });

  describe.each(Object.entries(routes))('%s', (_name, route) => {
    it('answers 401 without a session and creates nothing', async () => {
      const res = await route.send();

      expect(res.status).toBe(401);
      expect(route.created()).not.toHaveBeenCalled();
      expect(route.other()).not.toHaveBeenCalled();
    });

    it('creates the page for the session account', async () => {
      const res = await route.send(USER);

      expect(res.status).toBe(201);
      expect(route.created()).toHaveBeenCalledTimes(1);
      expect(route.creatorArg(route.created())).toEqual({ userId: USER.id });
    });

    it('does not pass an author from the request to storage', async () => {
      const res = await route.send(USER, { author: 'someone@example.com' });

      expect(res.status).toBe(201);
      expect(route.pageArg(route.created())).not.toHaveProperty('author');
      expect(route.creatorArg(route.created())).toEqual({ userId: USER.id });
    });

    it('does not pass a creator id from the request to storage', async () => {
      const res = await route.send(USER, { createdByUserId: 999 });

      expect(res.status).toBe(201);
      expect(route.pageArg(route.created())).not.toHaveProperty('createdByUserId');
      expect(route.creatorArg(route.created())).toEqual({ userId: USER.id });
    });
  });
});
