/**
 * Route-level access control for page-derived listings (folder pages, tags).
 *
 * Write enforcement is deliberately OFF here: these listings expose page titles, content and
 * tags, so they must fail closed without relying on ENFORCE_AUTH_WRITES. The team/permission
 * filtering itself runs in storage and is proven end to end by
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

it('passes the requested folder and caller to the scoped folder query', async () => {
  (storage.getReadableWikiPagesByFolder as any).mockResolvedValue([]);

  await request(app)
    .get('/api/folders/ideas/pages')
    .set('Cookie', [`accessToken=${token}`]);

  expect(storage.getReadableWikiPagesByFolder).toHaveBeenCalledWith('ideas', 7);
});
