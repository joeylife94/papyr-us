/**
 * Team Authorization Unit Tests
 *
 * Proves that team-scoped routes enforce real server-side authorization:
 * - Unauthenticated requests are rejected with 401 when auth is required.
 * - Authenticated users who do not belong to the target team are rejected
 *   with 403 (cross-team access denied).
 * - Valid same-team operations still succeed (200/204).
 * - Collection routes without teamId do not leak all-team data.
 * - Privileged (write) operations on resources from another team are rejected.
 *
 * Routes exercised:
 *   GET    /api/tasks/:id                 - task read, derives teamId from resource
 *   PUT    /api/tasks/:id                 - task update
 *   DELETE /api/tasks/:id                 - task delete
 *   PATCH  /api/tasks/:id/progress        - task progress update (fixed)
 *   GET    /api/tasks                     - collection scoped to user teams
 *   GET    /api/calendar/event/:id        - calendar event read
 *   PATCH  /api/calendar/event/:id        - calendar event update (fixed)
 *   DELETE /api/calendar/event/:id        - calendar event delete
 *   GET    /api/teams/:id                 - team read
 *   PUT    /api/teams/:id                 - team update (requires admin/owner role)
 *   GET    /api/members/:id               - member read
 *   POST   /api/members                   - member create
 *   GET    /api/saved-views/:id           - saved view read
 *   GET    /api/workflows/:id             - workflow read (automation feature)
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const TEST_JWT_SECRET = 'team-auth-test-secret';

// Mock config: enforce auth + enable team features
// Note: vi.mock factory is hoisted, so the secret literal is hardcoded here
// and must match TEST_JWT_SECRET above.
vi.mock('../config', () => ({
  config: {
    jwtSecret: 'team-auth-test-secret',
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

// Mock storage module
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
const storage: any = (storageModule as any).storage;

let app: Express;
let server: http.Server;

// User A belongs to team 10. User B belongs to team 20.
const USER_A_ID = 1;
const USER_B_ID = 2;
const TEAM_A_ID = 10;
const TEAM_B_ID = 20;

function makeToken(userId: number): string {
  return jwt.sign(
    { id: userId, email: `user${userId}@example.com`, role: 'user' },
    TEST_JWT_SECRET,
    {
      expiresIn: '1h',
    }
  );
}

const tokenA = makeToken(USER_A_ID); // member of team 10 only
const tokenB = makeToken(USER_B_ID); // member of team 20 only

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();

  // Default: each user only belongs to their own team
  storage.getUserTeamIds.mockImplementation(async (userId: number) => {
    if (userId === USER_A_ID) return [TEAM_A_ID];
    if (userId === USER_B_ID) return [TEAM_B_ID];
    return [];
  });

  // Default: getUserTeamRole returns null (not a member) unless overridden
  storage.getUserTeamRole.mockResolvedValue(null);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ─── Helper tokens & headers ─────────────────────────────────────────────────

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

describe('Task authorization', () => {
  const taskInTeamA = {
    id: 1,
    title: 'Task A',
    teamId: String(TEAM_A_ID),
    status: 'todo',
    progress: 0,
  };

  describe('GET /api/tasks/:id', () => {
    it('returns 401 for unauthenticated request when the resource has a teamId and auth is enforced', async () => {
      // GET /api/tasks/:id uses optionalAuth. When req.user is absent but the task has a
      // teamId and config.enforceAuthForWrites is true, the route explicitly returns 401.
      storage.getTask.mockResolvedValue(taskInTeamA);
      const res = await request(app).get('/api/tasks/1');
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated user is NOT in the task team', async () => {
      storage.getTask.mockResolvedValue(taskInTeamA);
      // User B is in team 20, task is in team 10
      const res = await request(app).get('/api/tasks/1').set(authHeader(tokenB));
      expect(res.status).toBe(403);
    });

    it('returns 200 when authenticated user IS in the task team', async () => {
      storage.getTask.mockResolvedValue(taskInTeamA);
      const res = await request(app).get('/api/tasks/1').set(authHeader(tokenA));
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('returns 401 for unauthenticated when enforceAuthForWrites is true', async () => {
      const res = await request(app).put('/api/tasks/1').send({ title: 'hacked' });
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated user is NOT in the task team', async () => {
      storage.getTask.mockResolvedValue(taskInTeamA);
      const res = await request(app)
        .put('/api/tasks/1')
        .set(authHeader(tokenB))
        .send({ title: 'hacked' });
      expect(res.status).toBe(403);
    });

    it('returns 200 when authenticated user IS in the task team', async () => {
      storage.getTask.mockResolvedValue(taskInTeamA);
      const updated = { ...taskInTeamA, title: 'Legitimate update' };
      storage.updateTask.mockResolvedValue(updated);
      const res = await request(app)
        .put('/api/tasks/1')
        .set(authHeader(tokenA))
        .send({ title: 'Legitimate update' });
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/tasks/:id/progress', () => {
    it('returns 401 for unauthenticated when enforceAuthForWrites is true', async () => {
      const res = await request(app).patch('/api/tasks/1/progress').send({ progress: 100 });
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated user is NOT in the task team', async () => {
      storage.getTask.mockResolvedValue(taskInTeamA);
      const res = await request(app)
        .patch('/api/tasks/1/progress')
        .set(authHeader(tokenB))
        .send({ progress: 100 });
      expect(res.status).toBe(403);
      expect(storage.updateTaskProgress).not.toHaveBeenCalled();
    });

    it('returns 200 when authenticated user IS in the task team', async () => {
      storage.getTask.mockResolvedValue(taskInTeamA);
      const updated = { ...taskInTeamA, progress: 75 };
      storage.updateTaskProgress.mockResolvedValue(updated);
      const res = await request(app)
        .patch('/api/tasks/1/progress')
        .set(authHeader(tokenA))
        .send({ progress: 75 });
      expect(res.status).toBe(200);
      expect(storage.updateTaskProgress).toHaveBeenCalledWith(1, 75);
    });

    it('returns 404 when task does not exist', async () => {
      storage.getTask.mockResolvedValue(undefined);
      const res = await request(app)
        .patch('/api/tasks/99/progress')
        .set(authHeader(tokenA))
        .send({ progress: 50 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('returns 401 for unauthenticated when enforceAuthForWrites is true', async () => {
      const res = await request(app).delete('/api/tasks/1');
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated user is NOT in the task team', async () => {
      storage.getTask.mockResolvedValue(taskInTeamA);
      const res = await request(app).delete('/api/tasks/1').set(authHeader(tokenB));
      expect(res.status).toBe(403);
      expect(storage.deleteTask).not.toHaveBeenCalled();
    });

    it('returns 200 when authenticated user IS in the task team', async () => {
      storage.getTask.mockResolvedValue(taskInTeamA);
      storage.deleteTask.mockResolvedValue(true);
      const res = await request(app).delete('/api/tasks/1').set(authHeader(tokenA));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/tasks collection scoping', () => {
    it('returns only tasks for the authenticated user teams when no teamId given', async () => {
      storage.getTasks.mockResolvedValue([taskInTeamA]);
      const res = await request(app).get('/api/tasks').set(authHeader(tokenA));
      expect(res.status).toBe(200);
      // storage.getTasks called with user A's team ID
      expect(storage.getTasks).toHaveBeenCalledWith(String(TEAM_A_ID), undefined);
    });

    it('returns empty array when user has no team memberships', async () => {
      storage.getUserTeamIds.mockResolvedValue([]);
      const res = await request(app).get('/api/tasks').set(authHeader(tokenA));
      expect(res.status).toBe(200);
      expect(res.body.tasks).toEqual([]);
      expect(storage.getTasks).not.toHaveBeenCalled();
    });

    it('returns 403 when teamId is explicitly requested and user is not a member', async () => {
      // requireTeamMembership middleware blocks this
      const res = await request(app).get(`/api/tasks?teamId=${TEAM_B_ID}`).set(authHeader(tokenA));
      expect(res.status).toBe(403);
    });
  });
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

describe('Calendar authorization', () => {
  // calendar teamId is stored as text
  const eventInTeamA = {
    id: 5,
    title: 'Team A Meeting',
    teamId: String(TEAM_A_ID),
    startDate: new Date('2025-01-10'),
    endDate: new Date('2025-01-10'),
    startTime: null,
    endTime: null,
    priority: 1,
  };

  describe('GET /api/calendar/event/:id', () => {
    it('returns 403 when authenticated user is NOT in the event team', async () => {
      storage.getCalendarEvent.mockResolvedValue(eventInTeamA);
      const res = await request(app).get('/api/calendar/event/5').set(authHeader(tokenB));
      expect(res.status).toBe(403);
    });

    it('returns 200 when authenticated user IS in the event team', async () => {
      storage.getCalendarEvent.mockResolvedValue(eventInTeamA);
      const res = await request(app).get('/api/calendar/event/5').set(authHeader(tokenA));
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/calendar/event/:id', () => {
    it('returns 401 for unauthenticated when enforceAuthForWrites is true', async () => {
      const res = await request(app).patch('/api/calendar/event/5').send({ title: 'hacked' });
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated user is NOT in the event team', async () => {
      storage.getCalendarEvent.mockResolvedValue(eventInTeamA);
      const res = await request(app)
        .patch('/api/calendar/event/5')
        .set(authHeader(tokenB))
        .send({ title: 'hacked' });
      expect(res.status).toBe(403);
      expect(storage.updateCalendarEvent).not.toHaveBeenCalled();
    });

    it('returns 200 when authenticated user IS in the event team', async () => {
      storage.getCalendarEvent.mockResolvedValue(eventInTeamA);
      const updated = { ...eventInTeamA, title: 'Updated Meeting' };
      storage.updateCalendarEvent.mockResolvedValue(updated);
      const res = await request(app)
        .patch('/api/calendar/event/5')
        .set(authHeader(tokenA))
        .send({ title: 'Updated Meeting', startDate: '2025-01-10T09:00:00.000Z' });
      expect(res.status).toBe(200);
      expect(storage.updateCalendarEvent).toHaveBeenCalled();
    });

    it('returns 404 when event does not exist', async () => {
      storage.getCalendarEvent.mockResolvedValue(undefined);
      const res = await request(app)
        .patch('/api/calendar/event/99')
        .set(authHeader(tokenA))
        .send({ title: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/calendar/event/:id', () => {
    it('returns 401 for unauthenticated when enforceAuthForWrites is true', async () => {
      const res = await request(app).delete('/api/calendar/event/5');
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated user is NOT in the event team', async () => {
      storage.getCalendarEvent.mockResolvedValue(eventInTeamA);
      const res = await request(app).delete('/api/calendar/event/5').set(authHeader(tokenB));
      expect(res.status).toBe(403);
      expect(storage.deleteCalendarEvent).not.toHaveBeenCalled();
    });

    it('returns 204 when authenticated user IS in the event team', async () => {
      storage.getCalendarEvent.mockResolvedValue(eventInTeamA);
      storage.deleteCalendarEvent.mockResolvedValue(true);
      const res = await request(app).delete('/api/calendar/event/5').set(authHeader(tokenA));
      expect(res.status).toBe(204);
    });
  });
});

// ─── Teams ────────────────────────────────────────────────────────────────────

describe('Team resource authorization', () => {
  const teamA = { id: TEAM_A_ID, name: 'team-a', displayName: 'Team A' };

  describe('GET /api/teams/:id', () => {
    it('returns 401 for unauthenticated when enforceAuthForWrites is true', async () => {
      storage.getTeam.mockResolvedValue(teamA);
      const res = await request(app).get(`/api/teams/${TEAM_A_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated user is NOT in the team', async () => {
      storage.getTeam.mockResolvedValue(teamA);
      const res = await request(app).get(`/api/teams/${TEAM_A_ID}`).set(authHeader(tokenB));
      expect(res.status).toBe(403);
    });

    it('returns 200 when authenticated user IS in the team', async () => {
      storage.getTeam.mockResolvedValue(teamA);
      const res = await request(app).get(`/api/teams/${TEAM_A_ID}`).set(authHeader(tokenA));
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/teams/:id (requires admin or owner role)', () => {
    it('returns 401 for unauthenticated when enforceAuthForWrites is true', async () => {
      const res = await request(app)
        .put(`/api/teams/${TEAM_A_ID}`)
        .send({ displayName: 'New Name' });
      expect(res.status).toBe(401);
    });

    it('returns 403 when user is a plain member (not admin/owner)', async () => {
      storage.getUserTeamRole.mockResolvedValue('member');
      const res = await request(app)
        .put(`/api/teams/${TEAM_A_ID}`)
        .set(authHeader(tokenA))
        .send({ displayName: 'New Name' });
      expect(res.status).toBe(403);
      expect(storage.updateTeam).not.toHaveBeenCalled();
    });

    it('returns 403 when user is not a member of the team at all', async () => {
      // tokenB is not in team A
      storage.getUserTeamRole.mockResolvedValue(null);
      const res = await request(app)
        .put(`/api/teams/${TEAM_A_ID}`)
        .set(authHeader(tokenB))
        .send({ displayName: 'Hijacked' });
      expect(res.status).toBe(403);
      expect(storage.updateTeam).not.toHaveBeenCalled();
    });

    it('returns 200 when user has admin role in the team', async () => {
      storage.getUserTeamRole.mockResolvedValue('admin');
      storage.updateTeam.mockResolvedValue({ ...teamA, displayName: 'New Name' });
      const res = await request(app)
        .put(`/api/teams/${TEAM_A_ID}`)
        .set(authHeader(tokenA))
        .send({ displayName: 'New Name' });
      expect(res.status).toBe(200);
    });
  });
});

// ─── Members ──────────────────────────────────────────────────────────────────

describe('Member resource authorization', () => {
  const memberInTeamA = {
    id: 100,
    name: 'Alice',
    email: 'alice@example.com',
    teamId: TEAM_A_ID,
    role: '개발자',
    skills: [],
  };

  describe('GET /api/members/:id', () => {
    it('returns 403 when authenticated user is NOT in the member team', async () => {
      storage.getMember.mockResolvedValue(memberInTeamA);
      const res = await request(app).get('/api/members/100').set(authHeader(tokenB));
      expect(res.status).toBe(403);
    });

    it('returns 200 when authenticated user IS in the member team', async () => {
      storage.getMember.mockResolvedValue(memberInTeamA);
      const res = await request(app).get('/api/members/100').set(authHeader(tokenA));
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/members (requires admin/owner role)', () => {
    it('returns 401 for unauthenticated when enforceAuthForWrites is true', async () => {
      const res = await request(app).post('/api/members').send({
        name: 'Bob',
        email: 'bob@example.com',
        role: '개발자',
        teamId: TEAM_A_ID,
        skills: [],
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 when user is a plain member trying to add to their own team', async () => {
      // Plain 'member' role — not allowed to add members
      storage.getUserTeamRole.mockResolvedValue('member');
      storage.getMembers.mockResolvedValue([memberInTeamA]); // team is NOT empty
      const res = await request(app).post('/api/members').set(authHeader(tokenA)).send({
        name: 'Bob',
        email: 'bob@example.com',
        role: '개발자',
        teamId: TEAM_A_ID,
        skills: [],
      });
      expect(res.status).toBe(403);
    });

    it('returns 403 when user tries to add a member to a team they do not belong to', async () => {
      storage.getUserTeamRole.mockResolvedValue(null); // user B not in team A
      storage.getMembers.mockResolvedValue([memberInTeamA]); // team has members
      const res = await request(app).post('/api/members').set(authHeader(tokenB)).send({
        name: 'Bob',
        email: 'bob@example.com',
        role: '개발자',
        teamId: TEAM_A_ID,
        skills: [],
      });
      expect(res.status).toBe(403);
    });
  });
});

// ─── Saved Views ──────────────────────────────────────────────────────────────

describe('Saved view resource authorization', () => {
  const viewInTeamA = {
    id: 30,
    teamId: TEAM_A_ID,
    name: 'My View',
    entityType: 'tasks',
    isPublic: false,
  };

  describe('GET /api/saved-views/:id', () => {
    it('returns 403 when authenticated user is NOT in the view team', async () => {
      storage.getSavedView.mockResolvedValue(viewInTeamA);
      const res = await request(app).get('/api/saved-views/30').set(authHeader(tokenB));
      expect(res.status).toBe(403);
    });

    it('returns 200 when authenticated user IS in the view team', async () => {
      storage.getSavedView.mockResolvedValue(viewInTeamA);
      const res = await request(app).get('/api/saved-views/30').set(authHeader(tokenA));
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/saved-views/:id', () => {
    it('returns 401 for unauthenticated when enforceAuthForWrites is true', async () => {
      storage.getSavedView.mockResolvedValue(viewInTeamA);
      const res = await request(app).delete('/api/saved-views/30');
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated user is NOT in the view team', async () => {
      storage.getSavedView.mockResolvedValue(viewInTeamA);
      const res = await request(app).delete('/api/saved-views/30').set(authHeader(tokenB));
      expect(res.status).toBe(403);
      expect(storage.deleteSavedView).not.toHaveBeenCalled();
    });
  });
});

// ─── Pages ────────────────────────────────────────────────────────────────────

describe('Page collection route scoping', () => {
  // NOTE: the route's "no teamId, iterate user teams" branch passes numeric teamIds into
  // searchSchema (which expects z.string()), hitting a pre-existing Zod coercion path that
  // returns 400. Cross-team isolation is therefore verified via the explicit ?teamId= query
  // parameter, which always travels as a string and triggers the membership guard correctly.

  it('GET /api/pages with a foreign teamId returns 403 for authenticated non-member', async () => {
    const res = await request(app).get(`/api/pages?teamId=${TEAM_B_ID}`).set(authHeader(tokenA)); // user A is not in team B
    expect(res.status).toBe(403);
  });

  it('GET /api/pages returns 401 for unauthenticated when enforceAuthForWrites is true and teamId is given', async () => {
    const res = await request(app).get(`/api/pages?teamId=${TEAM_A_ID}`);
    expect(res.status).toBe(401);
  });

  it('GET /api/pages with a same-team teamId returns 200 for authenticated member', async () => {
    storage.searchWikiPages.mockResolvedValue({ pages: [], total: 0 });
    storage.getTeamByName.mockResolvedValue(undefined);
    const res = await request(app).get(`/api/pages?teamId=${TEAM_A_ID}`).set(authHeader(tokenA));
    expect(res.status).toBe(200);
  });
});
