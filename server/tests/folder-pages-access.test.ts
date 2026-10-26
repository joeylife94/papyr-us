/**
 * Route-level access control for page listings (folder pages, tags, list, tree, children).
 *
 * Write enforcement is deliberately OFF here: folder pages and tags expose page titles,
 * content and tags, so they must fail closed without relying on ENFORCE_AUTH_WRITES. The
 * team/permission filtering itself runs in storage SQL and is proven end to end by
 * tests/security-folder-pages-access.spec.ts against a real database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'folder-pages-access-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'folder-pages-access-secret',
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
const forgedToken = jwt.sign({ id: 7, email: 'reader@example.com' }, 'not-the-server-secret');

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
});

afterAll((done) => {
  server.close(done);
});

describe.each([
  { path: '/api/folders/docs/pages', method: 'getReadableWikiPagesByFolder' },
  { path: '/api/tags', method: 'getReadableTags' },
])('GET $path', ({ path, method }) => {
  it('rejects anonymous requests without touching storage, even with write enforcement off', async () => {
    const response = await request(app).get(path);

    expect(response.status).toBe(401);
    expect(Array.isArray(response.body)).toBe(false);
    expect((storage as any)[method]).not.toHaveBeenCalled();
  });

  it('rejects a token not signed by the server', async () => {
    const response = await request(app)
      .get(path)
      .set('Cookie', [`accessToken=${forgedToken}`]);

    expect(response.status).toBe(401);
    expect((storage as any)[method]).not.toHaveBeenCalled();
  });

  it('answers authenticated requests only through the caller-scoped storage query', async () => {
    (storage as any)[method].mockResolvedValue([]);

    const response = await request(app)
      .get(path)
      .set('Cookie', [`accessToken=${token}`]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect((storage as any)[method]).toHaveBeenCalledTimes(1);
    expect((storage as any)[method].mock.calls[0]).toContain(7);
  });

  it('does not leak internal errors', async () => {
    (storage as any)[method].mockRejectedValue(new Error('relation "secret_table" does not exist'));

    const response = await request(app)
      .get(path)
      .set('Cookie', [`accessToken=${token}`]);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret_table');
  });
});

describe('general listings narrow team-less pages to what the caller can read', () => {
  const viewer = { userId: 7, email: 'reader@example.com', teamIds: [3] };

  beforeEach(() => {
    (storage.getUserTeamIds as any).mockResolvedValue([3]);
    (storage.getPageViewer as any).mockResolvedValue(viewer);
    (storage.searchWikiPages as any).mockResolvedValue({ pages: [], total: 0 });
  });

  it.each(['/api/pages'])('%s', async (path) => {
    const response = await request(app)
      .get(path)
      .set('Cookie', [`accessToken=${token}`]);

    expect(response.status).toBe(200);
    const calls = (storage.searchWikiPages as any).mock.calls;
    const teamless = calls.filter(([params]: any[]) => params.teamId === 'null');
    const teamScoped = calls.filter(([params]: any[]) => params.teamId === '3');
    expect(teamless).toHaveLength(1);
    expect(teamless[0][1]).toEqual({ readableBy: viewer });
    expect(teamScoped).toHaveLength(1);
    expect(teamScoped[0][1] ?? {}).toEqual({});
  });

  it('/api/page-tree lists only through the caller-scoped tree query (issue #103 E5)', async () => {
    const response = await request(app)
      .get('/api/page-tree')
      .set('Cookie', [`accessToken=${token}`]);

    expect(response.status).toBe(200);
    expect(storage.getReadablePageTreeRows).toHaveBeenCalledTimes(1);
    const [userId, scope, viewerOverride] = (storage.getReadablePageTreeRows as any).mock.calls[0];
    expect(userId).toBe(7);
    expect(scope).toEqual({ teamId: undefined, personalOnly: false });
    expect(viewerOverride).toBeUndefined();
    expect(storage.searchWikiPages).not.toHaveBeenCalled();
  });

  it('/api/page-tree shows a readable page under a hidden parent at the root, without the parent id', async () => {
    const at = new Date(0).toISOString();
    (storage.getReadablePageTreeRows as any).mockResolvedValue([
      {
        id: 1,
        title: 'Root',
        slug: 'root',
        icon: null,
        parentId: null,
        position: 0,
        folder: 'docs',
        teamId: null,
        updatedAt: at,
        createdAt: at,
      },
      {
        id: 2,
        title: 'Orphan',
        slug: 'orphan',
        icon: '🚀',
        parentId: 99,
        position: null,
        folder: 'docs',
        teamId: null,
        updatedAt: at,
        createdAt: at,
      },
      {
        id: 3,
        title: 'Child',
        slug: 'child',
        icon: null,
        parentId: 1,
        position: null,
        folder: 'docs',
        teamId: null,
        updatedAt: at,
        createdAt: at,
      },
    ]);

    const response = await request(app)
      .get('/api/page-tree')
      .set('Cookie', [`accessToken=${token}`]);

    expect(response.status).toBe(200);
    expect(response.body.map((n: any) => [n.id, n.parentId])).toEqual([
      [1, null],
      [2, null],
    ]);
    expect(response.body[0].children.map((n: any) => n.id)).toEqual([3]);
    expect(JSON.stringify(response.body)).not.toContain('99');
  });

  it('/api/page-tree?teamId= needs membership and scope=personal limits to team-less pages', async () => {
    const outsider = await request(app)
      .get('/api/page-tree?teamId=4')
      .set('Cookie', [`accessToken=${token}`]);
    expect(outsider.status).toBe(403);
    expect(storage.getReadablePageTreeRows).not.toHaveBeenCalled();

    await request(app)
      .get('/api/page-tree?teamId=3')
      .set('Cookie', [`accessToken=${token}`]);
    await request(app)
      .get('/api/page-tree?scope=personal')
      .set('Cookie', [`accessToken=${token}`]);
    const scopes = (storage.getReadablePageTreeRows as any).mock.calls.map((c: any[]) => c[1]);
    expect(scopes).toEqual([
      { teamId: 3, personalOnly: false },
      { teamId: undefined, personalOnly: true },
    ]);
  });

  it('GET /api/pages/:id/children lists children through the readable query', async () => {
    (storage.getReadableChildPages as any).mockResolvedValue([]);

    const response = await request(app)
      .get('/api/pages/5/children')
      .set('Cookie', [`accessToken=${token}`]);

    expect(response.status).toBe(200);
    expect(storage.getReadableChildPages).toHaveBeenCalledWith(5, 7);
    expect(storage.searchWikiPages).not.toHaveBeenCalled();
  });
});

it('passes the requested folder and caller to the scoped folder query', async () => {
  (storage.getReadableWikiPagesByFolder as any).mockResolvedValue([]);

  await request(app)
    .get('/api/folders/ideas/pages')
    .set('Cookie', [`accessToken=${token}`]);

  expect(storage.getReadableWikiPagesByFolder).toHaveBeenCalledWith('ideas', 7);
});
