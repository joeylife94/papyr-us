/**
 * Security Tests — covers all 6 vulnerability areas identified in the security audit
 *
 * 4-1  Page route team isolation bypass
 * 4-2  Cross-team resource reassignment
 * 4-3  Notification IDOR
 * 4-4  AI / aggregate route scope leak
 * 4-5  File download public access
 * 4-6  (this file is the coverage proof for the above)
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { config } from '../config.js';

const TEST_SECRET = 'security-test-secret';

// ─── Config mock ─────────────────────────────────────────────────────────────
vi.mock('../config', () => ({
  config: {
    jwtSecret: 'security-test-secret',
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

// ─── Feature flags mock — enable all relevant features ───────────────────────
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
  isFeatureEnabled: (key: string) => true,
}));

// ─── Upload service mock ──────────────────────────────────────────────────────
vi.mock('../services/upload', async () => {
  const actual = (await vi.importActual('../services/upload')) as any;
  return {
    ...actual,
    processUploadedFile: vi.fn(),
    listUploadedFiles: vi.fn().mockResolvedValue({ images: [], files: [] }),
    getFileInfo: vi.fn(),
    deleteUploadedFile: vi.fn(),
    getFileTeamId: vi.fn(),
  };
});

// ─── AI service mock ──────────────────────────────────────────────────────────
vi.mock('../services/ai', async () => ({
  smartSearch: vi.fn().mockResolvedValue([]),
  generateSearchSuggestions: vi.fn().mockResolvedValue([]),
  generateContent: vi.fn().mockResolvedValue(''),
  generateContentSuggestions: vi.fn().mockResolvedValue([]),
  findRelatedPages: vi.fn().mockResolvedValue([]),
  chatWithCopilot: vi.fn().mockResolvedValue(''),
  extractTasks: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/ai-assistant', async () => ({
  aiAssistant: { chat: vi.fn().mockResolvedValue('') },
}));

vi.mock('../services/workflow', async () => ({
  triggerWorkflows: vi.fn().mockResolvedValue(undefined),
  initWorkflowService: vi.fn(),
}));

// ─── Storage mock ─────────────────────────────────────────────────────────────
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const dbStorageInstance = new actual.DBStorage();
  for (const key of Object.getOwnPropertyNames(actual.DBStorage.prototype)) {
    if (key !== 'constructor' && typeof dbStorageInstance[key] === 'function') {
      dbStorageInstance[key] = vi.fn();
    }
  }
  return {
    ...actual,
    DBStorage: vi.fn(() => dbStorageInstance),
    storage: dbStorageInstance,
    getStorage: vi.fn(() => dbStorageInstance),
  };
});

import * as storageModule from '../storage.js';
import { getFileTeamId, listUploadedFiles, getFileInfo } from '../services/upload.js';
const storage: any = (storageModule as any).storage;

// ─── Test fixtures ────────────────────────────────────────────────────────────
const USER_A_ID = 1;
const USER_B_ID = 2;
const TEAM_A_ID = 10;
const TEAM_B_ID = 20;

function makeToken(userId: number): string {
  return jwt.sign({ id: userId, email: `user${userId}@example.com`, role: 'user' }, TEST_SECRET, {
    expiresIn: '1h',
  });
}

const tokenA = makeToken(USER_A_ID);
const tokenB = makeToken(USER_B_ID);

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();

  // User A → team 10 only; User B → team 20 only
  storage.getUserTeamIds.mockImplementation(async (userId: number) => {
    if (userId === USER_A_ID) return [TEAM_A_ID];
    if (userId === USER_B_ID) return [TEAM_B_ID];
    return [];
  });

  storage.getUserTeamRole.mockResolvedValue(null);
  // NOTE: checkPagePermission is intentionally NOT given a blanket mock here.
  // Each 4-1 route test sets it explicitly. Direct unit tests below invoke the
  // real implementation via vi.importActual to validate the storage-layer fix.
  storage.getUserPagePermission.mockResolvedValue(null);
  (listUploadedFiles as any).mockResolvedValue({ images: [], files: [] });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// =============================================================================
// 4-1  Page route team isolation bypass
// =============================================================================
describe('4-1  Page team isolation', () => {
  const teamPage = { id: 5, slug: 'my-page', title: 'My Page', teamId: TEAM_A_ID };

  it('GET /api/pages/:id — returns 403 when page belongs to a team the user is not in', async () => {
    storage.getWikiPage.mockResolvedValue(teamPage);
    // checkPagePermission should deny user B for team-A page
    storage.checkPagePermission.mockResolvedValue(false);
    const res = await request(app).get('/api/pages/5').set(auth(tokenB));
    expect(res.status).toBe(403);
  });

  it('GET /api/pages/:id — returns 401 for unauthenticated access to a team page', async () => {
    storage.getWikiPage.mockResolvedValue(teamPage);
    storage.checkPagePermission.mockResolvedValue(false);
    const res = await request(app).get('/api/pages/5');
    expect(res.status).toBe(401);
  });

  it('GET /api/pages/:id — allows access when user is in the page team', async () => {
    storage.getWikiPage.mockResolvedValue(teamPage);
    storage.checkPagePermission.mockResolvedValue(true);
    const res = await request(app).get('/api/pages/5').set(auth(tokenA));
    expect(res.status).toBe(200);
  });

  it('GET /api/pages/slug/:slug — returns 403 for wrong-team user', async () => {
    storage.getWikiPageBySlug.mockResolvedValue(teamPage);
    storage.checkPagePermission.mockResolvedValue(false);
    const res = await request(app).get('/api/pages/slug/my-page').set(auth(tokenB));
    expect(res.status).toBe(403);
  });

  it('DELETE /api/pages/:id — returns 403 for wrong-team user', async () => {
    storage.getWikiPage.mockResolvedValue(teamPage);
    storage.checkPagePermission.mockResolvedValue(false);
    const res = await request(app).delete('/api/pages/5').set(auth(tokenB));
    expect(res.status).toBe(403);
  });

  it('GET /api/pages/:id/versions — returns 403 for a user not in the page team', async () => {
    storage.getWikiPage.mockResolvedValue(teamPage);
    storage.checkPagePermission.mockResolvedValue(false);
    const res = await request(app).get('/api/pages/5/versions').set(auth(tokenB));
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// 4-1  checkPagePermission — direct unit tests (validates the storage-layer fix)
//
// These bypass the HTTP layer entirely and call the REAL checkPagePermission
// implementation (via vi.importActual) with a faked DB object.  If someone
// reverts the storage.ts 4-1 fix these tests will fail, unlike the route-level
// tests above which only verify middleware plumbing.
// =============================================================================
describe('4-1  checkPagePermission logic (direct unit tests — no mock)', () => {
  let realCheckPagePermission: Function;

  beforeAll(async () => {
    const realModule = await vi.importActual<any>('../storage.js');
    realCheckPagePermission = realModule.DBStorage.prototype.checkPagePermission;
  });

  /**
   * Build a minimal storage-like instance with:
   *  - a fake `db` that returns controlled rows for the first two select() calls
   *    (first call = page rows, second call = pagePermissions rows)
   *  - a mocked getUserTeamIds
   *  - checkPagePermission bound from the real DBStorage prototype
   */
  function createInstance(pageRows: any[], permRows: any[]) {
    const results = [pageRows, permRows];
    let callIdx = 0;
    const inst: any = {
      db: {
        select: () => {
          const idx = callIdx++;
          return {
            from: () => ({
              where: () => Promise.resolve(results[idx] ?? []),
            }),
          };
        },
      },
      getUserTeamIds: vi.fn(),
    };
    inst.checkPagePermission = realCheckPagePermission.bind(inst);
    return inst;
  }

  it('denies when page has teamId, no permission rows, and user is NOT in that team', async () => {
    const inst = createInstance(
      [{ id: 5, teamId: String(TEAM_A_ID), author: 'other@example.com' }],
      [] // no explicit permissions — triggers the 4-1 fallback path
    );
    inst.getUserTeamIds.mockResolvedValue([TEAM_B_ID]); // user in team B only
    expect(await inst.checkPagePermission(USER_B_ID, 5, 'viewer')).toBe(false);
  });

  it('allows when page has teamId, no permission rows, and user IS in that team', async () => {
    const inst = createInstance(
      [{ id: 5, teamId: String(TEAM_A_ID), author: 'other@example.com' }],
      []
    );
    inst.getUserTeamIds.mockResolvedValue([TEAM_A_ID]); // user in team A
    expect(await inst.checkPagePermission(USER_A_ID, 5, 'viewer')).toBe(true);
  });

  it('denies unauthenticated access when page has teamId and no permission rows', async () => {
    const inst = createInstance(
      [{ id: 5, teamId: String(TEAM_A_ID), author: 'other@example.com' }],
      []
    );
    expect(await inst.checkPagePermission(undefined, 5, 'viewer')).toBe(false);
  });

  it('allows open access for legacy page (no teamId, no permission rows)', async () => {
    const inst = createInstance([{ id: 5, teamId: null, author: 'other@example.com' }], []);
    expect(await inst.checkPagePermission(USER_A_ID, 5, 'viewer')).toBe(true);
  });
});

