/**
 * Knowledge views (#111 §1, §2, §5): GET /api/knowledge-graph, GET /api/pages/:id/graph and
 * GET /api/pages/:id/unlinked-mentions. Mocked storage, real routes: access checks run before
 * any graph query, depth is validated, missing pages are 404, and responses never carry page
 * content or internal errors. The SQL filtering itself (readablePageCondition) is proven against
 * a real database by tests/security-knowledge.spec.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'knowledge-routes-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'knowledge-routes-secret',
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

vi.mock('../services/ai', async (importOriginal) => ({
  ...((await importOriginal()) as any),
  findRelatedPages: vi.fn().mockResolvedValue([]),
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage';

const s = storage as any;
const token = jwt.sign({ id: 7, email: 'reader@example.com', role: 'user' }, TEST_SECRET);
const viewer = { userId: 7, email: 'reader@example.com', teamIds: [3] };
const livePage = {
  id: 5,
  title: 'Roadmap',
  slug: 'roadmap',
  icon: '🗺️',
  teamId: 3,
  content: 'centre page body',
};

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
  s.getUserTeamIds.mockResolvedValue([3]);
  s.getPageViewer.mockImplementation(async (userId?: number) =>
    userId ? viewer : { teamIds: [] }
  );
  s.checkPagePermission.mockResolvedValue(true);
  s.getWikiPage.mockResolvedValue(livePage);
  s.getLocalPageGraph.mockResolvedValue({ neighbours: [], links: [] });
  s.getUnlinkedMentions.mockResolvedValue([]);
  s.getKnowledgeGraphSource.mockResolvedValue({ pages: [], links: [] });
});

afterAll((done) => {
  server.close(done);
});

const get = (path: string) =>
  request(app)
    .get(path)
    .set('Cookie', [`accessToken=${token}`]);

describe('GET /api/knowledge-graph', () => {
  it('builds the graph from readable pages and page links without any content', async () => {
    s.getKnowledgeGraphSource.mockResolvedValue({
      pages: [
        { id: 1, title: 'A', slug: 'a', icon: '⭐', tags: [], content: 'BODY-A [[B]]' },
        { id: 2, title: 'B', slug: 'b', icon: null, tags: [], content: 'BODY-B' },
      ],
      links: [{ sourcePageId: 2, targetPageId: 1 }],
    });

    const response = await get('/api/knowledge-graph');

    expect(response.status).toBe(200);
    expect(s.getKnowledgeGraphSource).toHaveBeenCalledWith(viewer, [3]);
    expect(response.text).not.toContain('BODY-');
    expect(response.body.nodes.every((node: any) => !('content' in node))).toBe(true);
    expect(response.body.nodes.find((node: any) => node.id === 'page-1').icon).toBe('⭐');
    expect(response.body.links.map((link: any) => link.type).sort()).toEqual(['content', 'link']);
  });

  it('resolves a team name and scopes the graph to that team', async () => {
    s.getTeamByName.mockResolvedValue({ id: 3, name: 'core' });

    const response = await get('/api/knowledge-graph?teamId=core');

    expect(response.status).toBe(200);
    expect(s.getKnowledgeGraphSource).toHaveBeenCalledWith(viewer, [3]);
  });

  it.each([
    ['a team the caller is not in', '?teamId=4'],
    ['an unknown team name', '?teamId=nope'],
  ])('refuses %s without querying pages', async (_label, query) => {
    s.getTeamByName.mockResolvedValue(undefined);

    const response = await get(`/api/knowledge-graph${query}`);

    expect([403, 404]).toContain(response.status);
    expect(s.getKnowledgeGraphSource).not.toHaveBeenCalled();
  });

  it('returns an empty graph for a caller without teams', async () => {
    s.getUserTeamIds.mockResolvedValue([]);

    const response = await get('/api/knowledge-graph');

    expect(response.body).toEqual({ nodes: [], links: [] });
    expect(s.getKnowledgeGraphSource).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    const response = await request(app).get('/api/knowledge-graph');
    expect(response.status).toBe(401);
  });

  it('does not leak internal errors', async () => {
    s.getKnowledgeGraphSource.mockRejectedValue(new Error('relation "secret_table" missing'));

    const response = await get('/api/knowledge-graph');

    expect(response.status).toBe(500);
    expect(response.text).not.toContain('secret_table');
  });
});

describe('GET /api/pages/:id/graph', () => {
  it('returns the page and its readable neighbours as id/title/slug/icon only', async () => {
    s.getLocalPageGraph.mockResolvedValue({
      neighbours: [{ id: 9, title: 'Ops', slug: 'ops', icon: null, content: 'leak' }],
      links: [
        { sourcePageId: 5, targetPageId: 9 },
        { sourcePageId: 9, targetPageId: 44 },
      ],
    });

    const response = await get('/api/pages/5/graph');

    expect(response.status).toBe(200);
    expect(s.checkPagePermission).toHaveBeenCalledWith(7, 5, 'viewer');
    expect(s.getLocalPageGraph).toHaveBeenCalledWith(viewer, 5, 1);
    expect(response.body).toEqual({
      nodes: [
        { id: 5, title: 'Roadmap', slug: 'roadmap', icon: '🗺️' },
        { id: 9, title: 'Ops', slug: 'ops', icon: null },
      ],
      edges: [{ source: 5, target: 9 }],
    });
  });

  it('passes depth 2 through', async () => {
    await get('/api/pages/5/graph?depth=2');
    expect(s.getLocalPageGraph).toHaveBeenCalledWith(viewer, 5, 2);
  });

  it.each(['3', '0', 'deep'])('rejects depth=%s', async (depth) => {
    const response = await get(`/api/pages/5/graph?depth=${depth}`);

    expect(response.status).toBe(400);
    expect(s.getLocalPageGraph).not.toHaveBeenCalled();
  });

  it('refuses a page the caller cannot read before any graph query', async () => {
    s.checkPagePermission.mockResolvedValue(false);

    const response = await get('/api/pages/5/graph');

    expect(response.status).toBe(403);
    expect(s.getWikiPage).not.toHaveBeenCalled();
    expect(s.getLocalPageGraph).not.toHaveBeenCalled();
  });

  it('asks an anonymous caller to sign in for a protected page', async () => {
    s.checkPagePermission.mockResolvedValue(false);

    const response = await request(app).get('/api/pages/5/graph');

    expect(response.status).toBe(401);
    expect(s.getLocalPageGraph).not.toHaveBeenCalled();
  });

  it('answers 404 for a missing or trashed page', async () => {
    s.getWikiPage.mockResolvedValue(undefined);

    const response = await get('/api/pages/5/graph');

    expect(response.status).toBe(404);
    expect(s.getLocalPageGraph).not.toHaveBeenCalled();
  });

  it('does not leak internal errors', async () => {
    s.getLocalPageGraph.mockRejectedValue(new Error('relation "secret_table" missing'));

    const response = await get('/api/pages/5/graph');

    expect(response.status).toBe(500);
    expect(response.text).not.toContain('secret_table');
  });
});

describe('GET /api/pages/:id/unlinked-mentions', () => {
  it('returns mentions with a snippet and no content', async () => {
    s.getUnlinkedMentions.mockResolvedValue([
      {
        id: 12,
        title: 'Weekly',
        slug: 'weekly',
        icon: '📅',
        excerpt: 'We discussed the roadmap today.',
        offset: 0,
        contentLength: 31,
      },
    ]);

    const response = await get('/api/pages/5/unlinked-mentions');

    expect(response.status).toBe(200);
    expect(s.getUnlinkedMentions).toHaveBeenCalledWith(viewer, livePage, 20);
    expect(response.body).toEqual({
      mentions: [
        {
          id: 12,
          title: 'Weekly',
          slug: 'weekly',
          icon: '📅',
          snippet: 'We discussed the roadmap today.',
        },
      ],
    });
  });

  it('returns nothing for a one-character title without querying', async () => {
    s.getWikiPage.mockResolvedValue({ ...livePage, title: 'X' });

    const response = await get('/api/pages/5/unlinked-mentions');

    expect(response.body).toEqual({ mentions: [] });
    expect(s.getUnlinkedMentions).not.toHaveBeenCalled();
  });

  it('refuses a page the caller cannot read', async () => {
    s.checkPagePermission.mockResolvedValue(false);

    const response = await get('/api/pages/5/unlinked-mentions');

    expect(response.status).toBe(403);
    expect(s.getUnlinkedMentions).not.toHaveBeenCalled();
  });

  it('answers 404 for a missing or trashed page', async () => {
    s.getWikiPage.mockResolvedValue(undefined);

    const response = await get('/api/pages/5/unlinked-mentions');

    expect(response.status).toBe(404);
    expect(s.getUnlinkedMentions).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric page id', async () => {
    const response = await get('/api/pages/abc/unlinked-mentions');
    expect(response.status).toBe(400);
  });

  it('does not leak internal errors', async () => {
    s.getUnlinkedMentions.mockRejectedValue(new Error('relation "secret_table" missing'));

    const response = await get('/api/pages/5/unlinked-mentions');

    expect(response.status).toBe(500);
    expect(response.text).not.toContain('secret_table');
  });
});
