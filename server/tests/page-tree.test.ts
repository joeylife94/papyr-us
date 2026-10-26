/**
 * Page tree rules (#103 E5, decisions D4/D5) at the route level, with a mocked storage whose
 * checkPagePermission answers from a fixed grant table. The SQL (readable tree, subtree, loop
 * walk, renumbering) is proven against PostgreSQL by tests/security-page-tree.spec.ts.
 *
 * Rules under test:
 * - GET /api/pages/tree resolves the scope fail-closed and only returns what the readable-tree
 *   query returns;
 * - POST /api/pages/:id/move needs editor on the page and on the new parent, refuses loops (400)
 *   and other teams (403), and answers an unreadable parent exactly like a missing one (404);
 * - POST /api/pages and PUT /api/pages/:id cannot bypass those rules through parentId/position;
 *   their tree checks are repeated under the workspace's tree lock; PUT and autosave leave pages
 *   in the trash alone (404); a team change never reveals a hidden parent;
 * - deleting (single or bulk) a page with sub-pages trashes the subtree only when the caller may
 *   delete every page in it, and the refusal names no page; restoring follows the same rule; a
 *   page already in the trash takes nothing with it;
 * - page payloads name a parent only when the viewer can see it and never carry a position;
 * - the trash lists only pages the caller can read.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'page-tree-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-tree-test-secret',
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
const OWNER = { id: 1, email: 'owner@example.com', teams: [TEAM_A, TEAM_B] };
const READER = { id: 2, email: 'reader@example.com', teams: [TEAM_A] };

// Team A: ROOT, CHILD (under ROOT), OTHER, SECRET (team-less, owner-only page of someone else).
const ROOT = 100;
const CHILD = 101;
const OTHER = 102;
const LOCKED = 103; // team A, readable by everyone in team A but editable by nobody here
const TEAM_B_PAGE = 200;
const SECRET = 300;
const HIDDEN_CHILD = 301; // team-less page of OWNER's under SECRET, which OWNER cannot read
const TRASHED = 400; // team A page in the trash (getWikiPage no longer finds it)

const PAGES: Record<number, { id: number; teamId: number | null; parentId: number | null }> = {
  [ROOT]: { id: ROOT, teamId: TEAM_A, parentId: null },
  [CHILD]: { id: CHILD, teamId: TEAM_A, parentId: ROOT },
  [OTHER]: { id: OTHER, teamId: TEAM_A, parentId: null },
  [LOCKED]: { id: LOCKED, teamId: TEAM_A, parentId: null },
  [TEAM_B_PAGE]: { id: TEAM_B_PAGE, teamId: TEAM_B, parentId: null },
  [SECRET]: { id: SECRET, teamId: null, parentId: null },
  [HIDDEN_CHILD]: { id: HIDDEN_CHILD, teamId: null, parentId: SECRET },
};

const GRANTS: Record<number, Record<number, Level>> = {
  [OWNER.id]: {
    [ROOT]: 'owner',
    [CHILD]: 'owner',
    [OTHER]: 'owner',
    [LOCKED]: 'viewer',
    [TEAM_B_PAGE]: 'owner',
    [HIDDEN_CHILD]: 'owner',
    [TRASHED]: 'owner',
  },
  [READER.id]: { [ROOT]: 'viewer', [CHILD]: 'viewer', [OTHER]: 'editor', [LOCKED]: 'viewer' },
};

function token(user: { id: number; email: string }) {
  return jwt.sign({ id: user.id, email: user.email, role: 'user' }, TEST_SECRET, {
    expiresIn: '1h',
  });
}
const as = (user: { id: number; email: string }) => ({ Authorization: `Bearer ${token(user)}` });
const viewerOf = (user: typeof OWNER | typeof READER) => ({
  userId: user.id,
  email: user.email,
  teamIds: user.teams,
});

let app: Express;
let server: http.Server;

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
    async (userId: number) => [OWNER, READER].find((user) => user.id === userId)?.teams ?? []
  );
  storage.getPageViewer.mockImplementation(async (userId?: number) => {
    const user = [OWNER, READER].find((candidate) => candidate.id === userId);
    return user ? viewerOf(user) : { teamIds: [] };
  });
  storage.getWikiPage.mockImplementation(async (id: number) =>
    PAGES[id]
      ? { ...PAGES[id], title: `Page ${id}`, slug: `page-${id}`, author: 'a', tags: [] }
      : undefined
  );
  // Live pages the viewer holds any grant on are readable parents.
  storage.getReadableLiveParents.mockImplementation(
    async (viewer: { userId?: number }, ids: number[]) =>
      new Map(
        ids
          .filter((id) => PAGES[id] && viewer?.userId && GRANTS[viewer.userId]?.[id])
          .map((id) => [id, PAGES[id].teamId])
      )
  );
  storage.getPageAncestorIds.mockImplementation(async (id: number) =>
    PAGES[id]?.parentId ? [PAGES[id].parentId] : []
  );
  storage.getLivePageDescendantIds.mockResolvedValue([]);
  storage.getPagesTrashedWith.mockResolvedValue([]);
  storage.movePage.mockImplementation(
    async (_viewer: unknown, id: number, parentId: number | null) => ({
      status: 'moved',
      page: { id, parentId },
    })
  );
  storage.getPageTree.mockResolvedValue([]);
  storage.deleteWikiPage.mockResolvedValue(true);
  storage.restoreWikiPage.mockImplementation(async (id: number) => ({ ...PAGES[id] }));
  storage.updateWikiPage.mockImplementation(async (id: number, data: object) => ({
    ...PAGES[id],
    title: 'x',
    tags: [],
    ...data,
  }));
  storage.createWikiPage.mockImplementation(async (data: object) => ({ id: 900, ...data }));
  storage.getTeamByName.mockResolvedValue(undefined);
});

describe('GET /api/pages/tree', () => {
  it("returns the readable tree of the caller's team", async () => {
    const node = {
      id: ROOT,
      title: 'Root',
      slug: 'root',
      icon: null,
      parentId: null,
      position: 0,
      updatedAt: new Date(0).toISOString(),
    };
    storage.getPageTree.mockResolvedValue([node]);

    const res = await request(app).get(`/api/pages/tree?teamId=${TEAM_A}`).set(as(READER));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pages: [node] });
    expect(storage.getPageTree).toHaveBeenCalledWith(viewerOf(READER), TEAM_A);
  });

  it('uses the team-less scope when no team is given', async () => {
    const res = await request(app).get('/api/pages/tree').set(as(READER));
    expect(res.status).toBe(200);
    expect(storage.getPageTree).toHaveBeenCalledWith(viewerOf(READER), null);
  });

  it.each([
    ['a team the caller is not in', `?teamId=${TEAM_B}`, READER, 403],
    ['an unknown team name', '?teamId=nope', READER, 403],
  ])('refuses %s without querying', async (_label, query, user, status) => {
    const res = await request(app).get(`/api/pages/tree${query}`).set(as(user));
    expect(res.status).toBe(status);
    expect(storage.getPageTree).not.toHaveBeenCalled();
  });

  it('refuses anonymous callers', async () => {
    const res = await request(app).get(`/api/pages/tree?teamId=${TEAM_A}`);
    expect(res.status).toBe(401);
    expect(storage.getPageTree).not.toHaveBeenCalled();
  });

  it('does not leak internal errors', async () => {
    storage.getPageTree.mockRejectedValue(new Error('relation "secret_table" does not exist'));
    const res = await request(app).get(`/api/pages/tree?teamId=${TEAM_A}`).set(as(READER));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret_table');
  });
});

describe('POST /api/pages/:id/move', () => {
  const move = (user: { id: number; email: string }, id: number, body: object) =>
    request(app).post(`/api/pages/${id}/move`).set(as(user)).send(body);

  it('moves a page under a parent the caller can edit, in the same team', async () => {
    const res = await move(OWNER, OTHER, { parentId: ROOT, index: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: OTHER, parentId: ROOT });
    expect(storage.movePage).toHaveBeenCalledWith(viewerOf(OWNER), OTHER, ROOT, 1);
  });

  it('moves a page to the workspace root with editor on the page alone', async () => {
    const res = await move(READER, OTHER, { parentId: null, index: 0 });
    expect(res.status).toBe(200);
    expect(storage.movePage).toHaveBeenCalledWith(viewerOf(READER), OTHER, null, 0);
  });

  it('refuses a move across teams (403)', async () => {
    const res = await move(OWNER, OTHER, { parentId: TEAM_B_PAGE, index: 0 });
    expect(res.status).toBe(403);
    expect(storage.movePage).not.toHaveBeenCalled();
  });

  it('refuses loops (400): under itself or under its own sub-page', async () => {
    const self = await move(OWNER, ROOT, { parentId: ROOT, index: 0 });
    const intoChild = await move(OWNER, ROOT, { parentId: CHILD, index: 0 });
    expect(self.status).toBe(400);
    expect(intoChild.status).toBe(400);
    expect(storage.movePage).not.toHaveBeenCalled();
  });

  it('reports a loop the storage detected under its lock (400)', async () => {
    storage.movePage.mockResolvedValue({ status: 'cycle' });
    const res = await move(OWNER, OTHER, { parentId: ROOT, index: 0 });
    expect(res.status).toBe(400);
  });

  it('does not say why a loop is refused (it may run through hidden pages)', async () => {
    const res = await move(OWNER, ROOT, { parentId: CHILD, index: 0 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'The page cannot be moved there' });
  });

  it('needs editor on the page (403) and on the new parent (403)', async () => {
    const pageNotEditable = await move(READER, ROOT, { parentId: null, index: 0 });
    const parentNotEditable = await move(OWNER, OTHER, { parentId: LOCKED, index: 0 });
    expect(pageNotEditable.status).toBe(403);
    expect(parentNotEditable.status).toBe(403);
    expect(storage.movePage).not.toHaveBeenCalled();
  });

  it('answers an unreadable page or parent exactly like a missing one (404)', async () => {
    const unreadablePage = await move(READER, TEAM_B_PAGE, { parentId: null, index: 0 });
    const missingPage = await move(READER, 999, { parentId: null, index: 0 });
    expect(unreadablePage.status).toBe(404);
    expect(unreadablePage.body).toEqual(missingPage.body);

    const unreadableParent = await move(OWNER, OTHER, { parentId: SECRET, index: 0 });
    const missingParent = await move(OWNER, OTHER, { parentId: 999, index: 0 });
    expect(unreadableParent.status).toBe(404);
    expect(missingParent.status).toBe(404);
    expect(unreadableParent.body).toEqual(missingParent.body);
    expect(storage.movePage).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies (400)', async () => {
    for (const body of [
      {},
      { parentId: ROOT },
      { parentId: 'root', index: 0 },
      { parentId: ROOT, index: -1 },
      { parentId: ROOT, index: 1.5 },
      { parentId: 0, index: 0 },
      { parentId: ROOT, index: 0, teamId: TEAM_B },
    ]) {
      const res = await move(OWNER, OTHER, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(storage.movePage).not.toHaveBeenCalled();
  });

  it('refuses anonymous callers', async () => {
    const res = await request(app)
      .post(`/api/pages/${OTHER}/move`)
      .send({ parentId: null, index: 0 });
    expect(res.status).toBe(401);
  });

  it('leaves POST /api/pages/bulk/move to the bulk route', async () => {
    const res = await request(app)
      .post('/api/pages/bulk/move')
      .set(as(OWNER))
      .send({ pageIds: [OTHER] });
    // The bulk route's own validation answers (folder missing), not the tree route.
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/folder/);
    expect(storage.movePage).not.toHaveBeenCalled();
  });
});

describe('POST /api/pages applies the tree rules to parentId and position', () => {
  const create = (user: { id: number; email: string }, extra: object) =>
    request(app)
      .post('/api/pages')
      .set(as(user))
      .send({
        title: 'New',
        slug: 'new',
        content: '',
        folder: 'docs',
        author: user.email,
        tags: [],
        teamId: TEAM_A,
        ...extra,
      });

  it('creates a sub-page under a parent the caller can edit, in the same team', async () => {
    const res = await create(OWNER, { parentId: ROOT });
    expect(res.status).toBe(201);
    expect(storage.createWikiPage).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: ROOT, teamId: TEAM_A }),
      OWNER.id
    );
  });

  it('refuses a parent in another team (403), not editable (403), unreadable or missing (404)', async () => {
    expect((await create(OWNER, { parentId: TEAM_B_PAGE })).status).toBe(403);
    expect((await create(READER, { parentId: ROOT })).status).toBe(403);
    const unreadable = await create(READER, { parentId: SECRET, teamId: undefined });
    const missing = await create(READER, { parentId: 999, teamId: undefined });
    expect(unreadable.status).toBe(404);
    expect(unreadable.body).toEqual(missing.body);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });

  it('checks the parent again under the tree lock before creating', async () => {
    // The parent moves to another team between the first check and the locked one.
    storage.getWikiPage
      .mockResolvedValueOnce({ ...PAGES[ROOT], title: 'Root' })
      .mockResolvedValueOnce({ ...PAGES[ROOT], teamId: TEAM_B, title: 'Root' });
    const res = await create(OWNER, { parentId: ROOT });
    expect(res.status).toBe(403);
    expect(storage.withPageTreeLock).toHaveBeenCalledWith(TEAM_A, expect.any(Function));
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });

  it('refuses a position (new pages go after their siblings)', async () => {
    const res = await create(OWNER, { parentId: ROOT, position: 0 });
    expect(res.status).toBe(400);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });
});

describe('PUT /api/pages/:id cannot move a page in the tree', () => {
  const put = (body: object) => request(app).put(`/api/pages/${CHILD}`).set(as(OWNER)).send(body);

  it('refuses a new parentId or position, pointing to the move route', async () => {
    for (const body of [{ parentId: OTHER }, { parentId: null }, { position: 3 }]) {
      const res = await put({ title: 'x', ...body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.message).toMatch(/move/);
    }
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('accepts the current values and never writes them', async () => {
    const res = await put({ title: 'Renamed', parentId: ROOT, position: null });
    expect(res.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenCalledWith(CHILD, { title: 'Renamed' });
  });

  it('refuses a team change while the page is in the tree (409), under the tree lock', async () => {
    const withParent = await put({ teamId: TEAM_B });
    storage.getLivePageDescendantIds.mockResolvedValue([CHILD]);
    const withSubPages = await request(app)
      .put(`/api/pages/${ROOT}`)
      .set(as(OWNER))
      .send({ teamId: TEAM_B });
    expect(withParent.status).toBe(409);
    expect(withSubPages.status).toBe(409);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
    expect(storage.withPageTreeLock).toHaveBeenCalledWith(TEAM_A, expect.any(Function));
  });

  it('treats a page under a hidden parent as a root page on a team change (no 409, D4)', async () => {
    const res = await request(app)
      .put(`/api/pages/${HIDDEN_CHILD}`)
      .set(as(OWNER))
      .send({ teamId: TEAM_A });
    expect(res.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenCalledWith(HIDDEN_CHILD, {
      teamId: TEAM_A,
      parentId: null,
    });
    expect(JSON.stringify(res.body)).not.toContain(String(SECRET));
    expect(storage.withPageTreeLock).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it('answers 404 for a page in the trash, so PUT neither edits nor restores it', async () => {
    for (const body of [{ teamId: TEAM_B }, { deletedAt: null }, { title: 'x' }]) {
      const res = await request(app).put(`/api/pages/${TRASHED}`).set(as(OWNER)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(404);
    }
    const autosave = await request(app)
      .put(`/api/pages/${TRASHED}/autosave`)
      .set(as(OWNER))
      .send({ title: 'x' });
    expect(autosave.status).toBe(404);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('keeps the autosave schema strict (no parentId/position)', async () => {
    for (const body of [{ parentId: OTHER }, { position: 1 }]) {
      const res = await request(app)
        .put(`/api/pages/${CHILD}/autosave`)
        .set(as(OWNER))
        .send({ title: 'x', ...body });
      expect(res.status).toBe(400);
    }
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});

describe('Deleting a page with sub-pages (D5)', () => {
  it('trashes the whole subtree when the caller may delete every page in it', async () => {
    storage.getLivePageDescendantIds.mockResolvedValue([CHILD]);
    const res = await request(app).delete(`/api/pages/${ROOT}`).set(as(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.subPages).toBe(1);
    expect(storage.deleteWikiPage).toHaveBeenCalledWith(ROOT, [CHILD]);
  });

  it('refuses, naming no page, when one sub-page is not deletable', async () => {
    storage.getLivePageDescendantIds.mockResolvedValue([CHILD, SECRET]);
    const res = await request(app).delete(`/api/pages/${ROOT}`).set(as(OWNER));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SUBTREE_NOT_DELETABLE');
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(String(SECRET));
    expect(text).not.toContain(`Page ${SECRET}`);
    expect(storage.deleteWikiPage).not.toHaveBeenCalled();
  });

  it('applies the same rule to bulk delete, trashing nested listed pages once', async () => {
    storage.getLivePageDescendantIds.mockImplementation(async (id: number) =>
      id === ROOT ? [CHILD] : []
    );
    const ok = await request(app)
      .post('/api/pages/bulk/delete')
      .set(as(OWNER))
      .send({ pageIds: [CHILD, ROOT, OTHER] });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ deleted: 3 });
    expect(storage.deleteWikiPage).toHaveBeenCalledTimes(2);
    expect(storage.deleteWikiPage).toHaveBeenCalledWith(ROOT, [CHILD]);
    expect(storage.deleteWikiPage).toHaveBeenCalledWith(OTHER, []);

    storage.deleteWikiPage.mockClear();
    storage.getLivePageDescendantIds.mockImplementation(async (id: number) =>
      id === ROOT ? [CHILD, SECRET] : []
    );
    const refused = await request(app)
      .post('/api/pages/bulk/delete')
      .set(as(OWNER))
      .send({ pageIds: [ROOT, OTHER] });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('SUBTREE_NOT_DELETABLE');
    expect(JSON.stringify(refused.body)).not.toContain(String(SECRET));
    expect(storage.deleteWikiPage).not.toHaveBeenCalled();
  });

  it('skips a listed page that is already in the trash, taking nothing with it', async () => {
    storage.getLivePageDescendantIds.mockResolvedValue([CHILD]);
    const res = await request(app)
      .post('/api/pages/bulk/delete')
      .set(as(OWNER))
      .send({ pageIds: [TRASHED] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 0 });
    expect(storage.getLivePageDescendantIds).not.toHaveBeenCalled();
    expect(storage.deleteWikiPage).not.toHaveBeenCalled();
  });

  it('restores what was trashed with the page, under the same rule', async () => {
    storage.getPagesTrashedWith.mockResolvedValue([CHILD]);
    const ok = await request(app).post(`/api/trash/${ROOT}/restore`).set(as(OWNER));
    expect(ok.status).toBe(200);
    expect(storage.restoreWikiPage).toHaveBeenCalledWith(ROOT, [CHILD]);

    storage.restoreWikiPage.mockClear();
    storage.getPagesTrashedWith.mockResolvedValue([CHILD, SECRET]);
    const refused = await request(app).post(`/api/trash/${ROOT}/restore`).set(as(OWNER));
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('SUBTREE_NOT_RESTORABLE');
    expect(storage.restoreWikiPage).not.toHaveBeenCalled();
  });
});

describe('GET /api/pages/:id/ancestors', () => {
  it('returns the readable ancestors the storage walk found', async () => {
    const ancestors = [{ id: ROOT, title: 'Root', slug: 'root', icon: null }];
    storage.getReadablePageAncestors.mockResolvedValue(ancestors);
    const res = await request(app).get(`/api/pages/${CHILD}/ancestors`).set(as(READER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ancestors });
    expect(storage.getReadablePageAncestors).toHaveBeenCalledWith(viewerOf(READER), CHILD);
  });

  it('needs read access to the page itself', async () => {
    const res = await request(app).get(`/api/pages/${SECRET}/ancestors`).set(as(READER));
    expect(res.status).toBe(403);
    expect(storage.getReadablePageAncestors).not.toHaveBeenCalled();
  });
});

describe('Duplicating keeps the copy under the parent only under the tree rules', () => {
  it('puts the copy at the root when the caller cannot edit the parent', async () => {
    storage.getWikiPageBySlug.mockResolvedValue(undefined);
    const res = await request(app).post(`/api/pages/${CHILD}/duplicate`).set(as(READER));
    expect(res.status).toBe(201);
    expect(storage.createWikiPage).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null }),
      READER.id
    );

    storage.createWikiPage.mockClear();
    await request(app).post(`/api/pages/${CHILD}/duplicate`).set(as(OWNER));
    expect(storage.createWikiPage).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: ROOT }),
      OWNER.id
    );
  });
});

describe('Page payloads carry tree fields as the viewer sees them (D4)', () => {
  it('names a parent only when the viewer can see it, and never a stored position', async () => {
    storage.getWikiPage.mockImplementation(async (id: number) =>
      PAGES[id] ? { ...PAGES[id], title: `Page ${id}`, position: 300 } : undefined
    );
    const visible = await request(app).get(`/api/pages/${CHILD}`).set(as(READER));
    expect(visible.status).toBe(200);
    expect(visible.body).toMatchObject({ id: CHILD, parentId: ROOT, position: null });

    const hidden = await request(app).get(`/api/pages/${HIDDEN_CHILD}`).set(as(OWNER));
    expect(hidden.status).toBe(200);
    expect(hidden.body).toMatchObject({ id: HIDDEN_CHILD, parentId: null, position: null });
    expect(JSON.stringify(hidden.body)).not.toContain(String(SECRET));
  });

  it('applies to the slug read and to listings, with one parent lookup per response', async () => {
    storage.getWikiPageBySlug.mockResolvedValue({ ...PAGES[HIDDEN_CHILD], position: 4 });
    const bySlug = await request(app).get('/api/pages/slug/hidden').set(as(OWNER));
    expect(bySlug.body).toMatchObject({ parentId: null, position: null });

    storage.getReadableLiveParents.mockClear();
    storage.getReadableWikiPagesByFolder.mockResolvedValue([
      { ...PAGES[CHILD], position: 7 },
      { ...PAGES[HIDDEN_CHILD], position: 2 },
      { ...PAGES[ROOT], position: 0 },
    ]);
    const folder = await request(app).get('/api/folders/docs/pages').set(as(OWNER));
    expect(folder.status).toBe(200);
    expect(folder.body.map((page: any) => [page.id, page.parentId, page.position])).toEqual([
      [CHILD, ROOT, null],
      [HIDDEN_CHILD, null, null],
      [ROOT, null, null],
    ]);
    expect(storage.getReadableLiveParents).toHaveBeenCalledTimes(1);
    expect(storage.getReadableLiveParents).toHaveBeenCalledWith(viewerOf(OWNER), [ROOT, SECRET]);
  });
});

describe('GET /api/trash lists only readable trashed pages, without content', () => {
  it('asks the storage for the caller’s readable trash and returns its rows', async () => {
    const row = {
      id: TRASHED,
      title: 'Old plan',
      slug: 'old-plan',
      icon: null,
      folder: 'docs',
      author: 'a',
      teamId: TEAM_A,
      deletedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    storage.getReadableTrashPages.mockResolvedValue([row]);
    const res = await request(app).get(`/api/trash?teamId=${TEAM_A}`).set(as(READER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([row]);
    expect(storage.getReadableTrashPages).toHaveBeenCalledWith(viewerOf(READER), TEAM_A);
    expect(storage.getTrashPages).not.toHaveBeenCalled();
  });

  it('refuses anonymous callers', async () => {
    const res = await request(app).get('/api/trash');
    expect(res.status).toBe(401);
    expect(storage.getReadableTrashPages).not.toHaveBeenCalled();
  });
});
