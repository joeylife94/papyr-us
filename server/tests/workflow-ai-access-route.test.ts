/**
 * Workflows that use AI need the caller's AI access (#124 X1c P5a).
 *
 * Rule under test: saving, changing, activating or test-running a workflow whose actions include
 * `run_ai_summary` is allowed only for a caller whose organization has AI on and who has been
 * granted AI. A refusal is the AI gate's own answer (403 `ai_not_granted`, 403 `ai_disabled`) and
 * nothing is written or executed. Workflows without the AI action, removing the AI action,
 * turning a workflow off and deleting it never need the grant. Execution itself follows the
 * organization switch only (server/tests/workflow-ai-gate.test.ts).
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
  jwtSecret: 'workflow-ai-access-secret',
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

// Execution is mocked; the helper that decides whether actions use AI is the real one.
vi.mock('../services/workflow', async () => {
  const actual = (await vi.importActual('../services/workflow')) as any;
  return {
    triggerWorkflows: vi.fn().mockResolvedValue(undefined),
    initWorkflowService: vi.fn(),
    executeWorkflow: vi.fn().mockResolvedValue({ id: 1, status: 'success' }),
    workflowUsesAi: actual.workflowUsesAi,
  };
});

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
import { executeWorkflow } from '../services/workflow';
const storage: any = (storageModule as any).storage;

const OWN_TEAM = 3;
const ORG = 4;
const CALLER = { id: 7, email: 'member@example.com' };
const token = jwt.sign({ id: CALLER.id, email: CALLER.email, role: 'user' }, mockConfig.jwtSecret);
const signedIn = () => ({ Cookie: [`accessToken=${token}`] });

const AI_ACTION = { type: 'run_ai_summary', config: {} };
const TAG_ACTION = { type: 'add_tag', config: { tags: ['x'] } };

const workflowOf = (actions: unknown[]) => ({
  id: 5,
  name: 'W',
  description: '',
  teamId: OWN_TEAM,
  isActive: false,
  trigger: { type: 'page_created', config: {} },
  actions,
  conditions: [],
  createdBy: 'someone',
});

const bodyWith = (actions: unknown[]) => ({
  name: 'New',
  description: '',
  trigger: { type: 'page_created', config: {} },
  actions,
  conditions: [],
  isActive: false,
  createdBy: 'me',
  teamId: OWN_TEAM,
});

type Access = 'not-granted' | 'off' | 'granted';
const ACCESS: Access[] = ['not-granted', 'off', 'granted'];

function setAccess(state: Access) {
  storage.getOrganizationMembership.mockResolvedValue({
    organizationId: ORG,
    role: 'member',
    aiAllowed: state !== 'not-granted',
  });
  storage.isOrganizationAiEnabled.mockResolvedValue(state !== 'off');
}

function expectRefusal(res: request.Response, state: Access) {
  expect(res.status).toBe(403);
  if (state === 'not-granted') {
    expect(res.body).toEqual({
      code: 'ai_not_granted',
      message: 'AI has not been granted to your account',
    });
  } else {
    expect(res.body).toEqual({
      code: 'ai_disabled',
      message: 'AI features are turned off for your organization',
    });
  }
}

const nothingWritten = () => {
  expect(storage.createWorkflow).not.toHaveBeenCalled();
  expect(storage.updateWorkflow).not.toHaveBeenCalled();
  expect(storage.toggleWorkflow).not.toHaveBeenCalled();
  expect(storage.createWorkflowRun).not.toHaveBeenCalled();
  expect(executeWorkflow).not.toHaveBeenCalled();
};

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.enforceAuthForWrites = true;
  setAccess('granted');
  storage.getUserTeamIds.mockImplementation(async (userId: number) =>
    userId === CALLER.id ? [OWN_TEAM] : []
  );
  storage.getTeamByName.mockResolvedValue({ id: OWN_TEAM });
  storage.createWorkflow.mockImplementation(async (data: any) => ({ id: 9, ...data }));
  storage.updateWorkflow.mockImplementation(async (id: number, data: any) => ({
    ...workflowOf([TAG_ACTION]),
    id,
    ...data,
  }));
  storage.toggleWorkflow.mockImplementation(async (_id: number, isActive: boolean) => ({
    ...workflowOf([AI_ACTION]),
    isActive,
  }));
  storage.createWorkflowRun.mockResolvedValue({ id: 1 });
});

describe.each(ACCESS)('with the caller %s', (state) => {
  beforeEach(() => setAccess(state));
  const refused = state !== 'granted';

  describe('POST /api/workflows', () => {
    it(`${refused ? 'refuses' : 'creates'} a workflow with the AI action`, async () => {
      const res = await request(app)
        .post('/api/workflows')
        .set(signedIn())
        .send(bodyWith([TAG_ACTION, AI_ACTION]));
      if (refused) {
        expectRefusal(res, state);
        expect(storage.createWorkflow).not.toHaveBeenCalled();
      } else {
        expect(res.status).toBe(201);
        expect(storage.createWorkflow).toHaveBeenCalledTimes(1);
      }
    });

    it('creates a workflow without the AI action', async () => {
      const res = await request(app)
        .post('/api/workflows')
        .set(signedIn())
        .send(bodyWith([TAG_ACTION]));
      expect(res.status).toBe(201);
      expect(storage.createWorkflow).toHaveBeenCalledTimes(1);
    });
  });

  describe('PUT /api/workflows/:id', () => {
    it(`${refused ? 'refuses' : 'accepts'} a body that puts the AI action in`, async () => {
      storage.getWorkflow.mockResolvedValue(workflowOf([TAG_ACTION]));
      const res = await request(app)
        .put('/api/workflows/5')
        .set(signedIn())
        .send({ actions: [AI_ACTION] });
      if (refused) {
        expectRefusal(res, state);
        expect(storage.updateWorkflow).not.toHaveBeenCalled();
      } else {
        expect(res.status).toBe(200);
      }
    });

    it(`${refused ? 'refuses' : 'accepts'} a body without actions on a stored AI workflow`, async () => {
      storage.getWorkflow.mockResolvedValue(workflowOf([AI_ACTION]));
      const res = await request(app)
        .put('/api/workflows/5')
        .set(signedIn())
        .send({ name: 'Renamed' });
      if (refused) {
        expectRefusal(res, state);
        expect(storage.updateWorkflow).not.toHaveBeenCalled();
      } else {
        expect(res.status).toBe(200);
      }
    });

    it('accepts a body that removes the AI action', async () => {
      storage.getWorkflow.mockResolvedValue(workflowOf([AI_ACTION]));
      const res = await request(app)
        .put('/api/workflows/5')
        .set(signedIn())
        .send({ actions: [TAG_ACTION] });
      expect(res.status).toBe(200);
      expect(storage.updateWorkflow).toHaveBeenCalledTimes(1);
    });

    it('accepts a change to a workflow without the AI action', async () => {
      storage.getWorkflow.mockResolvedValue(workflowOf([TAG_ACTION]));
      const res = await request(app).put('/api/workflows/5').set(signedIn()).send({ name: 'x' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/workflows/:id/toggle', () => {
    beforeEach(() => storage.getWorkflow.mockResolvedValue(workflowOf([AI_ACTION])));
    const toggle = (body: object) =>
      request(app).post('/api/workflows/5/toggle').set(signedIn()).send(body);

    it.each([[{ isActive: true }], [{}], [{ isActive: 'false' }]])(
      `${refused ? 'refuses' : 'allows'} activating an AI workflow with %j`,
      async (body) => {
        const res = await toggle(body);
        if (refused) {
          expectRefusal(res, state);
          expect(storage.toggleWorkflow).not.toHaveBeenCalled();
        } else {
          expect(res.status).toBe(200);
          expect(storage.toggleWorkflow).toHaveBeenCalledTimes(1);
        }
      }
    );

    it('always allows turning an AI workflow off', async () => {
      const res = await toggle({ isActive: false });
      expect(res.status).toBe(200);
      expect(storage.toggleWorkflow).toHaveBeenCalledWith(5, false);
    });

    it('turns a workflow without the AI action on', async () => {
      storage.getWorkflow.mockResolvedValue(workflowOf([TAG_ACTION]));
      const res = await toggle({ isActive: true });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/workflows/:id/test', () => {
    it(`${refused ? 'refuses' : 'runs'} an AI workflow`, async () => {
      storage.getWorkflow.mockResolvedValue(workflowOf([AI_ACTION]));
      const res = await request(app).post('/api/workflows/5/test').set(signedIn()).send({});
      if (refused) {
        expectRefusal(res, state);
        expect(executeWorkflow).not.toHaveBeenCalled();
        expect(storage.createWorkflowRun).not.toHaveBeenCalled();
      } else {
        expect(res.status).toBe(200);
        expect(executeWorkflow).toHaveBeenCalledTimes(1);
      }
    });

    it('runs a workflow without the AI action', async () => {
      storage.getWorkflow.mockResolvedValue(workflowOf([TAG_ACTION]));
      const res = await request(app).post('/api/workflows/5/test').set(signedIn()).send({});
      expect(res.status).toBe(200);
      expect(executeWorkflow).toHaveBeenCalledTimes(1);
    });
  });

  it('deleting a workflow needs no AI access', async () => {
    storage.getWorkflow.mockResolvedValue(workflowOf([AI_ACTION]));
    storage.deleteWorkflow.mockResolvedValue(true);
    const res = await request(app).delete('/api/workflows/5').set(signedIn());
    expect(res.status).toBe(204);
  });
});

describe('failing closed', () => {
  it('a failing membership lookup is 500 and nothing is written or executed', async () => {
    storage.getOrganizationMembership.mockRejectedValue(new Error('db down'));
    storage.getWorkflow.mockResolvedValue(workflowOf([AI_ACTION]));
    const created = await request(app)
      .post('/api/workflows')
      .set(signedIn())
      .send(bodyWith([AI_ACTION]));
    const tested = await request(app).post('/api/workflows/5/test').set(signedIn()).send({});
    expect(created.status).toBe(500);
    expect(tested.status).toBe(500);
    nothingWritten();
  });

  it('a caller without an organization is refused with 403', async () => {
    storage.getOrganizationMembership.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/workflows')
      .set(signedIn())
      .send(bodyWith([AI_ACTION]));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Your account does not belong to an organization' });
    nothingWritten();
  });

  it('a membership without the grant field counts as not granted', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: ORG, role: 'member' });
    const res = await request(app)
      .post('/api/workflows')
      .set(signedIn())
      .send(bodyWith([AI_ACTION]));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ai_not_granted');
  });
});

describe.each([true, false])('ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mockConfig.enforceAuthForWrites = enforce;
    storage.getWorkflow.mockResolvedValue(workflowOf([AI_ACTION]));
  });

  it('signed out is 401 on create, put, toggle and test, and nothing is read for AI access', async () => {
    for (const call of [
      request(app)
        .post('/api/workflows')
        .send(bodyWith([AI_ACTION])),
      request(app)
        .put('/api/workflows/5')
        .send({ actions: [AI_ACTION] }),
      request(app).post('/api/workflows/5/toggle').send({ isActive: true }),
      request(app).post('/api/workflows/5/test').send({}),
    ]) {
      expect((await call).status).toBe(401);
    }
    expect(storage.getOrganizationMembership).not.toHaveBeenCalled();
    nothingWritten();
  });

  it('signed in and not granted is 403 ai_not_granted', async () => {
    setAccess('not-granted');
    const res = await request(app).post('/api/workflows/5/test').set(signedIn()).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ai_not_granted');
  });

  it('signed in and granted works', async () => {
    setAccess('granted');
    const res = await request(app).post('/api/workflows/5/test').set(signedIn()).send({});
    expect(res.status).toBe(200);
  });
});

describe('workflowUsesAi', () => {
  it('is true only for an array with a run_ai_summary action', async () => {
    const { workflowUsesAi } = (await vi.importActual('../services/workflow')) as any;
    expect(workflowUsesAi([TAG_ACTION, AI_ACTION])).toBe(true);
    expect(workflowUsesAi([TAG_ACTION])).toBe(false);
    expect(workflowUsesAi([])).toBe(false);
    for (const value of [
      undefined,
      null,
      'run_ai_summary',
      { type: 'run_ai_summary' },
      [null],
      [1],
    ]) {
      expect(workflowUsesAi(value)).toBe(false);
    }
  });
});
