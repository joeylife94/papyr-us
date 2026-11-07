/**
 * Page link routes (issue #103 E6), route level with a mocked storage whose checkPagePermission
 * answers from a fixed grant table. Link indexing and the listing SQL are proven against
 * PostgreSQL by tests/integration-layer4/page-links.test.ts.
 *
 * Rules under test:
 * - a link preview shows the title only to callers who may read the target; a missing, trashed
 *   or unreadable target gets the same `{ accessible: false }` answer;
 * - a readable target's preview carries its hover card (issue #133): a plain-text excerpt whose
 *   links are named only for pages the caller may read, and the last update time; nothing of it
 *   reaches an unreadable target's answer;
 * - backlinks need read access to the page and come from the caller-scoped query;
 * - the picker searches one team (members only) or personal pages.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'page-links-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-links-test-secret',
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

const TEAM = 10;
const READER = { id: 1, email: 'reader@example.com', teams: [TEAM] };
const OUTSIDER = { id: 2, email: 'outsider@example.com', teams: [] as number[] };

const OPEN_PAGE = 100; // readable by READER
const SECRET_PAGE = 101; // exists, READER may not read it
const TRASHED_PAGE = 102; // READER could read it, but it is in the trash

const UPDATED_AT = new Date('2026-11-01T09:30:00.000Z');
const LINKED_READABLE = 200;
const LINKED_SECRET = 201;

const page = (id: number, extra: object = {}) => ({
  id,
  title: `Title ${id}`,
  slug: `slug-${id}`,
  icon: '🚀',
  teamId: TEAM,
  deletedAt: null,
  content: `## Notes of ${id}\n\nSee **[[page:${LINKED_READABLE}]]** and [[page:${LINKED_SECRET}]].`,
  updatedAt: UPDATED_AT,
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
  storage.getWikiPage.mockImplementation(async (id: number) =>
    id === OPEN_PAGE
      ? page(id)
      : id === SECRET_PAGE
        ? page(id)
        : id === TRASHED_PAGE
          ? page(id, { deletedAt: new Date() })
          : undefined
  );
  storage.checkPagePermission.mockImplementation(
    async (userId: number | undefined, pageId: number) =>
      userId === READER.id && (pageId === OPEN_PAGE || pageId === TRASHED_PAGE)
  );
  storage.getUserTeamIds.mockImplementation(async (userId: number) =>
    userId === READER.id ? READER.teams : OUTSIDER.teams
  );
  storage.getReadableBacklinks.mockResolvedValue([
    { id: 7, title: 'Linking page', slug: 'linking', icon: null },
  ]);
  storage.searchLinkTargets.mockResolvedValue([]);
  storage.getPageViewer.mockImplementation(async (userId?: number) =>
    userId === READER.id
      ? { userId, email: READER.email, teamIds: READER.teams }
      : { teamIds: [] as number[] }
  );
  // Of the pages linked in the excerpts, the reader may read only LINKED_READABLE.
  storage.resolveReadablePageLinks.mockImplementation(
    async (viewer: { userId?: number }, ids: number[]) =>
      viewer.userId === READER.id && ids.includes(LINKED_READABLE)
        ? [{ id: LINKED_READABLE, title: 'Linked Title', slug: 'linked', icon: null }]
        : []
  );
});

describe('GET /api/pages/:id/link-preview', () => {
  it('shows the current title, icon, excerpt and update time to a reader of the target', async () => {
    const res = await request(app).get(`/api/pages/${OPEN_PAGE}/link-preview`).set(as(READER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: OPEN_PAGE,
      accessible: true,
      title: `Title ${OPEN_PAGE}`,
      slug: `slug-${OPEN_PAGE}`,
      icon: '🚀',
      // Markdown stripped; the readable link by its title, the other one unnamed.
      excerpt: `Notes of ${OPEN_PAGE} See Linked Title and [링크].`,
      updatedAt: UPDATED_AT.toISOString(),
    });
    // Links in the excerpt are named through the caller's own read rule, in one lookup.
    expect(storage.getPageViewer).toHaveBeenCalledWith(READER.id);
    expect(storage.resolveReadablePageLinks).toHaveBeenCalledTimes(1);
    expect(storage.resolveReadablePageLinks).toHaveBeenCalledWith(
      { userId: READER.id, email: READER.email, teamIds: READER.teams },
      [LINKED_READABLE, LINKED_SECRET]
    );
  });

  it('builds the excerpt without lookups when it has no links', async () => {
    storage.getWikiPage.mockResolvedValue(page(OPEN_PAGE, { content: 'Just text, ~~no~~ links.' }));
    const res = await request(app).get(`/api/pages/${OPEN_PAGE}/link-preview`).set(as(READER));
    expect(res.body.excerpt).toBe('Just text, no links.');
    expect(storage.resolveReadablePageLinks).not.toHaveBeenCalled();
  });

  it('answers unreadable, trashed and missing targets exactly as before, with nothing more', async () => {
    for (const id of [SECRET_PAGE, TRASHED_PAGE, 999]) {
      const res = await request(app).get(`/api/pages/${id}/link-preview`).set(as(READER));
      expect(res.status, `page ${id}`).toBe(200);
      // Byte for byte the answer this route gave before hover cards: no title, excerpt or time.
      expect(res.text, `page ${id}`).toBe(JSON.stringify({ id, accessible: false }));
    }
    // An unreadable page's content is never read for an excerpt.
    expect(storage.getPageViewer).not.toHaveBeenCalled();
    expect(storage.resolveReadablePageLinks).not.toHaveBeenCalled();
  });

  it('gives a signed-out caller the same answer for a page only members may read', async () => {
    const res = await request(app).get(`/api/pages/${OPEN_PAGE}/link-preview`);
    expect(res.status).toBe(200);
    expect(res.text).toBe(JSON.stringify({ id: OPEN_PAGE, accessible: false }));
  });

  it('refuses an id beyond the page id column before any lookup', async () => {
    for (const id of ['2147483648', '9999999999']) {
      const res = await request(app).get(`/api/pages/${id}/link-preview`).set(as(READER));
      expect(res.status, id).toBe(400);
    }
    expect(storage.getWikiPage).not.toHaveBeenCalled();
  });
});

describe('GET /api/pages/:id/backlinks', () => {
  it('needs read access to the page and lists through the caller-scoped query', async () => {
    const denied = await request(app).get(`/api/pages/${SECRET_PAGE}/backlinks`).set(as(READER));
    expect(denied.status).toBe(403);
    expect(storage.getReadableBacklinks).not.toHaveBeenCalled();

    const ok = await request(app).get(`/api/pages/${OPEN_PAGE}/backlinks`).set(as(READER));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual([{ id: 7, title: 'Linking page', slug: 'linking', icon: null }]);
    expect(storage.getReadableBacklinks).toHaveBeenCalledWith(READER.id, OPEN_PAGE);
  });
});

describe('GET /api/page-links/search', () => {
  it('searches a team only for its members, and personal pages otherwise', async () => {
    const outsider = await request(app)
      .get(`/api/page-links/search?q=plan&teamId=${TEAM}`)
      .set(as(OUTSIDER));
    expect(outsider.status).toBe(403);
    expect(storage.searchLinkTargets).not.toHaveBeenCalled();

    await request(app).get(`/api/page-links/search?q=plan&teamId=${TEAM}`).set(as(READER));
    await request(app).get('/api/page-links/search?q=plan').set(as(READER));
    expect(storage.searchLinkTargets.mock.calls).toEqual([
      [READER.id, { teamId: TEAM }, 'plan'],
      [READER.id, { personalOnly: true }, 'plan'],
    ]);
  });

  it('needs a signed-in caller', async () => {
    expect((await request(app).get('/api/page-links/search?q=x')).status).toBe(401);
  });
});
