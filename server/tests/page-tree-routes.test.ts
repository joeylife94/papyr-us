/**
 * Page tree routes (issue #103 E5), route level with a mocked storage whose checkPagePermission
 * answers from a fixed grant table. The SQL behind the tree is proven against PostgreSQL by
 * tests/integration-layer4/page-tree.test.ts.
 *
 * Rules under test:
 * - moving a page needs editor on the page and on the new parent;
 * - a parent in another team, or across team/personal, is refused (403);
 * - a page cannot move below itself (400);
 * - a missing or non-editable parent answers like a cross-team one (no existence oracle);
 * - creating a child joins the parent's team and needs editor on the parent;
 * - PUT re-parenting follows the same rules; a page with a parent or children keeps its team;
 * - deleting a page trashes its whole subtree, refused when any page in it is not the caller's
 *   to delete; restoring brings back what was trashed together, with the same rule.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
const OWNER = { id: 1, email: 'owner@example.com', teams: [TEAM_A, TEAM_B] };
const EDITOR = { id: 2, email: 'editor@example.com', teams: [TEAM_A] };
const VIEWER = { id: 3, email: 'viewer@example.com', teams: [TEAM_A] };
const PARTIAL = { id: 4, email: 'partial@example.com', teams: [TEAM_A] };
// Not a member of any team, but holds an editor grant on a team page (public or cross-team).
const GUEST = { id: 5, email: 'guest@example.com', teams: [] as number[] };
const USERS = [OWNER, EDITOR, VIEWER, PARTIAL, GUEST];

// Team A: ROOT > CHILD > GRANDCHILD, plus SIBLING at the root. Team B: OTHER. Personal: MINE.
const ROOT = 100;
const CHILD = 101;
const GRANDCHILD = 102;
const SIBLING = 103;
const OTHER = 200;
const MINE = 300;

const PAGES: Record<number, { id: number; teamId: number | null; parentId: number | null }> = {
  [ROOT]: { id: ROOT, teamId: TEAM_A, parentId: null },
  [CHILD]: { id: CHILD, teamId: TEAM_A, parentId: ROOT },
  [GRANDCHILD]: { id: GRANDCHILD, teamId: TEAM_A, parentId: CHILD },
  [SIBLING]: { id: SIBLING, teamId: TEAM_A, parentId: null },
  [OTHER]: { id: OTHER, teamId: TEAM_B, parentId: null },
  [MINE]: { id: MINE, teamId: null, parentId: null },
};

const all = (level: Level, ids: number[]) => Object.fromEntries(ids.map((id) => [id, level]));
const TEAM_A_PAGES = [ROOT, CHILD, GRANDCHILD, SIBLING];
const GRANTS: Record<number, Record<number, Level>> = {
  [OWNER.id]: { ...all('owner', TEAM_A_PAGES), [OTHER]: 'owner' },
  [EDITOR.id]: { ...all('editor', TEAM_A_PAGES), [MINE]: 'owner' },
  [VIEWER.id]: all('viewer', TEAM_A_PAGES),
  // Owns the top of the subtree but only edits the grandchild.
  [PARTIAL.id]: { [ROOT]: 'owner', [CHILD]: 'owner', [GRANDCHILD]: 'editor', [SIBLING]: 'owner' },
  [GUEST.id]: { [ROOT]: 'editor' },
};

const fullPage = (id: number) => ({
  ...PAGES[id],
  title: `Page ${id}`,
  slug: `page-${id}`,
  content: 'c',
  blocks: [],
  folder: 'docs',
  tags: [],
  author: OWNER.email,
  deletedAt: null,
});

const as = (user: { id: number; email: string }) => ({
  Authorization: `Bearer ${jwt.sign({ id: user.id, email: user.email, role: 'user' }, TEST_SECRET)}`,
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
    async (userId: number) => USERS.find((user) => user.id === userId)?.teams ?? []
  );
  storage.getWikiPage.mockImplementation(async (id: number) =>
    PAGES[id] ? fullPage(id) : undefined
  );
  storage.getLiveDescendantIds.mockImplementation(async (id: number) => {
    const out: number[] = [];
    const walk = (parent: number) =>
      Object.values(PAGES)
        .filter((p) => p.parentId === parent)
        .forEach((p) => {
          out.push(p.id);
          walk(p.id);
        });
    walk(id);
    return out;
  });
  storage.getAllDescendantIds.mockImplementation((id: number) => storage.getLiveDescendantIds(id));
  storage.getReadableSiblingIds.mockImplementation(
    async (_userId: number, parentId: number | null, teamId: number | null) =>
      Object.values(PAGES)
        .filter((p) => p.parentId === parentId && p.teamId === teamId)
        .map((p) => p.id)
  );
  storage.placePageInTree.mockResolvedValue(undefined);
  storage.updateWikiPage.mockImplementation(async (id: number, data: object) => ({
    ...fullPage(id),
    ...data,
  }));
  storage.createWikiPage.mockImplementation(async (data: object) => ({ id: 900, ...data }));
  storage.getTrashedTogetherIds.mockImplementation(async (id: number) =>
    id === ROOT ? [ROOT, CHILD, GRANDCHILD] : [id]
  );
});

const move = (user: typeof OWNER, id: number, body: object) =>
  request(app).post(`/api/pages/${id}/move`).set(as(user)).send(body);

describe('POST /api/pages/:id/move', () => {
  it('moves a page under an editable parent in its team, after the given sibling', async () => {
    const res = await move(EDITOR, SIBLING, { parentId: ROOT, afterId: CHILD });
    expect(res.status).toBe(200);
    expect(storage.placePageInTree).toHaveBeenCalledWith(SIBLING, ROOT, [CHILD, SIBLING]);
  });

  it('reorders at the root (parentId null, afterId null = first)', async () => {
    const res = await move(EDITOR, SIBLING, { parentId: null, afterId: null });
    expect(res.status).toBe(200);
    expect(storage.placePageInTree).toHaveBeenCalledWith(SIBLING, null, [SIBLING, ROOT]);
  });

  it('needs editor on the page', async () => {
    const res = await move(VIEWER, SIBLING, { parentId: ROOT });
    expect(res.status).toBe(403);
    expect(storage.placePageInTree).not.toHaveBeenCalled();
  });

  it('refuses a parent in another team, and between team and personal pages (403)', async () => {
    // OWNER may edit both teams' pages: the refusal is about the team, not the permission.
    const crossTeam = await move(OWNER, SIBLING, { parentId: OTHER });
    expect(crossTeam.status).toBe(403);
    expect(crossTeam.body.message).toMatch(/다른 워크스페이스/);
    const intoPersonal = await move(EDITOR, SIBLING, { parentId: MINE });
    expect(intoPersonal.status).toBe(403);
    expect(storage.placePageInTree).not.toHaveBeenCalled();
  });

  it('refuses moving a page below itself (400)', async () => {
    for (const parentId of [ROOT, CHILD, GRANDCHILD]) {
      const res = await move(EDITOR, ROOT, { parentId });
      expect(res.status, `parent ${parentId}`).toBe(400);
    }
    expect(storage.placePageInTree).not.toHaveBeenCalled();
  });

  it('answers a missing parent exactly like a non-editable one', async () => {
    const missing = await move(EDITOR, SIBLING, { parentId: 999 });
    const notEditable = await move(EDITOR, SIBLING, { parentId: OTHER });
    expect(missing.status).toBe(403);
    expect(notEditable.status).toBe(403);
    expect(missing.body).toEqual(notEditable.body);
  });

  it('refuses a position next to a page that is not a sibling there, and unknown fields', async () => {
    expect((await move(EDITOR, SIBLING, { parentId: ROOT, afterId: GRANDCHILD })).status).toBe(400);
    expect((await move(EDITOR, SIBLING, { parentId: ROOT, teamId: TEAM_B })).status).toBe(400);
    expect(storage.placePageInTree).not.toHaveBeenCalled();
  });
});

describe('POST /api/pages with a parent', () => {
  const body = {
    title: 'Child page',
    slug: 'child-page',
    content: '',
    folder: 'docs',
    author: 'e',
  };

  it('creates a child in the parent team, inheriting it when no team is sent', async () => {
    const explicit = await request(app)
      .post('/api/pages')
      .set(as(EDITOR))
      .send({ ...body, parentId: ROOT, teamId: TEAM_A });
    expect(explicit.status).toBe(201);
    const inherited = await request(app)
      .post('/api/pages')
      .set(as(EDITOR))
      .send({ ...body, parentId: ROOT });
    expect(inherited.status).toBe(201);
    expect(storage.createWikiPage.mock.calls[1][0]).toMatchObject({
      parentId: ROOT,
      teamId: TEAM_A,
    });
  });

  it('a non-member with an editor grant cannot create in the team by omitting teamId', async () => {
    const res = await request(app)
      .post('/api/pages')
      .set(as(GUEST))
      .send({ ...body, parentId: ROOT });
    expect(res.status).toBe(403);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });

  it('refuses a parent the caller cannot edit or in another team', async () => {
    const readOnly = await request(app)
      .post('/api/pages')
      .set(as(VIEWER))
      .send({ ...body, parentId: ROOT, teamId: TEAM_A });
    expect(readOnly.status).toBe(403);
    const otherTeam = await request(app)
      .post('/api/pages')
      .set(as(OWNER))
      .send({ ...body, parentId: OTHER, teamId: TEAM_A });
    expect(otherTeam.status).toBe(403);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });
});

describe('PUT /api/pages/:id re-parenting and team moves', () => {
  it('applies the move rules to parentId', async () => {
    const cycle = await request(app).put(`/api/pages/${ROOT}`).set(as(EDITOR)).send({
      parentId: GRANDCHILD,
    });
    expect(cycle.status).toBe(400);
    const crossTeam = await request(app).put(`/api/pages/${SIBLING}`).set(as(OWNER)).send({
      parentId: OTHER,
    });
    expect(crossTeam.status).toBe(403);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('keeps a page with a parent or children in its team (409)', async () => {
    const withChildren = await request(app).put(`/api/pages/${ROOT}`).set(as(OWNER)).send({
      teamId: TEAM_B,
    });
    expect(withChildren.status).toBe(409);
    const withParent = await request(app).put(`/api/pages/${GRANDCHILD}`).set(as(OWNER)).send({
      teamId: TEAM_B,
    });
    expect(withParent.status).toBe(409);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});

describe('Deleting and restoring a subtree', () => {
  it('trashes the page with all its descendants when the caller owns every one', async () => {
    const res = await request(app).delete(`/api/pages/${ROOT}`).set(as(OWNER));
    expect(res.status).toBe(200);
    expect(storage.trashPages).toHaveBeenCalledWith([ROOT, CHILD, GRANDCHILD]);
  });

  it('refuses, trashing nothing, when any descendant is not the caller’s to delete', async () => {
    const res = await request(app).delete(`/api/pages/${ROOT}`).set(as(PARTIAL));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/하위 문서/);
    expect(JSON.stringify(res.body)).not.toContain(`Page ${GRANDCHILD}`);
    expect(storage.trashPages).not.toHaveBeenCalled();
  });

  it('bulk delete takes each subtree, all or nothing', async () => {
    const refused = await request(app)
      .post('/api/pages/bulk/delete')
      .set(as(PARTIAL))
      .send({ pageIds: [SIBLING, ROOT] });
    expect(refused.status).toBe(403);
    expect(storage.trashPages).not.toHaveBeenCalled();

    const ok = await request(app)
      .post('/api/pages/bulk/delete')
      .set(as(OWNER))
      .send({ pageIds: [ROOT, SIBLING] });
    expect(ok.status).toBe(200);
    expect(storage.trashPages).toHaveBeenCalledWith([ROOT, CHILD, GRANDCHILD, SIBLING]);
  });

  it('restores what was trashed together, with the same ownership rule', async () => {
    const refused = await request(app).post(`/api/trash/${ROOT}/restore`).set(as(PARTIAL));
    expect(refused.status).toBe(403);
    expect(storage.restorePages).not.toHaveBeenCalled();

    const ok = await request(app).post(`/api/trash/${ROOT}/restore`).set(as(OWNER));
    expect(ok.status).toBe(200);
    expect(storage.restorePages).toHaveBeenCalledWith([ROOT, CHILD, GRANDCHILD]);
    expect(ok.body.restoredCount).toBe(3);
  });
});
