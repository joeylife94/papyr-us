/**
 * POST /api/pages/:id/duplicate, route level with a mocked storage. Copying the page's inline
 * databases (#113 §4) in one transaction is proven against PostgreSQL by
 * tests/integration-layer4/page-duplicate.test.ts.
 *
 * Rules under test:
 * - the copy goes through storage.duplicateWikiPage (page and databases together), never a
 *   plain page create that would keep the source's database ids;
 * - reading the source is required, as before;
 * - a failed copy answers the generic 500, without internal details.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'page-duplicate-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-duplicate-test-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    enforceAuthForWrites: true,
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

const READER = { id: 1, email: 'reader@example.com' };
const OUTSIDER = { id: 2, email: 'outsider@example.com' };
const PAGE = 100;

const blocks = [
  { id: 'p', type: 'paragraph', content: 'intro', properties: {}, order: 0, children: [] },
  { id: 'db', type: 'database_inline', content: 'DB', properties: { schemaId: 7 }, order: 1 },
];
const source = {
  id: PAGE,
  title: 'Plan',
  slug: 'plan',
  content: 'intro',
  blocks,
  folder: 'docs',
  tags: ['t'],
  author: 'owner@example.com',
  parentId: 5,
  teamId: 10,
  isPublished: true,
  metadata: { a: 1 },
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
  storage.getWikiPage.mockImplementation(async (id: number) => (id === PAGE ? source : undefined));
  storage.getWikiPageBySlug.mockImplementation(async (slug: string) =>
    slug === 'plan-copy' ? { id: 101, slug } : undefined
  );
  storage.checkPagePermission.mockImplementation(
    async (userId: number | undefined, pageId: number) => userId === READER.id && pageId === PAGE
  );
  storage.duplicateWikiPage.mockImplementation(async (_id: number, page: any) => ({
    ...page,
    id: 102,
  }));
});

describe('POST /api/pages/:id/duplicate', () => {
  it('copies the page and its databases together, owned by the caller', async () => {
    const res = await request(app).post(`/api/pages/${PAGE}/duplicate`).set(as(READER));

    expect(res.status).toBe(201);
    const page = {
      title: 'Plan (Copy)',
      slug: 'plan-copy-1',
      content: 'intro',
      blocks,
      folder: 'docs',
      tags: ['t'],
      author: READER.email,
      parentId: 5,
      teamId: 10,
      isPublished: false,
      metadata: { a: 1 },
    };
    expect(storage.duplicateWikiPage).toHaveBeenCalledTimes(1);
    expect(storage.duplicateWikiPage).toHaveBeenCalledWith(PAGE, page, READER.id);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
    expect(res.body).toEqual({ ...page, id: 102 });
  });

  it('needs read access to the page', async () => {
    const res = await request(app).post(`/api/pages/${PAGE}/duplicate`).set(as(OUTSIDER));

    expect(res.status).toBe(403);
    expect(storage.duplicateWikiPage).not.toHaveBeenCalled();
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });

  it('answers a failed copy with the generic error only', async () => {
    storage.duplicateWikiPage.mockRejectedValue(
      new Error('insert or update on table "database_rows" violates foreign key constraint')
    );

    const res = await request(app).post(`/api/pages/${PAGE}/duplicate`).set(as(READER));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to duplicate page' });
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });
});
