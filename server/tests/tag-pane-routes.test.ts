/**
 * Tag pane routes (#137) with real routes and mocked storage: the session and scope refusals,
 * that only the scope's readable pages are read (and with which caps), that the tags field and
 * inline `#tags` both count, nested counts, and the page list of a tag. The SQL read rule itself
 * (readablePagesInScope) runs against Postgres in tests/integration-layer4/tag-pane.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';
import { TAG_PANE_LIMITS } from '../services/tag-pane';

const TEST_SECRET = 'tag-pane-routes-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'tag-pane-routes-secret',
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

const token = jwt.sign({ id: 7, email: 'member@example.com', role: 'user' }, TEST_SECRET);
const forged = jwt.sign({ id: 7, email: 'member@example.com' }, 'not-the-server-secret');
const viewer = { userId: 7, email: 'member@example.com', teamIds: [3] };
const cookie = [`accessToken=${token}`];

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll((done) => {
  server.close(done);
});

const row = (id: number, tags: string[], teamId: number | null = null) => ({
  id,
  title: `Page ${id}`,
  slug: `page-${id}`,
  icon: id === 1 ? '🚀' : null,
  teamId,
  updatedAt: new Date(Date.UTC(2026, 10, 7, 0, 0, 100 - id)),
  tags,
});

/** Rows the scope query returns, and the content its read rule lets through. */
function givenPages(rows: ReturnType<typeof row>[], contents: Record<number, string>) {
  (storage.getTagPaneRows as any).mockResolvedValue(rows);
  (storage.getTagPaneContent as any).mockImplementation(
    async (_v: unknown, _t: unknown, ids: number[]) =>
      ids.filter((id) => id in contents).map((id) => ({ id, content: contents[id] }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getPageViewer as any).mockResolvedValue(viewer);
  (storage.getTeamByName as any).mockImplementation(async (name: string) =>
    name === 'alpha' ? { id: 3, name: 'alpha' } : name === 'beta' ? { id: 4 } : undefined
  );
  givenPages([], {});
});

describe.each(['/api/tags/tree', '/api/tags/pages?tag=x'])('GET %s refusals', (path) => {
  it('needs a session (even with write enforcement off) and never reads pages without one', async () => {
    for (const cookies of [[], [`accessToken=${forged}`]]) {
      const response = await request(app).get(path).set('Cookie', cookies);
      expect(response.status).toBe(401);
    }
    expect(storage.getTagPaneRows).not.toHaveBeenCalled();
  });

  it('refuses a team the caller is not in, an unknown team and a repeated teamId alike', async () => {
    const join = path.includes('?') ? '&' : '?';
    for (const team of ['4', 'beta', 'no-such-team', '999']) {
      const response = await request(app).get(`${path}${join}teamId=${team}`).set('Cookie', cookie);
      expect(response.status, team).toBe(403);
      expect(response.body).toEqual({ message: 'You are not a member of this team' });
    }
    const repeated = await request(app)
      .get(`${path}${join}teamId=3&teamId=4`)
      .set('Cookie', cookie);
    expect(repeated.status).toBe(400);
    expect(storage.getTagPaneRows).not.toHaveBeenCalled();
  });

  it('does not leak internal errors', async () => {
    (storage.getTagPaneRows as any).mockRejectedValue(
      new Error('relation "secret_table" does not exist')
    );
    const response = await request(app).get(path).set('Cookie', cookie);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret_table');
  });
});

describe('GET /api/tags/tree', () => {
  it("counts the scope's field and inline tags, nested, a parent once per page", async () => {
    givenPages(
      [
        row(1, ['project/alpha', '#Plan']),
        row(2, ['project/alpha']),
        row(3, []),
        row(4, ['', 'project']),
      ],
      {
        1: 'Body with #project/beta and `#not-code`',
        3: '# Heading\n\n- [ ] #inline-only and [#linked](/x)',
      }
    );

    const response = await request(app).get('/api/tags/tree').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      tags: [
        { name: 'project', count: 3, direct: 1 },
        { name: 'project/alpha', count: 2, direct: 2 },
        // Equal counts: by name, in code-unit order (the client sorts for display).
        { name: 'Plan', count: 1, direct: 1 },
        { name: 'inline-only', count: 1, direct: 1 },
        { name: 'project/beta', count: 1, direct: 1 },
      ],
      scannedPages: 4,
      truncated: { pages: false, tags: false },
    });
    // Personal scope: team-less pages only, through the viewer-scoped queries, with the caps.
    expect(storage.getTagPaneRows).toHaveBeenCalledWith(
      viewer,
      null,
      TAG_PANE_LIMITS.scannedPages + 1
    );
    expect(storage.getTagPaneContent).toHaveBeenCalledWith(
      viewer,
      null,
      [1, 2, 3, 4],
      TAG_PANE_LIMITS.contentChars
    );
  });

  it('reads a team by id or name for a current member', async () => {
    for (const team of ['3', 'alpha']) {
      const response = await request(app)
        .get(`/api/tags/tree?teamId=${team}`)
        .set('Cookie', cookie);
      expect(response.status).toBe(200);
    }
    expect((storage.getTagPaneRows as any).mock.calls.map((call: unknown[]) => call[1])).toEqual([
      3, 3,
    ]);
  });

  it('reads at most the cap of pages, content in batches, and says so', async () => {
    const rows = Array.from({ length: TAG_PANE_LIMITS.scannedPages + 1 }, (_, i) =>
      row(i + 1, ['t'])
    );
    givenPages(rows, {});

    const response = await request(app).get('/api/tags/tree').set('Cookie', cookie);

    expect(response.body.scannedPages).toBe(TAG_PANE_LIMITS.scannedPages);
    expect(response.body.truncated).toEqual({ pages: true, tags: false });
    expect(response.body.tags).toEqual([
      { name: 't', count: TAG_PANE_LIMITS.scannedPages, direct: TAG_PANE_LIMITS.scannedPages },
    ]);
    const batches = (storage.getTagPaneContent as any).mock.calls.map((call: unknown[]) => call[2]);
    expect(batches).toHaveLength(TAG_PANE_LIMITS.scannedPages / TAG_PANE_LIMITS.contentBatch);
    expect(batches.flat()).not.toContain(TAG_PANE_LIMITS.scannedPages + 1);
  });

  it('returns at most the cap of tags, keeping the parents of the tags it keeps', async () => {
    // 1050 tags under `group`, at most 100 per page: 11 pages carry some.
    const many = Array.from({ length: TAG_PANE_LIMITS.tags + 50 }, (_, i) => `group/t${i}`);
    givenPages(
      Array.from({ length: 12 }, (_, i) => row(i + 1, many.slice(i * 100, i * 100 + 100))),
      {}
    );

    const response = await request(app).get('/api/tags/tree').set('Cookie', cookie);

    expect(response.body.tags).toHaveLength(TAG_PANE_LIMITS.tags);
    expect(response.body.truncated.tags).toBe(true);
    expect(response.body.tags[0]).toEqual({ name: 'group', count: 11, direct: 0 });
  });
});

