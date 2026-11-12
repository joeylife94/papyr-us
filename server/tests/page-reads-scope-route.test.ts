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
