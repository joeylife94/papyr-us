/**
 * GET /api/pages/title-search (#103 E6 link picker, #111 quick switcher): scope resolution fails
 * closed and the readable-title query is the only data source. The SQL filtering itself
 * (readablePagesInScope) is proven against a real database by the browser security specs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'page-title-search-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-title-search-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    enforceAuthForWrites: false,
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

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage';

const token = jwt.sign({ id: 7, email: 'reader@example.com', role: 'user' }, TEST_SECRET);
const viewer = { userId: 7, email: 'reader@example.com', teamIds: [3] };

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
  (storage.getPageViewer as any).mockImplementation(async (userId?: number) =>
    userId ? viewer : { teamIds: [] }
  );
  (storage.searchReadablePageTitles as any).mockResolvedValue([]);
});

afterAll((done) => {
  server.close(done);
});

const search = (query: string) =>
  request(app)
    .get(`/api/pages/title-search${query}`)
    .set('Cookie', [`accessToken=${token}`]);

describe('GET /api/pages/title-search', () => {
  it('searches the team scope for a current member', async () => {
    const match = { id: 1, title: 'Roadmap', slug: 'roadmap', icon: '🗺️', teamId: 3 };
    (storage.searchReadablePageTitles as any).mockResolvedValue([match]);

    const response = await search('?q=road&teamId=3&limit=5&exclude=9');

    expect(response.status).toBe(200);
    expect(response.body.pages).toEqual([match]);
    expect(storage.searchReadablePageTitles).toHaveBeenCalledWith(viewer, 3, {
      query: 'road',
      limit: 5,
      excludeId: 9,
    });
  });

  it('searches team-less pages when no team is given', async () => {
    const response = await search('?q=notes');

    expect(response.status).toBe(200);
    expect(storage.searchReadablePageTitles).toHaveBeenCalledWith(viewer, null, {
      query: 'notes',
      limit: undefined,
      excludeId: undefined,
    });
  });

  it.each([
    ['a team the caller is not in', '?teamId=4'],
    ['an unknown team name', '?teamId=nope'],
  ])('refuses %s without searching', async (_label, query) => {
    (storage.getTeamByName as any).mockResolvedValue(undefined);

    const response = await search(query);

    expect(response.status).toBe(403);
    expect(storage.searchReadablePageTitles).not.toHaveBeenCalled();
  });

  it('refuses a team scope without a session', async () => {
    const response = await request(app).get('/api/pages/title-search?teamId=3');

    expect(response.status).toBe(401);
    expect(storage.searchReadablePageTitles).not.toHaveBeenCalled();
  });

  it('rejects an over-long query', async () => {
    const response = await search(`?q=${'x'.repeat(201)}`);

    expect(response.status).toBe(400);
    expect(storage.searchReadablePageTitles).not.toHaveBeenCalled();
  });

  it('does not leak internal errors', async () => {
    (storage.searchReadablePageTitles as any).mockRejectedValue(
      new Error('relation "secret_table" does not exist')
    );

    const response = await search('?q=x');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret_table');
  });
});
