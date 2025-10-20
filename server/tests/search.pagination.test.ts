import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import request from 'supertest';
import { registerRoutes } from '../routes.js';

describe('Search pagination (limit/offset)', () => {
  let app: Express;
  let server: http.Server;

  const fakePages = Array.from({ length: 25 }).map((_, i) => ({
    id: i + 1,
    title: `Page ${i + 1}`,
    slug: `page-${i + 1}`,
    content: 'content',
    blocks: [],
    folder: 'docs',
    tags: [],
    author: 'tester',
    createdAt: new Date(),
    updatedAt: new Date(),
    teamId: null,
    isPublished: true,
    metadata: {},
  }));

  const fakeStorage: any = {
    searchWikiPages: async ({ limit = 20, offset = 0 }: any) => {
      const pages = fakePages.slice(offset, offset + limit);
      return { pages, total: fakePages.length };
    },
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const reg = await registerRoutes(app, fakeStorage);
    server = reg.httpServer;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns page 1 with limit=12, offset=0 and total count', async () => {
    const res = await request(app).get('/api/pages?limit=12&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.pages).toHaveLength(12);
    expect(res.body.pages[0].id).toBe(1);
  });

  it('returns page 2 with limit=12, offset=12', async () => {
    const res = await request(app).get('/api/pages?limit=12&offset=12');
    expect(res.status).toBe(200);
    expect(res.body.pages).toHaveLength(12);
    expect(res.body.pages[0].id).toBe(13);
  });

  it('returns remaining items for last page', async () => {
    const res = await request(app).get('/api/pages?limit=12&offset=24');
    expect(res.status).toBe(200);
    expect(res.body.pages).toHaveLength(1);
    expect(res.body.pages[0].id).toBe(25);
  });
});