// =============================================================================
// 4-2  Cross-team resource reassignment
// =============================================================================
describe('4-2  Cross-team reassignment', () => {
  // ─── Tasks ─────────────────────────────────────────────────────────────────
  describe('Tasks', () => {
    const taskInA = {
      id: 1,
      title: 'task',
      teamId: String(TEAM_A_ID),
      status: 'todo',
      progress: 0,
    };

    it('PUT /api/tasks/:id — rejects when new teamId moves task to a team user does not belong to', async () => {
      storage.getTask.mockResolvedValue(taskInA);
      // User A is in team 10 only — trying to move task to team 20
      const res = await request(app)
        .put('/api/tasks/1')
        .set(auth(tokenA))
        .send({ title: 'updated', teamId: TEAM_B_ID });
      expect(res.status).toBe(403);
    });

    it('PUT /api/tasks/:id — rejects when a team-less (global) task is moved to an unauthorized team', async () => {
      // The original task has NO teamId — verifies the bypass fix where a global task
      // could previously be moved to any team because the team check was guarded by
      // `if (oldTask?.teamId && ...)`.
      const globalTask = { id: 99, title: 'global', teamId: null, status: 'todo', progress: 0 };
      storage.getTask.mockResolvedValue(globalTask);
      const res = await request(app)
        .put('/api/tasks/99')
        .set(auth(tokenA))
        .send({ title: 'updated', teamId: TEAM_B_ID }); // User A (team 10) → team 20 (unauthorized)
      expect(res.status).toBe(403);
    });

    it('PUT /api/tasks/:id — allows update without teamId change', async () => {
      storage.getTask.mockResolvedValue(taskInA);
      storage.updateTask.mockResolvedValue({ ...taskInA, title: 'updated' });
      const res = await request(app)
        .put('/api/tasks/1')
        .set(auth(tokenA))
        .send({ title: 'updated' });
      expect(res.status).toBe(200);
    });
  });

  // ─── Calendar events ────────────────────────────────────────────────────────
  describe('Calendar events', () => {
    const eventInA = {
      id: 1,
      title: 'Event',
      teamId: TEAM_A_ID,
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
    };

    it('PATCH /api/calendar/event/:id — rejects cross-team move', async () => {
      storage.getCalendarEvent.mockResolvedValue(eventInA);
      const res = await request(app)
        .patch('/api/calendar/event/1')
        .set(auth(tokenA))
        .send({ title: 'hacked', teamId: TEAM_B_ID });
      expect(res.status).toBe(403);
    });

    it('PATCH /api/calendar/event/:id — rejects user from wrong team', async () => {
      storage.getCalendarEvent.mockResolvedValue(eventInA);
      const res = await request(app)
        .patch('/api/calendar/event/1')
        .set(auth(tokenB))
        .send({ title: 'hacked' });
      expect(res.status).toBe(403);
    });
  });

  // ─── Saved views ────────────────────────────────────────────────────────────
  describe('Saved views', () => {
    const viewInA = { id: 1, name: 'My View', teamId: TEAM_A_ID, entityType: 'tasks' };

    it('PUT /api/saved-views/:id — rejects cross-team move', async () => {
      storage.getSavedView.mockResolvedValue(viewInA);
      // requireTeamMembership uses userTeamIds which is overridden in beforeEach
      const res = await request(app)
        .put('/api/saved-views/1')
        .set(auth(tokenA))
        .send({ name: 'Updated', teamId: TEAM_B_ID });
      // User A is in team 10, TEAM_B_ID = 20 — should be rejected
      expect(res.status).toBe(403);
    });

    it('PUT /api/saved-views/:id — rejects user from wrong team entirely', async () => {
      storage.getSavedView.mockResolvedValue(viewInA);
      const res = await request(app)
        .put('/api/saved-views/1')
        .set(auth(tokenB))
        .send({ name: 'Updated' });
      expect(res.status).toBe(403);
    });
  });

  // ─── Members ────────────────────────────────────────────────────────────────
  describe('Members', () => {
    const memberInA = { id: 1, name: 'Alice', teamId: TEAM_A_ID };

    it('PUT /api/members/:id — rejects cross-team move when user lacks role in target team', async () => {
      storage.getMember.mockResolvedValue(memberInA);
      storage.getUserTeamRole.mockResolvedValue('admin'); // user can edit in team A
      // But user A is not in team B
      const res = await request(app)
        .put('/api/members/1')
        .set(auth(tokenA))
        .send({ name: 'Alice Updated', teamId: TEAM_B_ID });
      expect(res.status).toBe(403);
    });
  });
});

