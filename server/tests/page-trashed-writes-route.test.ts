/**
 * A page in the trash is not written, whichever way it is saved (REST, both auth modes).
 *
 * Rules under test, on the real routes with a mocked storage that answers like the real one (a
 * trashed page is not found by `getWikiPage`):
 * - PUT /api/pages/:id, PUT /api/pages/:id/autosave and POST /api/pages/:id/versions/:id/restore
 *   answer 404 for a trashed page and write nothing: no update, no version snapshot;
 * - a bulk tag change skips a trashed page and counts only the pages it changed;
 * - a live page is saved as before, and restoring from the trash is still answered.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const SECRET = 'page-trashed-writes-secret';
const mode = vi.hoisted(() => ({ enforce: true }));

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-trashed-writes-secret',
    adminEmails: [],
    get enforceAuthForWrites() {
      return mode.enforce;
    },
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

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const EDITOR = 7;
const TRASHED = 11;
const LIVE = 12;
const cookie = [
  `accessToken=${jwt.sign({ id: EDITOR, email: 'editor@example.com', role: 'user' }, SECRET)}`,
];
const livePage = { id: LIVE, title: 'Live', slug: 'live', content: 'c', blocks: [], tags: [] };

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  storage.db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([]),
  };
  // The page's permission check passes for both pages; only the live one can be read as a page
  storage.checkPagePermission.mockResolvedValue(true);
  storage.getWikiPage.mockImplementation(async (id: number) =>
    id === LIVE ? livePage : undefined
  );
  storage.updateWikiPage.mockImplementation(async (id: number, data: any) =>
    id === LIVE ? { ...livePage, ...data } : undefined
  );
  storage.getUserTeamIds.mockResolvedValue([]);
});

const nothingWritten = () => {
  expect(storage.updateWikiPage).not.toHaveBeenCalled();
  expect(storage.db.insert).not.toHaveBeenCalled();
};

describe.each([true, false])('with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mode.enforce = enforce;
  });

  it('PUT /api/pages/:id answers 404 for a trashed page and writes nothing', async () => {
    for (const body of [{ title: 'Edited' }, { content: 'x', blocks: [] }, { tags: ['a'] }]) {
      const res = await request(app).put(`/api/pages/${TRASHED}`).set('Cookie', cookie).send(body);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Page not found' });
    }
    nothingWritten();
  });

  it('PUT /api/pages/:id/autosave answers 404 for a trashed page and writes nothing', async () => {
    const res = await request(app)
      .put(`/api/pages/${TRASHED}/autosave`)
      .set('Cookie', cookie)
      .send({ blocks: [{ id: 'b', type: 'paragraph', content: 'x' }] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Page not found' });
    nothingWritten();
  });

  it('restoring a version of a trashed page answers 404 and writes nothing', async () => {
    storage.db.where.mockResolvedValue([
      { id: 5, pageId: TRASHED, title: 'Old', content: 'old', blocks: [] },
    ]);
    const res = await request(app)
      .post(`/api/pages/${TRASHED}/versions/5/restore`)
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(404);
    nothingWritten();
  });

  it('a bulk tag change skips a trashed page and counts only the live one', async () => {
    const res = await request(app)
      .post('/api/pages/bulk/tags')
      .set('Cookie', cookie)
      .send({ pageIds: [TRASHED, LIVE], addTags: ['x'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 1 });
    expect(storage.updateWikiPage).toHaveBeenCalledTimes(1);
    expect(storage.updateWikiPage).toHaveBeenCalledWith(LIVE, { tags: ['x'] });
  });

  it('a live page is saved as before', async () => {
    const put = await request(app)
      .put(`/api/pages/${LIVE}`)
      .set('Cookie', cookie)
      .send({ title: 'Edited' });
    expect(put.status).toBe(200);
    expect(put.body.title).toBe('Edited');
    const auto = await request(app)
      .put(`/api/pages/${LIVE}/autosave`)
      .set('Cookie', cookie)
      .send({ title: 'Edited again' });
    expect(auto.status).toBe(200);
  });
});
