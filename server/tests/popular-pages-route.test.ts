/**
 * Route-level rules of GET /api/analytics/popular (#141). The ranking shows page titles, so the
 * handler may only answer through the caller-scoped storage query. The SQL rule itself is proven
 * against a real database by tests/integration-layer4/popular-pages.test.ts and end to end by
 * tests/security-popular-pages.spec.ts.
 *
 * Rules under test:
 * - the list comes from DBStorage.getPopularPages, called with the viewer resolved from the
 *   session (DBStorage.getPageViewer), never from an unscoped query;
 * - without a session: 401 when auth is enforced; otherwise the anonymous viewer, for whom the
 *   storage lists nothing;
 * - `limit` and `days` keep their defaults and caps (20 / 100, 30 / 365);
 * - a team the caller is not in is refused before the handler runs;
 * - a storage failure answers 500 with a fixed message.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'popular-pages-route-secret';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'popular-pages-route-secret',
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

const PATH = '/api/analytics/popular';
const OWN_TEAM = 3;
const OTHER_TEAM = 4;
const CALLER = { id: 7, email: 'reader@example.com' };
const viewer = { userId: CALLER.id, email: CALLER.email, organizationId: 1, teamIds: [OWN_TEAM] };
const anonymousViewer = { teamIds: [] };
const ranking = [
  { pageId: 11, pageTitle: 'Roadmap', pageSlug: 'roadmap', viewCount: '5', uniqueViewers: '2' },
  { pageId: 12, pageTitle: 'Notes', pageSlug: 'notes', viewCount: '3', uniqueViewers: '1' },
];

const token = jwt.sign({ id: CALLER.id, email: CALLER.email, role: 'user' }, TEST_SECRET);
const forgedToken = jwt.sign({ id: CALLER.id, email: CALLER.email }, 'not-the-server-secret');
const signedIn = () => ({ Cookie: [`accessToken=${token}`] });

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.enforceAuthForWrites = true;
  storage.getUserTeamIds.mockImplementation(async (userId: number) =>
    userId === CALLER.id ? [OWN_TEAM] : []
  );
  storage.getPageViewer.mockImplementation(async (userId?: number) =>
    userId === CALLER.id ? viewer : anonymousViewer
  );
  storage.getPopularPages.mockResolvedValue(ranking);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/analytics/popular', () => {
  it('answers a signed-in caller only through the caller-scoped storage query', async () => {
    const response = await request(app).get(PATH).set(signedIn());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(ranking);
    expect(storage.getPageViewer).toHaveBeenCalledWith(CALLER.id);
    expect(storage.getPopularPages).toHaveBeenCalledTimes(1);
    expect(storage.getPopularPages).toHaveBeenCalledWith(viewer, { days: 30, limit: 20 });
  });

  it('keeps the limit and days parameters, with their caps', async () => {
    await request(app).get(`${PATH}?limit=5&days=7`).set(signedIn());
    expect(storage.getPopularPages).toHaveBeenLastCalledWith(viewer, { days: 7, limit: 5 });

    await request(app).get(`${PATH}?limit=5000&days=9999`).set(signedIn());
    expect(storage.getPopularPages).toHaveBeenLastCalledWith(viewer, { days: 365, limit: 100 });

    await request(app).get(`${PATH}?limit=abc&days=`).set(signedIn());
    expect(storage.getPopularPages).toHaveBeenLastCalledWith(viewer, { days: 30, limit: 20 });
  });

  it('refuses a request without a session when auth is enforced, without touching storage', async () => {
    const anonymous = await request(app).get(PATH);
    expect(anonymous.status).toBe(401);
    expect(Array.isArray(anonymous.body)).toBe(false);

    const forged = await request(app)
      .get(PATH)
      .set('Cookie', [`accessToken=${forgedToken}`]);
    expect(forged.status).toBe(401);

    expect(storage.getPopularPages).not.toHaveBeenCalled();
  });

  it('lists for the anonymous viewer when auth is not enforced, never for another caller', async () => {
    mockConfig.enforceAuthForWrites = false;
    storage.getPopularPages.mockImplementation(async (who: any) => (who.userId ? ranking : []));

    const response = await request(app).get(PATH);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(storage.getPageViewer).toHaveBeenCalledWith(undefined);
    expect(storage.getPopularPages).toHaveBeenCalledWith(anonymousViewer, { days: 30, limit: 20 });
  });

  it('refuses a team the caller is not in before the handler runs', async () => {
    const response = await request(app).get(`${PATH}?teamId=${OTHER_TEAM}`).set(signedIn());

    expect(response.status).toBe(403);
    expect(storage.getPopularPages).not.toHaveBeenCalled();

    const own = await request(app).get(`${PATH}?teamId=${OWN_TEAM}`).set(signedIn());
    expect(own.status).toBe(200);
    expect(storage.getPopularPages).toHaveBeenCalledWith(viewer, { days: 30, limit: 20 });
  });

  it('does not leak internal errors', async () => {
    storage.getPopularPages.mockRejectedValue(new Error('relation "secret_table" does not exist'));

    const response = await request(app).get(PATH).set(signedIn());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to fetch popular pages' });
    expect(JSON.stringify(response.body)).not.toContain('secret_table');
  });
});
