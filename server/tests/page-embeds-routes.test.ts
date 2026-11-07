/**
 * Page embeds (issue #135, decision P3-D2), route level with a mocked storage whose
 * checkPagePermission answers from a fixed grant table. That embeds are indexed as links is
 * proven against PostgreSQL by tests/integration-layer4/page-embeds.test.ts.
 *
 * Rules under test:
 * - GET /api/pages/:id/embed shows the target's title, icon, slug, updatedAt and Markdown only to
 *   callers who may read it (the link preview's open-by-id rule), its content cut to a cap;
 * - a missing, trashed or unreadable target answers exactly what the link preview answers, the
 *   same for all three: no title, size, text or other detail;
 * - ids beyond the page id column are refused before any lookup; failures leak nothing.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { MAX_EMBED_CONTENT_CHARS } from '../../shared/page-embeds';

const TEST_SECRET = 'page-embeds-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-embeds-test-secret',
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

const OPEN_PAGE = 100; // readable by READER
const SECRET_PAGE = 101; // exists, READER may not read it
const TRASHED_PAGE = 102; // READER could read it, but it is in the trash
const LONG_PAGE = 103; // readable, longer than the embed cap
const UPDATED_AT = new Date('2026-11-01T10:00:00.000Z');

const SECRET_TEXT = 'Secret roadmap body';
const page = (id: number, extra: object = {}) => ({
  id,
  title: `Title ${id}`,
  slug: `slug-${id}`,
  icon: '🚀',
  teamId: 10,
  content: `# Heading ${id}\n\n${SECRET_TEXT} [[page:5]]`,
  updatedAt: UPDATED_AT,
  deletedAt: null,
  ...extra,
});

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
  storage.getWikiPage.mockImplementation(async (id: number) => {
    if (id === OPEN_PAGE || id === SECRET_PAGE) return page(id);
    if (id === TRASHED_PAGE) return page(id, { deletedAt: new Date() });
    if (id === LONG_PAGE) {
      return page(id, { content: `${'line of text\n'.repeat(5000)}tail ${SECRET_TEXT}` });
    }
    return undefined;
  });
  storage.checkPagePermission.mockImplementation(
    async (userId: number | undefined, pageId: number) =>
      userId === READER.id && [OPEN_PAGE, TRASHED_PAGE, LONG_PAGE].includes(pageId)
  );
});

describe('GET /api/pages/:id/embed', () => {
  it('shows a readable target: title, icon, slug, updatedAt and its Markdown', async () => {
    const res = await request(app).get(`/api/pages/${OPEN_PAGE}/embed`).set(as(READER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: OPEN_PAGE,
      accessible: true,
      title: `Title ${OPEN_PAGE}`,
      slug: `slug-${OPEN_PAGE}`,
      icon: '🚀',
      updatedAt: UPDATED_AT.toISOString(),
      content: `# Heading ${OPEN_PAGE}\n\n${SECRET_TEXT} [[page:5]]`,
      truncated: false,
    });
    expect(storage.checkPagePermission).toHaveBeenCalledWith(READER.id, OPEN_PAGE, 'viewer');
  });

  it('caps the content of a long page and says so', async () => {
    const res = await request(app).get(`/api/pages/${LONG_PAGE}/embed`).set(as(READER));
    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(true);
    expect(res.body.content.length).toBeLessThanOrEqual(MAX_EMBED_CONTENT_CHARS);
    expect(res.body.content).not.toContain(SECRET_TEXT);
  });

  it('answers unreadable, trashed and missing targets exactly like the link preview', async () => {
    for (const id of [SECRET_PAGE, TRASHED_PAGE, 999]) {
      const embed = await request(app).get(`/api/pages/${id}/embed`).set(as(READER));
      const preview = await request(app).get(`/api/pages/${id}/link-preview`).set(as(READER));
      expect(embed.status, `page ${id}`).toBe(200);
      expect(embed.body, `page ${id}`).toEqual({ id, accessible: false });
      // Byte for byte what an unreadable link answers, so an embed tells nothing more.
      expect(embed.text, `page ${id}`).toBe(preview.text);
      expect(embed.text).not.toContain('Title');
      expect(embed.text).not.toContain(SECRET_TEXT);
    }
    // The unreadable target's answer equals the unknown id's (apart from the id asked for).
    const secret = await request(app).get(`/api/pages/${SECRET_PAGE}/embed`).set(as(READER));
    const unknown = await request(app).get('/api/pages/999/embed').set(as(READER));
    expect({ ...secret.body, id: 0 }).toEqual({ ...unknown.body, id: 0 });
    expect(secret.headers['content-length']).toBe(unknown.headers['content-length']);
  });

  it('shows a caller without a session only what an anonymous viewer may read', async () => {
    const res = await request(app).get(`/api/pages/${OPEN_PAGE}/embed`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: OPEN_PAGE, accessible: false });
    expect(storage.checkPagePermission).toHaveBeenCalledWith(undefined, OPEN_PAGE, 'viewer');
  });

  it('refuses ids beyond the page id column before any lookup', async () => {
    for (const id of ['2147483648', '9999999999', '0', 'abc']) {
      const res = await request(app).get(`/api/pages/${id}/embed`).set(as(READER));
      expect(res.status, id).toBe(400);
    }
    expect(storage.getWikiPage).not.toHaveBeenCalled();
  });

  it('fails without internal details', async () => {
    storage.getWikiPage.mockRejectedValue(new Error('connection to db-internal:5432 refused'));
    const res = await request(app).get(`/api/pages/${OPEN_PAGE}/embed`).set(as(READER));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to load embed' });
  });
});
