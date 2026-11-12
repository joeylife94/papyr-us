/**
 * Route-level rules of the page-derived reads (issue #124 X1b, package P1): dashboard and
 * overview stats, per-page analytics, favorites and the activity feed. Each handler may only
 * answer through a caller-scoped storage method, and the access rule of the page it names is
 * applied before anything is read or written. The SQL rules themselves are proven against a
 * real database by tests/integration-layer4/page-reads-scope.test.ts and end to end by
 * tests/security-page-reads-scope.spec.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'page-reads-scope-route-secret';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'page-reads-scope-route-secret',
  adminEmails: [] as string[],
  enforceAuthForWrites: true,
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

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const OWN_TEAM = 3;
const CALLER = { id: 7, email: 'reader@example.com' };
const viewer = { userId: CALLER.id, email: CALLER.email, organizationId: 1, teamIds: [OWN_TEAM] };
const anonymousViewer = { teamIds: [] };

const token = jwt.sign({ id: CALLER.id, email: CALLER.email, role: 'user' }, TEST_SECRET);
const forgedToken = jwt.sign({ id: CALLER.id, email: CALLER.email }, 'not-the-server-secret');
const signedIn = () => ({ Cookie: [`accessToken=${token}`] });
const forged = () => ({ Cookie: [`accessToken=${forgedToken}`] });

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.resetAllMocks();
  mockConfig.enforceAuthForWrites = true;
  storage.getUserTeamIds.mockImplementation(async (userId: number) =>
    userId === CALLER.id ? [OWN_TEAM] : []
  );
  storage.getPageViewer.mockImplementation(async (userId?: number) =>
    userId === CALLER.id ? viewer : anonymousViewer
  );
  storage.checkPagePermission.mockResolvedValue(true);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ==================== Surface A: dashboard and overview stats ====================

describe('GET /api/stats/dashboard', () => {
  const PATH = '/api/stats/dashboard';
  const stats = {
    totals: { pages: 4, tasks: 2, comments: 1, users: 3 },
    recent: { pagesThisWeek: 1, tasksCompletedThisWeek: 0 },
    pageGrowth: [{ date: '2026-01-01', count: 1 }],
    topContributors: [{ author: 'reader@example.com', pages_created: 4 }],
    taskBreakdown: [{ status: 'todo', count: 2 }],
  };

  beforeEach(() => {
    storage.getDashboardStats.mockResolvedValue(stats);
  });

  it('answers a signed-in caller only through the caller-scoped storage query', async () => {
    const response = await request(app).get(PATH).set(signedIn());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(stats);
    expect(storage.getPageViewer).toHaveBeenCalledWith(CALLER.id);
    expect(storage.getDashboardStats).toHaveBeenCalledTimes(1);
    expect(storage.getDashboardStats).toHaveBeenCalledWith(viewer);
  });

  it('refuses a request without a valid session, whatever ENFORCE_AUTH_WRITES says', async () => {
    for (const enforce of [true, false]) {
      mockConfig.enforceAuthForWrites = enforce;
      const anonymous = await request(app).get(PATH);
      expect(anonymous.status, `anonymous, enforce=${enforce}`).toBe(401);
      expect(anonymous.body).toEqual({ message: 'No token provided' });
      const invalid = await request(app).get(PATH).set(forged());
      expect(invalid.status, `forged, enforce=${enforce}`).toBe(401);
      expect(invalid.body).toEqual({ message: 'Invalid token' });
    }
    expect(storage.getDashboardStats).not.toHaveBeenCalled();
  });

  it('answers a storage failure with a fixed message', async () => {
    storage.getDashboardStats.mockRejectedValue(new Error('relation "secret_table" is gone'));

    const response = await request(app).get(PATH).set(signedIn());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to fetch dashboard stats' });
  });
});

describe('GET /api/stats/overview', () => {
  const PATH = '/api/stats/overview';
  const overview = {
    totalPages: 5,
    totalUsers: 3,
    totalTasks: 2,
    totalComments: 1,
    pagesThisWeek: 1,
    tasksByStatus: { todo: 2 },
  };

  beforeEach(() => {
    storage.getStatsOverview.mockResolvedValue(overview);
  });

  it('answers a signed-in caller only through the caller-scoped storage query', async () => {
    const response = await request(app).get(PATH).set(signedIn());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(overview);
    expect(storage.getPageViewer).toHaveBeenCalledWith(CALLER.id);
    expect(storage.getStatsOverview).toHaveBeenCalledTimes(1);
    expect(storage.getStatsOverview).toHaveBeenCalledWith(viewer);
  });

  it('refuses a request without a valid session, whatever ENFORCE_AUTH_WRITES says', async () => {
    for (const enforce of [true, false]) {
      mockConfig.enforceAuthForWrites = enforce;
      expect((await request(app).get(PATH)).status).toBe(401);
      expect((await request(app).get(PATH).set(forged())).status).toBe(401);
    }
    expect(storage.getStatsOverview).not.toHaveBeenCalled();
  });

  it('answers a storage failure with a fixed message', async () => {
    storage.getStatsOverview.mockRejectedValue(new Error('relation "secret_table" is gone'));

    const response = await request(app).get(PATH).set(signedIn());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to fetch stats' });
  });
});

// ==================== Surface B: per-page analytics ====================

describe('per-page analytics follow the page read rule', () => {
  const PAGE_ID = 11;
  const counts = {
    totalViews: 5,
    uniqueViewers: 2,
    viewsLast7Days: 3,
    dailyViews: [{ date: '2026-01-01', count: 5 }],
  };
  /** A page the signed-in caller cannot read and nobody signed out can (no public grant). */
  const denyUnlessSignedInReader = (readable: boolean) =>
    storage.checkPagePermission.mockImplementation(async (userId?: number) =>
      userId === CALLER.id ? readable : false
    );

  beforeEach(() => {
    storage.getWikiPage.mockResolvedValue({ id: PAGE_ID, title: 'Roadmap', slug: 'roadmap' });
    storage.getPageViewStats.mockResolvedValue(counts);
    storage.recordPageView.mockResolvedValue(undefined);
  });

  describe('POST /api/pages/:id/view', () => {
    const PATH = `/api/pages/${PAGE_ID}/view`;

    it('records a view of a page the caller may read, for that caller', async () => {
      const response = await request(app).post(PATH).set(signedIn());

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ recorded: true });
      expect(storage.checkPagePermission).toHaveBeenCalledWith(CALLER.id, PAGE_ID, 'viewer');
      expect(storage.recordPageView).toHaveBeenCalledWith(PAGE_ID, CALLER.id);
    });

    it('records a signed-out view only when the page itself reads for anyone (writes not enforced)', async () => {
      mockConfig.enforceAuthForWrites = false;

      const response = await request(app).post(PATH);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ recorded: true });
      expect(storage.checkPagePermission).toHaveBeenCalledWith(undefined, PAGE_ID, 'viewer');
      expect(storage.recordPageView).toHaveBeenCalledWith(PAGE_ID, null);
    });

    it('refuses a signed-out view while writes are enforced, recording nothing', async () => {
      const response = await request(app).post(PATH);

      expect(response.status).toBe(401);
      expect(storage.recordPageView).not.toHaveBeenCalled();
    });

    it('refuses a signed-out view of a page that does not read for anyone, recording nothing', async () => {
      mockConfig.enforceAuthForWrites = false;
      denyUnlessSignedInReader(true);

      const response = await request(app).post(PATH);

      expect(response.status).toBe(401);
      expect(response.body.recorded).toBeUndefined();
      expect(storage.recordPageView).not.toHaveBeenCalled();
    });

    it('refuses a signed-in caller who cannot read the page, recording nothing', async () => {
      denyUnlessSignedInReader(false);

      const response = await request(app).post(PATH).set(signedIn());

      expect(response.status).toBe(403);
      expect(response.body.recorded).toBeUndefined();
      expect(storage.getWikiPage).not.toHaveBeenCalled();
      expect(storage.recordPageView).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown or trashed page, recording nothing', async () => {
      storage.getWikiPage.mockResolvedValue(undefined);

      const response = await request(app).post(PATH).set(signedIn());

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Page not found' });
      expect(storage.recordPageView).not.toHaveBeenCalled();
    });

    it('refuses a page id that is not a number', async () => {
      const response = await request(app).post('/api/pages/abc/view').set(signedIn());

      expect(response.status).toBe(400);
      expect(storage.recordPageView).not.toHaveBeenCalled();
    });

    it('keeps the soft failure only for a failed insert after the checks', async () => {
      storage.recordPageView.mockRejectedValue(new Error('insert failed'));

      const response = await request(app).post(PATH).set(signedIn());

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ recorded: false });
    });

    it('does not let a failing permission check record anything', async () => {
      storage.checkPagePermission.mockRejectedValue(new Error('lookup failed'));

      const response = await request(app).post(PATH).set(signedIn());

      expect(response.status).toBe(500);
      expect(storage.recordPageView).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/pages/:id/analytics', () => {
    const PATH = `/api/pages/${PAGE_ID}/analytics`;

    it('answers the counts of a page the caller may read, shape unchanged', async () => {
      const response = await request(app).get(PATH).set(signedIn());

      expect(response.status).toBe(200);
      expect(response.body).toEqual(counts);
      expect(storage.checkPagePermission).toHaveBeenCalledWith(CALLER.id, PAGE_ID, 'viewer');
      expect(storage.getPageViewStats).toHaveBeenCalledWith(PAGE_ID);
    });

    it('answers a signed-out caller only for a page that reads for anyone', async () => {
      expect((await request(app).get(PATH)).status).toBe(200);

      denyUnlessSignedInReader(true);
      storage.getPageViewStats.mockClear();
      const refused = await request(app).get(PATH);
      expect(refused.status).toBe(401);
      expect(refused.body.totalViews).toBeUndefined();
      expect(storage.getPageViewStats).not.toHaveBeenCalled();
    });

    it('refuses a signed-in caller who cannot read the page, without reading the counts', async () => {
      denyUnlessSignedInReader(false);

      const response = await request(app).get(PATH).set(signedIn());

      expect(response.status).toBe(403);
      expect(response.body.totalViews).toBeUndefined();
      expect(storage.getPageViewStats).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown or trashed page', async () => {
      storage.getWikiPage.mockResolvedValue(undefined);

      const response = await request(app).get(PATH).set(signedIn());

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Page not found' });
      expect(storage.getPageViewStats).not.toHaveBeenCalled();
    });

    it('answers a storage failure with a fixed message', async () => {
      storage.getPageViewStats.mockRejectedValue(new Error('relation "secret_table" is gone'));

      const response = await request(app).get(PATH).set(signedIn());

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch analytics' });
    });
  });
});

