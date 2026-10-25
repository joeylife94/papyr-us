/**
 * Page write routes authorize like their single-page counterparts. Route level, with a mocked
 * storage whose checkPagePermission answers from a fixed grant table; the same rules are proven
 * end to end against PostgreSQL by tests/security-page-write-access.spec.ts.
 *
 * Rules under test:
 * - bulk move/tags need editor and bulk delete needs owner on every listed page; one page
 *   falling short rejects the whole call and nothing changes;
 * - removing a page permission only removes a permission of that page;
 * - PUT /api/pages/:id: changing author, team or trash state needs owner, and a page can only
 *   move into a team the caller belongs to;
 * - restoring and permanently deleting a trashed page need owner;
 * - markdown import needs membership of the target team, like POST /api/pages.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'page-write-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-write-test-secret',
    adminPassword: 'test-admin',
    adminEmails: ['admin@example.com'],
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

vi.mock('../features', () => ({
  featureFlags: {
    PAPYR_MODE: 'team',
    FEATURE_TEAMS: true,
    FEATURE_ADMIN: true,
    FEATURE_CALENDAR: true,
    FEATURE_TEMPLATES: false,
    FEATURE_AUTOMATION: true,
    FEATURE_NOTIFICATIONS: true,
    FEATURE_AI_SEARCH: true,
    FEATURE_COLLABORATION: false,
  },
  isFeatureEnabled: () => true,
}));

vi.mock('../services/workflow', async () => ({
  triggerWorkflows: vi.fn().mockResolvedValue(undefined),
  initWorkflowService: vi.fn(),
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

type Level = 'viewer' | 'commenter' | 'editor' | 'owner';
const RANK: Record<Level, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

const TEAM_A = 10;
const TEAM_B = 20;
const TEAM_C = 30;
const OWNER = { id: 1, email: 'owner@example.com', teams: [TEAM_A, TEAM_C] };
const EDITOR = { id: 2, email: 'editor@example.com', teams: [TEAM_A] };
const OUTSIDER = { id: 3, email: 'outsider@example.com', teams: [TEAM_B] };
const USERS = [OWNER, EDITOR, OUTSIDER];

const PAGE_A = 100; // team A: owner owns it, editor may edit it
const PAGE_A2 = 101; // team A: owner owns it, editor may edit it
const PAGE_B = 200; // team B: outsider owns it

// Highest level each user holds on each page
const GRANTS: Record<number, Record<number, Level>> = {
  [OWNER.id]: { [PAGE_A]: 'owner', [PAGE_A2]: 'owner' },
  [EDITOR.id]: { [PAGE_A]: 'editor', [PAGE_A2]: 'editor' },
  [OUTSIDER.id]: { [PAGE_B]: 'owner' },
};

const pageA = {
  id: PAGE_A,
  title: 'Plan',
  slug: 'plan',
  content: 'c',
  folder: 'docs',
  tags: ['t0'],
  author: OWNER.email,
  teamId: TEAM_A,
};

function token(user: { id: number; email: string }) {
  return jwt.sign({ id: user.id, email: user.email, role: 'user' }, TEST_SECRET, {
    expiresIn: '1h',
  });
}
const as = (user: { id: number; email: string }) => ({ Authorization: `Bearer ${token(user)}` });

let app: Express;
let server: http.Server;
let bulkMoveWhere: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  storage.checkPagePermission.mockImplementation(
    async (userId: number | undefined, pageId: number, level: Level) => {
      const held = userId ? GRANTS[userId]?.[pageId] : undefined;
      return !!held && RANK[held] >= RANK[level];
    }
  );
  storage.getUserTeamIds.mockImplementation(
    async (userId: number) => USERS.find((user) => user.id === userId)?.teams ?? []
  );
  storage.getWikiPage.mockImplementation(async (id: number) => ({ ...pageA, id }));
  storage.updateWikiPage.mockImplementation(async (id: number, data: object) => ({
    ...pageA,
    id,
    ...data,
  }));
  storage.deleteWikiPage.mockResolvedValue(true);
  storage.restoreWikiPage.mockImplementation(async (id: number) => ({ ...pageA, id }));
  storage.permanentlyDeleteWikiPage.mockResolvedValue(true);
  storage.removePagePermission.mockResolvedValue(true);
  storage.createWikiPage.mockImplementation(async (data: object) => ({ id: 900, ...data }));

  // bulk/move updates through the query builder
  bulkMoveWhere = vi.fn(() => ({ returning: async () => [{ id: PAGE_A }] }));
  storage.db.update = vi.fn(() => ({ set: () => ({ where: bulkMoveWhere }) }));
});

describe('Bulk page operations need the single-page level on every listed page', () => {
  it('moves pages when the caller can edit every one of them', async () => {
    const res = await request(app)
      .post('/api/pages/bulk/move')
      .set(as(EDITOR))
      .send({ pageIds: [PAGE_A, PAGE_A2], folder: 'archive' });
    expect(res.status).toBe(200);
    expect(storage.db.update).toHaveBeenCalledTimes(1);
    expect(storage.checkPagePermission).toHaveBeenCalledWith(EDITOR.id, PAGE_A, 'editor');
    expect(storage.checkPagePermission).toHaveBeenCalledWith(EDITOR.id, PAGE_A2, 'editor');
  });

  it('rejects a move, changing nothing, when any listed page is not editable', async () => {
    for (const body of [
      { pageIds: [PAGE_A], folder: 'archive', user: OUTSIDER },
      { pageIds: [PAGE_A, PAGE_B], folder: 'archive', user: EDITOR },
    ]) {
      const res = await request(app)
        .post('/api/pages/bulk/move')
        .set(as(body.user))
        .send({ pageIds: body.pageIds, folder: body.folder });
      expect(res.status).toBe(403);
    }
    expect(storage.db.update).not.toHaveBeenCalled();
  });

  it('retags pages only when the caller can edit every one of them', async () => {
    const ok = await request(app)
      .post('/api/pages/bulk/tags')
      .set(as(EDITOR))
      .send({ pageIds: [PAGE_A], addTags: ['t1'] });
    expect(ok.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenCalledWith(PAGE_A, { tags: ['t0', 't1'] });

    storage.updateWikiPage.mockClear();
    const denied = await request(app)
      .post('/api/pages/bulk/tags')
      .set(as(EDITOR))
      .send({ pageIds: [PAGE_A, PAGE_B], addTags: ['t1'] });
    expect(denied.status).toBe(403);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('deletes pages only when the caller owns every one of them', async () => {
    const editorDelete = await request(app)
      .post('/api/pages/bulk/delete')
      .set(as(EDITOR))
      .send({ pageIds: [PAGE_A] });
    expect(editorDelete.status).toBe(403);

    const mixed = await request(app)
      .post('/api/pages/bulk/delete')
      .set(as(OWNER))
      .send({ pageIds: [PAGE_A, PAGE_B] });
    expect(mixed.status).toBe(403);
    expect(storage.deleteWikiPage).not.toHaveBeenCalled();

    const ok = await request(app)
      .post('/api/pages/bulk/delete')
      .set(as(OWNER))
      .send({ pageIds: [PAGE_A, PAGE_A2] });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ deleted: 2 });
    expect(storage.checkPagePermission).toHaveBeenCalledWith(OWNER.id, PAGE_A, 'owner');
  });

  it('rejects page ids that are not positive integers', async () => {
    for (const pageIds of [['abc'], [0], [1.5], 'nope']) {
      const res = await request(app)
        .post('/api/pages/bulk/delete')
        .set(as(OWNER))
        .send({ pageIds });
      expect(res.status).toBe(400);
    }
    expect(storage.deleteWikiPage).not.toHaveBeenCalled();
  });
});

describe('Removing a page permission is scoped to that page', () => {
  it('removes the permission only from the page named in the path', async () => {
    const res = await request(app).delete(`/api/pages/${PAGE_B}/permissions/7`).set(as(OUTSIDER));
    expect(res.status).toBe(200);
    expect(storage.removePagePermission).toHaveBeenCalledWith(PAGE_B, 7);
  });

  it('answers 404 when the permission does not belong to that page', async () => {
    storage.removePagePermission.mockResolvedValue(false);
    const res = await request(app).delete(`/api/pages/${PAGE_B}/permissions/7`).set(as(OUTSIDER));
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/pages/:id: author, team and trash state need owner', () => {
  const put = (user: { id: number; email: string }, body: object) =>
    request(app).put(`/api/pages/${PAGE_A}`).set(as(user)).send(body);

  it('lets an editor save content fields, re-sending the current author and team', async () => {
    const res = await put(EDITOR, { title: 'New title', author: OWNER.email, teamId: TEAM_A });
    expect(res.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenCalledTimes(1);
  });

  it('rejects an editor changing author, team or trash state', async () => {
    for (const body of [
      { author: EDITOR.email },
      { author: 'Someone else' },
      { teamId: TEAM_C },
      { teamId: null },
      { deletedAt: null },
    ]) {
      const res = await put(EDITOR, { title: 'x', ...body });
      expect(res.status, JSON.stringify(body)).toBe(403);
    }
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('lets an owner change author and move the page into one of their teams or out of teams', async () => {
    for (const body of [{ author: 'Display Name' }, { teamId: TEAM_C }, { teamId: null }]) {
      const res = await put(OWNER, body);
      expect(res.status, JSON.stringify(body)).toBe(200);
    }
    expect(storage.updateWikiPage).toHaveBeenCalledTimes(3);
  });

  it('rejects an owner moving the page into a team they are not a member of', async () => {
    const res = await put(OWNER, { teamId: TEAM_B });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/target team/);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});

describe('Trash writes need owner', () => {
  it('restores a trashed page for its owner only', async () => {
    const denied = await request(app).post(`/api/trash/${PAGE_A}/restore`).set(as(EDITOR));
    expect(denied.status).toBe(403);
    expect(storage.restoreWikiPage).not.toHaveBeenCalled();

    const ok = await request(app).post(`/api/trash/${PAGE_A}/restore`).set(as(OWNER));
    expect(ok.status).toBe(200);
    expect(storage.restoreWikiPage).toHaveBeenCalledWith(PAGE_A);
  });

  it('permanently deletes a trashed page for its owner only', async () => {
    for (const user of [EDITOR, OUTSIDER]) {
      const denied = await request(app).delete(`/api/trash/${PAGE_A}`).set(as(user));
      expect(denied.status).toBe(403);
    }
    expect(storage.permanentlyDeleteWikiPage).not.toHaveBeenCalled();

    const ok = await request(app).delete(`/api/trash/${PAGE_A}`).set(as(OWNER));
    expect(ok.status).toBe(200);
    expect(storage.permanentlyDeleteWikiPage).toHaveBeenCalledWith(PAGE_A);
  });
});

describe('Markdown import needs membership of the target team', () => {
  it('rejects an import into a team the caller is not a member of', async () => {
    const res = await request(app)
      .post('/api/pages/import/markdown')
      .set(as(OUTSIDER))
      .send({ content: '# Notes', teamId: TEAM_A });
    expect(res.status).toBe(403);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });

  it("imports into the caller's own team", async () => {
    const res = await request(app)
      .post('/api/pages/import/markdown')
      .set(as(EDITOR))
      .send({ content: '# Notes', teamId: TEAM_A });
    expect(res.status).toBe(201);
    expect(storage.createWikiPage).toHaveBeenCalledTimes(1);
  });
});

describe('In-place editing endpoints (issue #103 E1/E2) use the single-page levels', () => {
  it('reports edit rights to editors and owners, and nothing to callers who cannot view', async () => {
    const editor = await request(app).get(`/api/pages/${PAGE_A}/access`).set(as(EDITOR));
    expect(editor.status).toBe(200);
    expect(editor.body).toEqual({ canEdit: true });

    const owner = await request(app).get(`/api/pages/${PAGE_A}/access`).set(as(OWNER));
    expect(owner.body).toEqual({ canEdit: true });

    const outsider = await request(app).get(`/api/pages/${PAGE_A}/access`).set(as(OUTSIDER));
    expect(outsider.status).toBe(403);
  });

  it('autosaves for editors and refuses callers without edit rights', async () => {
    const ok = await request(app)
      .put(`/api/pages/${PAGE_A}/autosave`)
      .set(as(EDITOR))
      .send({ title: 'Renamed' });
    expect(ok.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenCalledWith(PAGE_A, { title: 'Renamed' });

    storage.updateWikiPage.mockClear();
    const denied = await request(app)
      .put(`/api/pages/${PAGE_A}/autosave`)
      .set(as(OUTSIDER))
      .send({ title: 'Hijack' });
    expect(denied.status).toBe(403);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('autosave cannot change team, author, trash state or slug (those stay owner-only on PUT)', async () => {
    for (const body of [
      { teamId: TEAM_C },
      { author: 'someone else' },
      { deletedAt: new Date().toISOString() },
      { slug: 'other' },
    ]) {
      const res = await request(app)
        .put(`/api/pages/${PAGE_A}/autosave`)
        .set(as(EDITOR))
        .send({ title: 'x', ...body });
      expect(res.status).toBe(400);
    }
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('checkpoints only for callers with edit rights', async () => {
    const ok = await request(app).post(`/api/pages/${PAGE_A}/checkpoint`).set(as(EDITOR));
    expect(ok.status).toBe(200);
    const denied = await request(app).post(`/api/pages/${PAGE_A}/checkpoint`).set(as(OUTSIDER));
    expect(denied.status).toBe(403);
  });
});
