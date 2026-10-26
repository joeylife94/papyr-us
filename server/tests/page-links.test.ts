/**
 * Page link routes (#103 E6, #111 page preview) with mocked storage and the real routes:
 * resolve never returns a title for an id the readable-page query did not return, backlinks and
 * previews sit behind the page permission check, input is bounded, and internal errors never
 * reach the client. The SQL filtering itself is proven against a real database by
 * tests/security-page-links.spec.ts and the layer-4 link index test.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'page-links-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-links-secret',
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
import { plainTextExcerpt } from '../routes/page-links';

const token = jwt.sign({ id: 7, email: 'reader@example.com', role: 'user' }, TEST_SECRET);
const viewer = { userId: 7, email: 'reader@example.com', teamIds: [3] };
const anonymousViewer = { teamIds: [] };

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
  (storage.checkPagePermission as any).mockResolvedValue(true);
  (storage.getPageViewer as any).mockImplementation(async (userId?: number) =>
    userId ? viewer : anonymousViewer
  );
  (storage.resolveReadablePageLinks as any).mockResolvedValue([]);
  (storage.getReadableBacklinks as any).mockResolvedValue([]);
  (storage.getWikiPage as any).mockResolvedValue({
    id: 5,
    title: 'Target',
    slug: 'target',
    icon: '🎯',
    content: 'Body',
  });
});

afterAll((done) => {
  server.close(done);
});

const get = (path: string) =>
  request(app)
    .get(path)
    .set('Cookie', [`accessToken=${token}`]);

describe('GET /api/pages/links/resolve', () => {
  it('returns titles only for ids the readable query returned, in request order', async () => {
    (storage.resolveReadablePageLinks as any).mockResolvedValue([
      { id: 2, title: 'Readable', slug: 'readable', icon: null },
    ]);

    const response = await get('/api/pages/links/resolve?ids=9,2,9,4');

    expect(response.status).toBe(200);
    expect(storage.resolveReadablePageLinks).toHaveBeenCalledWith(viewer, [9, 2, 4]);
    expect(response.body).toEqual({
      links: [
        { id: 9, accessible: false },
        { id: 2, accessible: true, title: 'Readable', slug: 'readable', icon: null },
        { id: 4, accessible: false },
      ],
    });
  });

  it('resolves for anonymous callers as the anonymous viewer', async () => {
    const response = await request(app).get('/api/pages/links/resolve?ids=1');

    expect(response.status).toBe(200);
    expect(storage.resolveReadablePageLinks).toHaveBeenCalledWith(anonymousViewer, [1]);
    expect(response.body.links).toEqual([{ id: 1, accessible: false }]);
  });

  it.each([
    ['no ids', ''],
    ['an empty list', '?ids='],
    ['a non-numeric id', '?ids=1,abc'],
    ['a zero id', '?ids=0'],
    ['a negative id', '?ids=-3'],
    ['an over-long id', '?ids=1234567890'],
    ['more than 100 ids', `?ids=${Array.from({ length: 101 }, (_, i) => i + 1).join(',')}`],
  ])('rejects %s without querying', async (_label, query) => {
    const response = await get(`/api/pages/links/resolve${query}`);

    expect(response.status).toBe(400);
    expect(storage.resolveReadablePageLinks).not.toHaveBeenCalled();
  });

  it('accepts exactly 100 ids', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    const response = await get(`/api/pages/links/resolve?ids=${ids.join(',')}`);

    expect(response.status).toBe(200);
    expect(response.body.links).toHaveLength(100);
  });

  it('does not leak internal errors', async () => {
    (storage.resolveReadablePageLinks as any).mockRejectedValue(
      new Error('relation "secret_table" does not exist')
    );

    const response = await get('/api/pages/links/resolve?ids=1');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret_table');
  });
});

describe('GET /api/pages/:id/backlinks', () => {
  it('lists the readable backlinks of a page the caller can view', async () => {
    const backlink = { id: 8, title: 'Source', slug: 'source', icon: null, updatedAt: 'x' };
    (storage.getReadableBacklinks as any).mockResolvedValue([backlink]);

    const response = await get('/api/pages/5/backlinks');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ backlinks: [backlink] });
    expect(storage.checkPagePermission).toHaveBeenCalledWith(7, 5, 'viewer');
    expect(storage.getReadableBacklinks).toHaveBeenCalledWith(viewer, 5);
  });

  it('refuses a page the caller cannot view', async () => {
    (storage.checkPagePermission as any).mockResolvedValue(false);

    const signedIn = await get('/api/pages/5/backlinks');
    const anonymous = await request(app).get('/api/pages/5/backlinks');

    expect(signedIn.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(storage.getReadableBacklinks).not.toHaveBeenCalled();
  });

  it('answers 404 for a deleted or unknown page', async () => {
    (storage.getWikiPage as any).mockResolvedValue(undefined);

    const response = await get('/api/pages/5/backlinks');

    expect(response.status).toBe(404);
    expect(storage.getReadableBacklinks).not.toHaveBeenCalled();
  });

  it('rejects a malformed id', async () => {
    const response = await get('/api/pages/5abc/backlinks');

    expect(response.status).toBe(400);
    expect(storage.getReadableBacklinks).not.toHaveBeenCalled();
  });

  it('does not leak internal errors', async () => {
    (storage.getReadableBacklinks as any).mockRejectedValue(new Error('secret_table'));

    const response = await get('/api/pages/5/backlinks');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret_table');
  });
});

describe('GET /api/pages/:id/preview', () => {
  it('returns icon, title and an excerpt with readable link titles only', async () => {
    (storage.getWikiPage as any).mockResolvedValue({
      id: 5,
      title: 'Target',
      slug: 'target',
      icon: '🎯',
      content: '# Plan\n\nSee [[page:2]] and [[page:3]] for **details**.',
    });
    (storage.resolveReadablePageLinks as any).mockResolvedValue([
      { id: 2, title: 'Roadmap', slug: 'roadmap', icon: null },
    ]);

    const response = await get('/api/pages/5/preview');

    expect(response.status).toBe(200);
    expect(storage.checkPagePermission).toHaveBeenCalledWith(7, 5, 'viewer');
    expect(storage.resolveReadablePageLinks).toHaveBeenCalledWith(viewer, [2, 3]);
    expect(response.body).toEqual({
      id: 5,
      title: 'Target',
      slug: 'target',
      icon: '🎯',
      excerpt: 'Plan See Roadmap and for details.',
    });
  });

  it('refuses a page the caller cannot view', async () => {
    (storage.checkPagePermission as any).mockResolvedValue(false);

    const response = await get('/api/pages/5/preview');

    expect(response.status).toBe(403);
    expect(storage.getWikiPage).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain('Target');
  });

  it('answers 404 for a deleted or unknown page', async () => {
    (storage.getWikiPage as any).mockResolvedValue(undefined);

    const response = await get('/api/pages/5/preview');

    expect(response.status).toBe(404);
  });

  it('keeps the excerpt within 300 characters', async () => {
    (storage.getWikiPage as any).mockResolvedValue({
      id: 5,
      title: 'Long',
      slug: 'long',
      icon: null,
      content: 'word '.repeat(400),
    });

    const response = await get('/api/pages/5/preview');

    expect(response.status).toBe(200);
    expect(response.body.excerpt.length).toBeLessThanOrEqual(300);
    expect(response.body.excerpt.endsWith('…')).toBe(true);
  });
});

describe('plainTextExcerpt', () => {
  it('drops Markdown syntax and only shortens long text', () => {
    expect(plainTextExcerpt('## Title\n\n- `a` [b](/x)\n```\ncode\n```')).toBe('Title a b');
    expect(plainTextExcerpt('short', 10)).toBe('short');
    expect(plainTextExcerpt('a'.repeat(20), 10)).toBe(`${'a'.repeat(9)}…`);
  });
});

describe('page link index on page writes', () => {
  it('indexes the links of a page created through POST /api/pages', async () => {
    (storage.createWikiPage as any).mockImplementation(async (data: any) => ({
      id: 11,
      ...data,
    }));

    const response = await request(app)
      .post('/api/pages')
      .set('Cookie', [`accessToken=${token}`])
      .send({
        title: 'New',
        slug: 'new',
        content: 'See [[page:4]]',
        blocks: [
          { id: 'b1', type: 'paragraph', content: 'See [[page:4]] and [[page:11]]', order: 0 },
        ],
        folder: 'docs',
        author: 'reader@example.com',
        tags: [],
      });

    expect(response.status).toBe(201);
    // Self-links are dropped before the index is written.
    expect(storage.replacePageLinks).toHaveBeenCalledWith(11, [4], {
      expectedContent: 'See [[page:4]]',
    });
  });

  it('re-indexes links from the restored version', async () => {
    const version = {
      id: 3,
      pageId: 5,
      title: 'Old',
      content: 'Old [[page:6]]',
      blocks: [{ id: 'b', type: 'paragraph', content: 'Old [[page:6]]' }],
    };
    const chain = {
      from: () => chain,
      where: () => Promise.resolve([version]),
    };
    (storage as any).db = { select: () => chain, insert: () => ({ values: async () => {} }) };
    (storage.updateWikiPage as any).mockResolvedValue({ id: 5, ...version });

    const response = await request(app)
      .post('/api/pages/5/versions/3/restore')
      .set('Cookie', [`accessToken=${token}`]);

    expect(response.status).toBe(200);
    expect(storage.replacePageLinks).toHaveBeenCalledWith(5, [6], {
      expectedContent: 'Old [[page:6]]',
    });
    (storage as any).db = {};
  });
});