describe('GET /api/tags/pages', () => {
  beforeEach(() => {
    givenPages([row(1, ['project/alpha']), row(2, ['projects']), row(3, []), row(4, ['project'])], {
      3: 'note #project/beta/x and #other',
      2: '#project-not',
    });
  });

  it('lists the pages of a tag and of the tags under it, newest first', async () => {
    const response = await request(app)
      .get(`/api/tags/pages?tag=${encodeURIComponent('#project')}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.tag).toBe('project');
    expect(response.body.total).toBe(3);
    expect(response.body.truncated).toEqual({ pages: false, results: false });
    expect(response.body.pages).toEqual([
      {
        id: 1,
        title: 'Page 1',
        slug: 'page-1',
        icon: '🚀',
        teamId: null,
        updatedAt: row(1, []).updatedAt.toISOString(),
        tags: ['project/alpha'],
      },
      expect.objectContaining({ id: 3, tags: ['project/beta/x'] }),
      expect.objectContaining({ id: 4, tags: ['project'] }),
    ]);
    // No body text in the answer.
    expect(JSON.stringify(response.body)).not.toContain('note');
  });

  it('selects a nested tag and only what is under it', async () => {
    const response = await request(app)
      .get(`/api/tags/pages?tag=${encodeURIComponent('project/beta')}&teamId=alpha`)
      .set('Cookie', cookie);
    expect(response.body.pages.map((page: { id: number }) => page.id)).toEqual([3]);
    expect(storage.getTagPaneRows).toHaveBeenCalledWith(viewer, 3, expect.any(Number));
  });

  it('refuses a missing, empty, repeated or oversized tag', async () => {
    for (const query of ['', '?tag=', '?tag=%23', '?tag=a&tag=b', `?tag=${'a'.repeat(500)}`]) {
      const response = await request(app).get(`/api/tags/pages${query}`).set('Cookie', cookie);
      expect(response.status, query).toBe(400);
    }
    expect(storage.getTagPaneRows).not.toHaveBeenCalled();
  });

  it('caps the pages it returns and says how many there are', async () => {
    const rows = Array.from({ length: TAG_PANE_LIMITS.pages + 5 }, (_, i) => row(i + 1, ['t']));
    givenPages(rows, {});
    const response = await request(app).get('/api/tags/pages?tag=t').set('Cookie', cookie);
    expect(response.body.pages).toHaveLength(TAG_PANE_LIMITS.pages);
    expect(response.body.total).toBe(TAG_PANE_LIMITS.pages + 5);
    expect(response.body.truncated).toEqual({ pages: false, results: true });
  });
});
