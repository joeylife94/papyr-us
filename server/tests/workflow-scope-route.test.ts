/**
 * Route rules of /api/workflows (#124 X1b, decision D4). The SQL and service sides are proven by
 * tests/integration-layer4/workflow-scope.test.ts and server/tests/workflow-confinement.test.ts;
 * the end-to-end rule by tests/security-workflows-scope.spec.ts.
 *
 * Rules under test:
 * - a workflow belongs to a team: POST without a team is 400 and writes nothing, and PUT cannot
 *   remove the team (`teamId: null` or '' is 400);
 * - a workflow with no team (legacy row) answers 404 to everyone on every single-workflow route,
 *   and nothing is read from runs, executed, changed or deleted;
 * - a workflow of another team (or organization) answers 403 on each route;
 * - a caller without a session gets 401, also when auth is not enforced;
 * - a member of the workflow's team keeps working access.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'workflow-scope-route-secret',
  adminEmails: [] as string[],
  enforceAuthForWrites: true,
  rateLimitEnabled: false,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 1000,
  adminIpWhitelist: [] as string[],
  port: 5001,
  host: '0.0.0.0',
  isProduction: false,
  isReplit: false,
}));

vi.mock('../config', () => ({ config: mockConfig }));

vi.mock('../features', () => ({
  featureFlags: {
    PAPYR_MODE: 'team',
    FEATURE_TEAMS: true,
    FEATURE_NOTIFICATIONS: true,
    FEATURE_ADMIN: true,
    FEATURE_CALENDAR: true,
    FEATURE_AI_SEARCH: false,
    FEATURE_AUTOMATION: true,
    FEATURE_SSO: false,
    FEATURE_DATABASE_VIEWS: false,
  },
  isFeatureEnabled: (key: string) => key === 'FEATURE_AUTOMATION',
}));

vi.mock('../services/workflow', () => ({
  triggerWorkflows: vi.fn().mockResolvedValue(undefined),
  initWorkflowService: vi.fn(),
  executeWorkflow: vi.fn().mockResolvedValue({ id: 1, status: 'success' }),
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
import { executeWorkflow } from '../services/workflow';
const storage: any = (storageModule as any).storage;

const OWN_TEAM = 3;
const OTHER_TEAM = 4;
const CALLER = { id: 7, email: 'member@example.com' };
const token = jwt.sign({ id: CALLER.id, email: CALLER.email, role: 'user' }, mockConfig.jwtSecret);
const signedIn = () => ({ Cookie: [`accessToken=${token}`] });

const workflowOf = (teamId: number | null) => ({
  id: 5,
  name: 'W',
  description: '',
  teamId,
  isActive: true,
  trigger: { type: 'page_created', config: {} },
  actions: [{ type: 'add_tag', config: { tags: ['x'] } }],
  conditions: [],
  createdBy: 'someone',
});

const body = {
  name: 'New',
  description: '',
  trigger: { type: 'page_created', config: {} },
  actions: [{ type: 'add_tag', config: { tags: ['x'] } }],
  conditions: [],
  isActive: false,
  createdBy: 'me',
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
  mockConfig.enforceAuthForWrites = true;
  storage.getUserTeamIds.mockImplementation(async (userId: number) =>
    userId === CALLER.id ? [OWN_TEAM] : []
  );
  storage.getTeamByName.mockResolvedValue({ id: OWN_TEAM });
  storage.getUserAccount.mockResolvedValue({ id: CALLER.id, email: CALLER.email, isActive: true });
  storage.createWorkflow.mockImplementation(async (data: any) => ({ id: 9, ...data }));
  storage.updateWorkflow.mockImplementation(async (id: number, data: any) => ({
    ...workflowOf(OWN_TEAM),
    id,
    ...data,
  }));
  storage.deleteWorkflow.mockResolvedValue(true);
  storage.toggleWorkflow.mockResolvedValue(workflowOf(OWN_TEAM));
  storage.getWorkflowRuns.mockResolvedValue([{ id: 1, triggerData: { content: 'secret' } }]);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const noWrites = () => {
  expect(storage.createWorkflow).not.toHaveBeenCalled();
  expect(storage.updateWorkflow).not.toHaveBeenCalled();
  expect(storage.deleteWorkflow).not.toHaveBeenCalled();
  expect(storage.toggleWorkflow).not.toHaveBeenCalled();
  expect(executeWorkflow).not.toHaveBeenCalled();
  expect(storage.getWorkflowRuns).not.toHaveBeenCalled();
};

const singleRoutes: Array<[string, (a: Express) => request.Test]> = [
  ['GET /api/workflows/5', (a) => request(a).get('/api/workflows/5')],
  ['PUT /api/workflows/5', (a) => request(a).put('/api/workflows/5').send({ name: 'x' })],
  ['DELETE /api/workflows/5', (a) => request(a).delete('/api/workflows/5')],
  ['POST /api/workflows/5/toggle', (a) => request(a).post('/api/workflows/5/toggle').send({})],
  ['POST /api/workflows/5/test', (a) => request(a).post('/api/workflows/5/test').send({})],
  ['GET /api/workflows/5/runs', (a) => request(a).get('/api/workflows/5/runs')],
];

describe('POST /api/workflows needs a team', () => {
  it('answers 400 without a team and creates nothing', async () => {
    const response = await request(app).post('/api/workflows').set(signedIn()).send(body);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'teamId is required' });
    noWrites();
  });

  it('answers 400 for an explicit null or empty team', async () => {
    for (const teamId of [null, '']) {
      const response = await request(app)
        .post('/api/workflows')
        .set(signedIn())
        .send({ ...body, teamId });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'teamId is required' });
    }
    noWrites();
  });

  it('creates in the checked team, by id or by name', async () => {
    const byId = await request(app)
      .post('/api/workflows')
      .set(signedIn())
      .send({ ...body, teamId: OWN_TEAM });
    expect(byId.status).toBe(201);
    expect(storage.createWorkflow).toHaveBeenLastCalledWith(
      expect.objectContaining({ teamId: OWN_TEAM })
    );

    const byName = await request(app)
      .post('/api/workflows')
      .set(signedIn())
      .send({ ...body, teamId: 'own-team' });
    expect(byName.status).toBe(201);
    expect(storage.createWorkflow).toHaveBeenLastCalledWith(
      expect.objectContaining({ teamId: OWN_TEAM })
    );
  });

  it('refuses another team with 403 and creates nothing', async () => {
    const response = await request(app)
      .post('/api/workflows')
      .set(signedIn())
      .send({ ...body, teamId: OTHER_TEAM });
    expect(response.status).toBe(403);
    noWrites();
  });
});

describe('PUT /api/workflows/:id cannot remove the team', () => {
  it.each([null, ''])('answers 400 for teamId %j and updates nothing', async (teamId) => {
    storage.getWorkflow.mockResolvedValue(workflowOf(OWN_TEAM));
    const response = await request(app).put('/api/workflows/5').set(signedIn()).send({ teamId });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'teamId is required' });
    noWrites();
  });

  it('still refuses a move to a team the caller is not in', async () => {
    storage.getWorkflow.mockResolvedValue(workflowOf(OWN_TEAM));
    const response = await request(app)
      .put('/api/workflows/5')
      .set(signedIn())
      .send({ teamId: OTHER_TEAM });
    expect(response.status).toBe(403);
    noWrites();
  });
});

describe('a workflow with no team answers 404 to everyone', () => {
  beforeEach(() => storage.getWorkflow.mockResolvedValue(workflowOf(null)));

  it.each(singleRoutes)('%s', async (_name, call) => {
    const response = await call(app).set(signedIn());
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Workflow not found' });
    noWrites();
  });

  it.each(singleRoutes)('%s, when auth is not enforced', async (_name, call) => {
    mockConfig.enforceAuthForWrites = false;
    const response = await call(app).set(signedIn());
    expect(response.status).toBe(404);
    noWrites();
  });
});

describe('a workflow of another team answers 403', () => {
  beforeEach(() => storage.getWorkflow.mockResolvedValue(workflowOf(OTHER_TEAM)));

  it.each(singleRoutes)('%s', async (_name, call) => {
    const response = await call(app).set(signedIn());
    expect(response.status).toBe(403);
    noWrites();
  });
});

describe('a caller without a session', () => {
  beforeEach(() => storage.getWorkflow.mockResolvedValue(workflowOf(OWN_TEAM)));

  it.each(singleRoutes)('%s answers 401 when auth is enforced', async (_name, call) => {
    const response = await call(app);
    expect(response.status).toBe(401);
    noWrites();
  });

  it.each(singleRoutes)('%s answers 401 when auth is not enforced', async (_name, call) => {
    mockConfig.enforceAuthForWrites = false;
    const response = await call(app);
    expect(response.status).toBe(401);
    noWrites();
  });
});

describe('a caller without a session cannot tell workflows apart or write', () => {
  it.each([true, false])(
    'every single-workflow route answers 401 before any lookup (auth enforced: %s)',
    async (enforced) => {
      mockConfig.enforceAuthForWrites = enforced;
      for (const team of [null, OWN_TEAM]) {
        storage.getWorkflow.mockResolvedValue(workflowOf(team));
        for (const [, call] of singleRoutes) {
          expect((await call(app)).status).toBe(401);
        }
      }
      expect(storage.getWorkflow).not.toHaveBeenCalled();
      noWrites();
    }
  );

  it.each([true, false])(
    'POST and PUT answer 401 before any team resolution or write (auth enforced: %s)',
    async (enforced) => {
      mockConfig.enforceAuthForWrites = enforced;
      const created = await request(app)
        .post('/api/workflows')
        .send({ ...body, teamId: OWN_TEAM });
      expect(created.status).toBe(401);
      const named = await request(app)
        .post('/api/workflows')
        .send({ ...body, teamId: 'own-team' });
      expect(named.status).toBe(401);
      const updated = await request(app).put('/api/workflows/5').send({ teamId: OWN_TEAM });
      expect(updated.status).toBe(401);
      expect(storage.getTeamByName).not.toHaveBeenCalled();
      noWrites();
    }
  );
});

describe('a member of the workflow team', () => {
  beforeEach(() => storage.getWorkflow.mockResolvedValue(workflowOf(OWN_TEAM)));

  it.each([true, false])('keeps access to every route (auth enforced: %s)', async (enforced) => {
    mockConfig.enforceAuthForWrites = enforced;
    for (const [, call] of singleRoutes) {
      const response = await call(app).set(signedIn());
      expect([200, 204]).toContain(response.status);
    }
    expect(executeWorkflow).toHaveBeenCalledTimes(1);
  });
});

// The creator of a workflow is the signed-in account, read from the database. The automation
// page sends none; a value a client does send is ignored, and it never changes afterwards.
describe('the creator of a workflow comes from the session', () => {
  const { createdBy: _ignored, ...bodyWithoutCreator } = body;

  it('is set from the account when the body names none', async () => {
    const response = await request(app)
      .post('/api/workflows')
      .set(signedIn())
      .send({ ...bodyWithoutCreator, teamId: OWN_TEAM });
    expect(response.status).toBe(201);
    expect(storage.getUserAccount).toHaveBeenCalledWith(CALLER.id);
    expect(storage.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: CALLER.email, teamId: OWN_TEAM })
    );
  });

  it('replaces a creator sent by the client', async () => {
    const response = await request(app)
      .post('/api/workflows')
      .set(signedIn())
      .send({ ...body, createdBy: 'someone-else@example.com', teamId: OWN_TEAM });
    expect(response.status).toBe(201);
    expect(storage.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: CALLER.email })
    );
  });

  it('creates nothing for a session whose account is gone or deactivated', async () => {
    for (const account of [undefined, { id: CALLER.id, email: CALLER.email, isActive: false }]) {
      storage.getUserAccount.mockResolvedValue(account);
      const response = await request(app)
        .post('/api/workflows')
        .set(signedIn())
        .send({ ...body, teamId: OWN_TEAM });
      expect(response.status).toBe(401);
    }
    expect(storage.createWorkflow).not.toHaveBeenCalled();
  });

  it('cannot be changed by an update', async () => {
    storage.getWorkflow.mockResolvedValue(workflowOf(OWN_TEAM));
    const response = await request(app)
      .put('/api/workflows/1')
      .set(signedIn())
      .send({ name: 'Renamed', createdBy: 'someone-else@example.com' });
    expect(response.status).toBe(200);
    const [, written] = storage.updateWorkflow.mock.calls[0];
    expect(written).toEqual({ name: 'Renamed' });
  });
});
