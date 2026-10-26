/**
 * Page icons (#103 E4) on every write path that can set one: POST /api/pages, PUT /api/pages/:id
 * and PUT /api/pages/:id/autosave accept exactly one emoji, or null to clear it, and reject
 * anything else before storage is touched. An icon-only autosave records no version, opens no
 * editing session and so fires no workflow. Route level, with mocked storage; the migration and
 * the stored value are proven against PostgreSQL by
 * tests/integration-layer4/page-icon-migration.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { hasOpenEditSession, resetEditSessions } from '../services/page-save';

const TEST_SECRET = 'page-icon-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-icon-test-secret',
    adminPassword: 'test-admin',
    adminEmails: ['admin@example.com'],
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
import { triggerWorkflows } from '../services/workflow';
const storage: any = (storageModule as any).storage;

const EDITOR = { id: 2, email: 'editor@example.com' };
const VIEWER = { id: 3, email: 'viewer@example.com' };
const PAGE = 100;

const page = {
  id: PAGE,
  title: 'Plan',
  slug: 'plan',
  content: 'c',
  blocks: [],
  folder: 'docs',
  tags: [],
  author: EDITOR.email,
  teamId: null,
  icon: null,
};

const as = (user: { id: number; email: string }) => ({
  Authorization: `Bearer ${jwt.sign({ id: user.id, email: user.email, role: 'user' }, TEST_SECRET, { expiresIn: '1h' })}`,
});

const INVALID_ICONS = ['', 'abc', '문서', '🔥🔥', ' 🔥', '<img src=x onerror=alert(1)>', 42];

let app: Express;
let server: http.Server;
let versionInserts: ReturnType<typeof vi.fn>;

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
  resetEditSessions();
  storage.checkPagePermission.mockImplementation(
    async (userId: number | undefined) => userId === EDITOR.id
  );
  storage.getUserTeamIds.mockResolvedValue([]);
  storage.getWikiPage.mockImplementation(async (id: number) => ({ ...page, id }));
  storage.updateWikiPage.mockImplementation(async (id: number, data: object) => ({
    ...page,
    id,
    ...data,
  }));
  storage.createWikiPage.mockImplementation(async (data: object) => ({ id: 900, ...data }));
  // Version snapshots (page-save's storage store) go through db.select/db.insert.
  versionInserts = vi.fn(async () => undefined);
  storage.db.select = vi.fn(() => ({ from: () => ({ where: async () => [{ maxVersion: 0 }] }) }));
  storage.db.insert = vi.fn(() => ({ values: versionInserts }));
});

const newPage = (extra: object) => ({
  title: 'Iconic',
  slug: 'iconic',
  content: '',
  folder: 'docs',
  author: EDITOR.email,
  tags: [],
  ...extra,
});

describe('POST /api/pages', () => {
  it('creates a page with one emoji as its icon, or none', async () => {
    const withIcon = await request(app)
      .post('/api/pages')
      .set(as(EDITOR))
      .send(newPage({ icon: '🧑🏽‍💻' }));
    expect(withIcon.status).toBe(201);
    expect(storage.createWikiPage.mock.calls[0][0]).toMatchObject({ icon: '🧑🏽‍💻' });

    const withNull = await request(app)
      .post('/api/pages')
      .set(as(EDITOR))
      .send(newPage({ icon: null }));
    expect(withNull.status).toBe(201);
  });

  it('rejects an icon that is not exactly one emoji', async () => {
    for (const icon of INVALID_ICONS) {
      const res = await request(app).post('/api/pages').set(as(EDITOR)).send(newPage({ icon }));
      expect(res.status, JSON.stringify(icon)).toBe(400);
    }
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });
});

describe('PUT /api/pages/:id', () => {
  it('sets and clears the icon', async () => {
    const set = await request(app).put(`/api/pages/${PAGE}`).set(as(EDITOR)).send({ icon: '📚' });
    expect(set.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenLastCalledWith(PAGE, { icon: '📚' });

    const cleared = await request(app)
      .put(`/api/pages/${PAGE}`)
      .set(as(EDITOR))
      .send({ icon: null });
    expect(cleared.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenLastCalledWith(PAGE, { icon: null });
  });

  it('rejects an invalid icon without writing', async () => {
    for (const icon of INVALID_ICONS) {
      const res = await request(app).put(`/api/pages/${PAGE}`).set(as(EDITOR)).send({ icon });
      expect(res.status, JSON.stringify(icon)).toBe(400);
    }
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});

describe('PUT /api/pages/:id/autosave', () => {
  it('saves an icon-only change with no version, no editing session and no workflow', async () => {
    const res = await request(app)
      .put(`/api/pages/${PAGE}/autosave`)
      .set(as(EDITOR))
      .send({ icon: '🚀' });
    expect(res.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenCalledWith(PAGE, { icon: '🚀' });
    expect(versionInserts).not.toHaveBeenCalled();
    expect(hasOpenEditSession(PAGE)).toBe(false);

    // Leaving the page has no session to close, so no page_updated workflow fires.
    const checkpoint = await request(app).post(`/api/pages/${PAGE}/checkpoint`).set(as(EDITOR));
    expect(checkpoint.body).toEqual({ checkpointed: false });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(triggerWorkflows).not.toHaveBeenCalled();

    const cleared = await request(app)
      .put(`/api/pages/${PAGE}/autosave`)
      .set(as(EDITOR))
      .send({ icon: null });
    expect(cleared.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenLastCalledWith(PAGE, { icon: null });
  });

  it('still versions a title edit (control for the check above)', async () => {
    const res = await request(app)
      .put(`/api/pages/${PAGE}/autosave`)
      .set(as(EDITOR))
      .send({ title: 'Renamed' });
    expect(res.status).toBe(200);
    expect(versionInserts).toHaveBeenCalledTimes(1);
    expect(hasOpenEditSession(PAGE)).toBe(true);
  });

  it('rejects an invalid icon without writing', async () => {
    for (const icon of INVALID_ICONS) {
      const res = await request(app)
        .put(`/api/pages/${PAGE}/autosave`)
        .set(as(EDITOR))
        .send({ icon });
      expect(res.status, JSON.stringify(icon)).toBe(400);
    }
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('needs edit rights like any other autosave', async () => {
    const res = await request(app)
      .put(`/api/pages/${PAGE}/autosave`)
      .set(as(VIEWER))
      .send({ icon: '🚀' });
    expect(res.status).toBe(403);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});