// =============================================================================
// 4-3  Notification IDOR
// =============================================================================
describe('4-3  Notification IDOR', () => {
  const notifForA = {
    id: 42,
    type: 'mention',
    title: 'Hi',
    content: 'Content',
    recipientId: USER_A_ID,
    isRead: false,
  };

  it('GET /api/notifications — requires authentication', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it("GET /api/notifications — returns only the authenticated user's notifications", async () => {
    storage.getNotifications.mockResolvedValue([notifForA]);
    const res = await request(app).get('/api/notifications').set(auth(tokenA));
    expect(res.status).toBe(200);
    // storage should have been called with User A's ID, not a spoofed one
    expect(storage.getNotifications).toHaveBeenCalledWith(USER_A_ID);
  });

  it('GET /api/notifications/unread-count — requires authentication', async () => {
    const res = await request(app).get('/api/notifications/unread-count');
    expect(res.status).toBe(401);
  });

  it('GET /api/notifications/unread-count — scoped to authenticated user', async () => {
    storage.getUnreadNotificationCount.mockResolvedValue(3);
    const res = await request(app).get('/api/notifications/unread-count').set(auth(tokenA));
    expect(res.status).toBe(200);
    expect(storage.getUnreadNotificationCount).toHaveBeenCalledWith(USER_A_ID);
  });

  it('GET /api/notifications/:id — requires authentication', async () => {
    const res = await request(app).get('/api/notifications/42');
    expect(res.status).toBe(401);
  });

  it('GET /api/notifications/:id — returns 403 when notification belongs to another user', async () => {
    storage.getNotification.mockResolvedValue(notifForA);
    // User B tries to read User A's notification
    const res = await request(app).get('/api/notifications/42').set(auth(tokenB));
    expect(res.status).toBe(403);
  });

  it('GET /api/notifications/:id — allows recipient to read own notification', async () => {
    storage.getNotification.mockResolvedValue(notifForA);
    const res = await request(app).get('/api/notifications/42').set(auth(tokenA));
    expect(res.status).toBe(200);
  });

  it('PUT /api/notifications/:id — returns 403 when notification belongs to another user', async () => {
    storage.getNotification.mockResolvedValue(notifForA);
    const res = await request(app)
      .put('/api/notifications/42')
      .set(auth(tokenB))
      .send({ isRead: true });
    expect(res.status).toBe(403);
  });

  it('DELETE /api/notifications/:id — returns 403 when notification belongs to another user', async () => {
    storage.getNotification.mockResolvedValue(notifForA);
    const res = await request(app).delete('/api/notifications/42').set(auth(tokenB));
    expect(res.status).toBe(403);
  });

  it('PATCH /api/notifications/:id/read — returns 403 when notification belongs to another user', async () => {
    storage.getNotification.mockResolvedValue(notifForA);
    const res = await request(app).patch('/api/notifications/42/read').set(auth(tokenB));
    expect(res.status).toBe(403);
  });

  it('PATCH /api/notifications/read-all — uses authenticated user ID, not body recipientId', async () => {
    storage.markAllNotificationsAsRead.mockResolvedValue(undefined);
    storage.getUnreadNotificationCount.mockResolvedValue(0);
    // Body sends recipientId=2 (User B) but token is User A — must use token's ID
    const res = await request(app)
      .patch('/api/notifications/read-all')
      .set(auth(tokenA))
      .send({ recipientId: USER_B_ID });
    expect(res.status).toBe(200);
    expect(storage.markAllNotificationsAsRead).toHaveBeenCalledWith(USER_A_ID);
  });

  it('GET /api/notifications/:id — still requires JWT when ENFORCE_AUTH_WRITES is false', async () => {
    const prev = config.enforceAuthForWrites;
    config.enforceAuthForWrites = false;
    try {
      const res = await request(app).get('/api/notifications/42');
      expect(res.status).toBe(401);
    } finally {
      config.enforceAuthForWrites = prev;
    }
  });
});

// =============================================================================
// 4-4  AI / aggregate route scope
// =============================================================================
describe('4-4  AI and aggregate routes scope', () => {
  // ─── Dashboard ──────────────────────────────────────────────────────────────
  describe('Dashboard', () => {
    it('GET /api/dashboard/overview — requires authentication', async () => {
      const res = await request(app).get('/api/dashboard/overview');
      expect(res.status).toBe(401);
    });

    it('GET /api/dashboard/team/:teamId — requires authentication', async () => {
      const res = await request(app).get(`/api/dashboard/team/${TEAM_A_ID}`);
      expect(res.status).toBe(401);
    });

    it('GET /api/dashboard/team/:teamId — returns 403 when user is not in that team', async () => {
      storage.getTeamProgressStats.mockResolvedValue({});
      // User B (team 20) requests team A (10) dashboard
      const res = await request(app).get(`/api/dashboard/team/${TEAM_A_ID}`).set(auth(tokenB));
      expect(res.status).toBe(403);
    });

    it('GET /api/dashboard/team/:teamId — allows member of that team', async () => {
      storage.getTeamProgressStats.mockResolvedValue({ tasks: 5 });
      const res = await request(app).get(`/api/dashboard/team/${TEAM_A_ID}`).set(auth(tokenA));
      expect(res.status).toBe(200);
    });

    it('GET /api/dashboard/member/:memberId — requires authentication', async () => {
      const res = await request(app).get('/api/dashboard/member/1');
      expect(res.status).toBe(401);
    });

    it('GET /api/dashboard/member/:memberId — returns 403 when requester is outside member team', async () => {
      storage.getMember.mockResolvedValue({ id: 77, teamId: TEAM_A_ID });
      const res = await request(app).get('/api/dashboard/member/77').set(auth(tokenB));
      expect(res.status).toBe(403);
    });
  });

  // ─── AI search ───────────────────────────────────────────────────────────────
  describe('AI search', () => {
    it('POST /api/ai/search — requires authentication', async () => {
      const res = await request(app).post('/api/ai/search').send({ query: 'hello' });
      expect(res.status).toBe(401);
    });

    it('POST /api/ai/search — returns 403 when user is not in the requested teamId', async () => {
      const res = await request(app)
        .post('/api/ai/search')
        .set(auth(tokenB))
        .send({ query: 'hello', teamId: TEAM_A_ID });
      expect(res.status).toBe(403);
    });

    it('POST /api/ai/search — scopes to own team when teamId is not specified', async () => {
      storage.searchWikiPages.mockResolvedValue({ pages: [] });
      storage.getTasks.mockResolvedValue([]);
      const res = await request(app)
        .post('/api/ai/search')
        .set(auth(tokenA))
        .send({ query: 'hello' });
      expect(res.status).toBe(200);
      // Should NOT have queried with no teamId / all teams
      const callArg = storage.searchWikiPages.mock.calls[0]?.[0];
      expect(callArg?.teamId).toBeDefined();
    });
  });

  // ─── Knowledge graph ─────────────────────────────────────────────────────────
  describe('Knowledge graph', () => {
    it('GET /api/knowledge-graph — requires authentication', async () => {
      const res = await request(app).get('/api/knowledge-graph');
      expect(res.status).toBe(401);
    });

    it('GET /api/knowledge-graph — returns 403 when user is not in the requested team', async () => {
      // User B (team 20) queries team A (10)
      const res = await request(app)
        .get(`/api/knowledge-graph?teamId=${TEAM_A_ID}`)
        .set(auth(tokenB));
      expect(res.status).toBe(403);
    });

    it('GET /api/knowledge-graph — allows user to query their own team', async () => {
      storage.searchWikiPages.mockResolvedValue({ pages: [] });
      const res = await request(app)
        .get(`/api/knowledge-graph?teamId=${TEAM_A_ID}`)
        .set(auth(tokenA));
      expect(res.status).toBe(200);
    });
  });

  // ─── AI related pages ─────────────────────────────────────────────────────────
  describe('AI related pages', () => {
    it('POST /api/ai/related-pages — requires authentication', async () => {
      const res = await request(app)
        .post('/api/ai/related-pages')
        .send({ content: 'test', title: 'Test' });
      expect(res.status).toBe(401);
    });

    it("POST /api/ai/related-pages — scopes to authenticated user's teams", async () => {
      storage.searchWikiPages.mockResolvedValue({ pages: [] });
      const res = await request(app)
        .post('/api/ai/related-pages')
        .set(auth(tokenA))
        .send({ content: 'some content', title: 'My Page' });
      expect(res.status).toBe(200);
      // Must have scoped the search to a teamId
      const callArg = storage.searchWikiPages.mock.calls[0]?.[0];
      expect(callArg?.teamId).toBeDefined();
    });
  });
});

// =============================================================================
// 4-5  File download public access
// =============================================================================
describe('4-5  File download access control', () => {
  const filename = 'secret-image.png';

  it('GET /api/uploads/images/:filename — returns 401 without authentication', async () => {
    (getFileTeamId as any).mockResolvedValue(String(TEAM_A_ID));
    const res = await request(app).get(`/api/uploads/images/${filename}`);
    expect(res.status).toBe(401);
  });

  it("GET /api/uploads/images/:filename — returns 403 when user is not in file's team", async () => {
    (getFileTeamId as any).mockResolvedValue(String(TEAM_A_ID));
    // User B is in team 20; file is in team 10
    const res = await request(app).get(`/api/uploads/images/${filename}`).set(auth(tokenB));
    expect(res.status).toBe(403);
  });

  it("GET /api/uploads/images/:filename — allows member of the file's team", async () => {
    (getFileTeamId as any).mockResolvedValue(String(TEAM_A_ID));
    (getFileInfo as any).mockResolvedValue({
      path: __filename, // use this test file as a stand-in payload
      mimetype: 'image/png',
      size: 100,
    });
    const res = await request(app).get(`/api/uploads/images/${filename}`).set(auth(tokenA));
    // File exists (we used __filename which definitely exists), so expect 200
    expect(res.status).toBe(200);
  });

  it('GET /api/uploads/files/:filename — returns 401 without authentication', async () => {
    (getFileTeamId as any).mockResolvedValue(String(TEAM_A_ID));
    const res = await request(app).get(`/api/uploads/files/report.pdf`);
    expect(res.status).toBe(401);
  });

  it("GET /api/uploads/files/:filename — returns 403 when user is not in file's team", async () => {
    (getFileTeamId as any).mockResolvedValue(String(TEAM_A_ID));
    const res = await request(app).get('/api/uploads/files/report.pdf').set(auth(tokenB));
    expect(res.status).toBe(403);
  });

  it('GET /api/uploads/files/:filename — allows files with no team ownership (public files)', async () => {
    // getFileTeamId returning null = sidecar present but no teamId → explicitly public
    (getFileTeamId as any).mockResolvedValue(null);
    (getFileInfo as any).mockResolvedValue({
      path: __filename,
      mimetype: 'application/pdf',
      size: 500,
    });
    const res = await request(app).get('/api/uploads/files/public.pdf').set(auth(tokenA));
    // No team restriction → file access permitted
    expect([200, 404]).toContain(res.status);
  });

  // ─── Fail-secure: missing metadata ─────────────────────────────────────────
  // getFileTeamId returning undefined means the sidecar (.json) is missing or
  // unreadable.  The routes must deny access rather than silently allowing it.

  it('GET /api/uploads/images/:filename — returns 403 when file metadata is missing (fail-secure)', async () => {
    (getFileTeamId as any).mockResolvedValue(undefined);
    const res = await request(app).get('/api/uploads/images/orphaned-image.png').set(auth(tokenA));
    expect(res.status).toBe(403);
  });

  it('GET /api/uploads/files/:filename — returns 403 when file metadata is missing (fail-secure)', async () => {
    (getFileTeamId as any).mockResolvedValue(undefined);
    const res = await request(app).get('/api/uploads/files/orphaned-report.pdf').set(auth(tokenA));
    expect(res.status).toBe(403);
  });

  it('GET /api/uploads/images/:filename — returns 401 for unauthenticated requests regardless of metadata state', async () => {
    // authMiddleware runs before the metadata check, so anonymous requests
    // always get 401 first. The fail-secure 403 applies to authenticated users.
    (getFileTeamId as any).mockResolvedValue(undefined);
    const res = await request(app).get('/api/uploads/images/orphaned-image.png');
    expect(res.status).toBe(401);
  });

  it('GET /api/uploads/files/:filename — still requires JWT when ENFORCE_AUTH_WRITES is false', async () => {
    const prev = config.enforceAuthForWrites;
    config.enforceAuthForWrites = false;
    try {
      (getFileTeamId as any).mockResolvedValue(null);
      const res = await request(app).get('/api/uploads/files/public.pdf');
      expect(res.status).toBe(401);
    } finally {
      config.enforceAuthForWrites = prev;
    }
  });
});
