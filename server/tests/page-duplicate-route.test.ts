/**
 * POST /api/pages/:id/duplicate, route level with a mocked storage. Copying the page's inline
 * databases (#113 §4) in one transaction is proven against PostgreSQL by
 * tests/integration-layer4/page-duplicate.test.ts.
 *
 * Rules under test:
 * - the copy goes through storage.duplicateWikiPage (page and databases together), never a
 *   plain page create that would keep the source's database ids;
 * - reading the source is required, as before;
 * - the copy lands in the source's team and under its parent, so it also needs what
 *   POST /api/pages needs there: membership of the team, and editor on the parent. A reader
 *   who falls short gets 403 and nothing is copied. The same rule is proven against the real
 *   server by tests/security-page-duplicate.spec.ts;
 * - a failed copy answers the generic 500, without internal details.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'page-duplicate-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-duplicate-test-secret',
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

const TEAM = 10;
const OTHER_TEAM = 20;
const PARENT = 5; // team page at the top
const PAGE = 100; // team page under PARENT
const TOP = 110; // team page at the top
const PERSONAL = 120; // no team, no parent

const MEMBER = { id: 1, email: 'member@example.com', teams: [TEAM] };
// Not in the team, yet can read its pages (a grant to their own team, or a public link), and
// even edit the parent.
const OUTSIDER = { id: 2, email: 'outsider@example.com', teams: [OTHER_TEAM] };
// In the team, but may only read the parent.
const READER = { id: 3, email: 'reader@example.com', teams: [TEAM] };
const STRANGER = { id: 4, email: 'stranger@example.com', teams: [] as number[] };
const USERS = [MEMBER, OUTSIDER, READER, STRANGER];

// Highest level each user holds on each page
const GRANTS: Record<number, Record<number, Level>> = {
  [MEMBER.id]: { [PARENT]: 'editor', [PAGE]: 'viewer', [TOP]: 'viewer' },
  [OUTSIDER.id]: { [PARENT]: 'editor', [PAGE]: 'viewer', [TOP]: 'viewer' },
  [READER.id]: { [PARENT]: 'viewer', [PAGE]: 'viewer', [TOP]: 'viewer' },
  [STRANGER.id]: { [PERSONAL]: 'viewer' },
};

const blocks = [
  { id: 'p', type: 'paragraph', content: 'intro', properties: {}, order: 0, children: [] },
  { id: 'db', type: 'database_inline', content: 'DB', properties: { schemaId: 7 }, order: 1 },
];
const source = {
  id: PAGE,
  title: 'Plan',
  slug: 'plan',
  content: 'intro',
  blocks,
  folder: 'docs',
  tags: ['t'],
  author: 'owner@example.com',
  parentId: PARENT as number | null,
  teamId: TEAM as number | null,
  isPublished: true,
  metadata: { a: 1 },
  deletedAt: null,
};
const PAGES: Record<number, typeof source> = {
  [PAGE]: source,
  [PARENT]: { ...source, id: PARENT, slug: 'parent', parentId: null },
  [TOP]: { ...source, id: TOP, slug: 'top', parentId: null },
  [PERSONAL]: { ...source, id: PERSONAL, slug: 'mine', parentId: null, teamId: null },
};

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
  storage.getWikiPage.mockImplementation(async (id: number) => PAGES[id]);
  storage.getWikiPageBySlug.mockImplementation(async (slug: string) =>
    slug === 'plan-copy' ? { id: 101, slug } : undefined
  );
  storage.checkPagePermission.mockImplementation(
    async (userId: number | undefined, pageId: number, level: Level) => {
      const held = userId ? GRANTS[userId]?.[pageId] : undefined;
      return !!held && RANK[held] >= RANK[level];
    }
  );
  storage.getUserTeamIds.mockImplementation(
    async (userId: number) => USERS.find((user) => user.id === userId)?.teams ?? []
  );
  storage.duplicateWikiPage.mockImplementation(async (_id: number, page: any) => ({
    ...page,
    id: 102,
  }));
});

const duplicate = (id: number, user?: { id: number; email: string }) => {
  const call = request(app).post(`/api/pages/${id}/duplicate`);
  return user ? call.set(as(user)) : call;
};

describe('POST /api/pages/:id/duplicate', () => {
  it('copies the page and its databases together, owned by the caller', async () => {
    const res = await duplicate(PAGE, MEMBER);

    expect(res.status).toBe(201);
    const page = {
      title: 'Plan (Copy)',
      slug: 'plan-copy-1',
      content: 'intro',
      blocks,
      folder: 'docs',
      tags: ['t'],
      author: MEMBER.email,
      parentId: PARENT,
      teamId: TEAM,
      isPublished: false,
      metadata: { a: 1 },
    };
    expect(storage.duplicateWikiPage).toHaveBeenCalledTimes(1);
    expect(storage.duplicateWikiPage).toHaveBeenCalledWith(PAGE, page, MEMBER.id);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
    expect(res.body).toEqual({ ...page, id: 102 });
  });

  it('copies a top-level team page for a member of the team', async () => {
    const res = await duplicate(TOP, MEMBER);

    expect(res.status).toBe(201);
    expect(storage.duplicateWikiPage).toHaveBeenCalledWith(
      TOP,
      expect.objectContaining({ slug: 'top-copy', teamId: TEAM, parentId: null }),
      MEMBER.id
    );
  });

  it('copies a personal page for any caller who can read it', async () => {
    const res = await duplicate(PERSONAL, STRANGER);

    expect(res.status).toBe(201);
    expect(storage.duplicateWikiPage).toHaveBeenCalledWith(
      PERSONAL,
      expect.objectContaining({ teamId: null, parentId: null }),
      STRANGER.id
    );
  });

  it('needs read access to the page', async () => {
    const res = await duplicate(PAGE, STRANGER);

    expect(res.status).toBe(403);
    expect(storage.duplicateWikiPage).not.toHaveBeenCalled();
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });

  it('needs a signed-in caller', async () => {
    const res = await duplicate(PAGE);

    expect(res.status).toBe(401);
    expect(storage.duplicateWikiPage).not.toHaveBeenCalled();
  });

  it('refuses a reader outside the team: the copy would be a page in that team', async () => {
    for (const id of [TOP, PAGE]) {
      const res = await duplicate(id, OUTSIDER);
      expect(res.status, `page ${id}`).toBe(403);
      expect(res.body).toEqual({ message: 'You are not a member of this team' });
    }
    expect(storage.duplicateWikiPage).not.toHaveBeenCalled();
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });

  it('refuses a team member who cannot edit the parent the copy would go under', async () => {
    const res = await duplicate(PAGE, READER);

    expect(res.status).toBe(403);
    expect(storage.duplicateWikiPage).not.toHaveBeenCalled();
    expect(storage.createWikiPage).not.toHaveBeenCalled();
    // The same member may copy a page that has no parent.
    expect((await duplicate(TOP, READER)).status).toBe(201);
  });

  it('answers a failed copy with the generic error only', async () => {
    storage.duplicateWikiPage.mockRejectedValue(
      new Error('insert or update on table "database_rows" violates foreign key constraint')
    );

    const res = await duplicate(PAGE, MEMBER);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to duplicate page' });
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });
});