// ==================== Surface C: favorites ====================

describe('favorites', () => {
  const PAGE_ID = 11;
  const favoriteRows = [
    {
      id: 1,
      pageId: PAGE_ID,
      createdAt: '2026-01-02T00:00:00.000Z',
      pageTitle: 'Roadmap',
      pageSlug: 'roadmap',
      pageFolder: 'docs',
      pageUpdatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const created = {
    id: 5,
    userId: CALLER.id,
    pageId: PAGE_ID,
    createdAt: '2026-01-03T00:00:00.000Z',
  };

  beforeEach(() => {
    storage.getWikiPage.mockResolvedValue({ id: PAGE_ID, title: 'Roadmap', slug: 'roadmap' });
    storage.getFavoritePages.mockResolvedValue(favoriteRows);
    storage.isPageListableBy.mockResolvedValue(true);
    storage.addPageFavorite.mockResolvedValue(created);
  });

  describe('GET /api/favorites', () => {
    it('lists only through the caller-scoped storage query', async () => {
      const response = await request(app).get('/api/favorites').set(signedIn());

      expect(response.status).toBe(200);
      expect(response.body).toEqual(favoriteRows);
      expect(storage.getPageViewer).toHaveBeenCalledWith(CALLER.id);
      expect(storage.getFavoritePages).toHaveBeenCalledWith(viewer);
    });

    it('refuses a request without a session', async () => {
      expect((await request(app).get('/api/favorites')).status).toBe(401);
      expect(storage.getFavoritePages).not.toHaveBeenCalled();
    });

    it('answers a storage failure with a fixed message', async () => {
      storage.getFavoritePages.mockRejectedValue(new Error('relation "secret_table" is gone'));

      const response = await request(app).get('/api/favorites').set(signedIn());

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch favorites' });
    });
  });

  describe('POST /api/favorites/:pageId', () => {
    const PATH = `/api/favorites/${PAGE_ID}`;

    it('adds a page the caller may list', async () => {
      const response = await request(app).post(PATH).set(signedIn());

      expect(response.status).toBe(201);
      expect(response.body).toEqual(created);
      expect(storage.isPageListableBy).toHaveBeenCalledWith(viewer, PAGE_ID);
      expect(storage.addPageFavorite).toHaveBeenCalledWith(CALLER.id, PAGE_ID);
    });

    it('answers a page the caller may not list exactly like an unknown page, adding nothing', async () => {
      storage.isPageListableBy.mockResolvedValue(false);

      const hidden = await request(app).post(PATH).set(signedIn());

      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual({ error: 'Page not found' });
      expect(storage.addPageFavorite).not.toHaveBeenCalled();
    });

    it('keeps 409 for a page that is already a favorite', async () => {
      storage.addPageFavorite.mockResolvedValue(null);

      const response = await request(app).post(PATH).set(signedIn());

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Page already in favorites' });
    });

    it('refuses a page id that is not a number and a request without a session', async () => {
      expect((await request(app).post('/api/favorites/abc').set(signedIn())).status).toBe(400);
      expect((await request(app).post(PATH)).status).toBe(401);
      expect(storage.addPageFavorite).not.toHaveBeenCalled();
    });

    it('fails closed when the listing check fails', async () => {
      storage.isPageListableBy.mockRejectedValue(new Error('lookup failed'));

      const response = await request(app).post(PATH).set(signedIn());

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to add favorite' });
      expect(storage.addPageFavorite).not.toHaveBeenCalled();
    });
  });

  describe('DELETE and check stay limited to the callers own rows', () => {
    /** A query builder that answers `rows` for any chain, and records the calls made on it. */
    const fakeDb = (rows: unknown[]) => {
      const chain: any = {};
      for (const name of ['select', 'from', 'where', 'delete', 'returning']) {
        chain[name] = vi.fn(() => chain);
      }
      chain.then = (resolve: (value: unknown[]) => void) => resolve(rows);
      return chain;
    };
    let originalDb: unknown;
    beforeEach(() => {
      originalDb = storage.db;
    });
    afterAll(() => {
      storage.db = originalDb;
    });

    it('removes the favorite without any page check', async () => {
      storage.db = fakeDb([{ id: 1 }]);

      const response = await request(app).delete(`/api/favorites/${PAGE_ID}`).set(signedIn());

      expect(response.status).toBe(204);
      expect(storage.isPageListableBy).not.toHaveBeenCalled();
    });

    it('answers 404 when the caller has no such favorite', async () => {
      storage.db = fakeDb([]);

      const response = await request(app).delete(`/api/favorites/${PAGE_ID}`).set(signedIn());

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Favorite not found' });
    });

    it('answers the check from the callers own rows only', async () => {
      storage.db = fakeDb([{ id: 1 }]);

      const response = await request(app).get(`/api/favorites/check/${PAGE_ID}`).set(signedIn());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ isFavorited: true });
      expect(storage.isPageListableBy).not.toHaveBeenCalled();
    });
  });
});
