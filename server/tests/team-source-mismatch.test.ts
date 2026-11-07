/**
 * requireTeamMembership checks the team a route acts on (issue #132). Route level, with a mocked
 * storage; tests/security-team-param-mismatch.spec.ts proves the same against a real server.
 *
 * A request may name its team in `params.teamId`, `query.teamId` and `body.teamId`. The
 * middleware used to check the first one present, so a handler reading another source acted on
 * a team the caller is not in. It also read ids with parseInt, so `10e1` passed as team 10 while
 * a handler using Number() acted on team 100, and a team name became NaN, which the calendar read
 * as "every team".
 *
 * Rules under test:
 * - every route that uses requireTeamMembership refuses sources naming different teams with 400
 *   `teamId mismatch`, before its handler runs (names are resolved before comparing);
 * - a value that is neither an id nor a team name (a repeated query parameter, an object, a
 *   fraction) is refused with 400; an unknown name stays 404 and another team 403;
 * - the routes that were exploitable act on the checked team: markdown import, calendar reads
 *   and writes, file upload (whose team is a multipart field), task, workflow and saved-view
 *   creation; requests that name one team still work, by id or by name;
 * - in development without a signed-in user no membership is needed, as before; mismatched
 *   sources are refused there too.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { parseTeamReference } from '../middleware';

const TEST_SECRET = 'team-source-test-secret';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'team-source-test-secret',
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
}));

vi.mock('../config', () => ({ config: mockConfig }));

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

vi.mock('../services/upload', async () => {
  const actual = (await vi.importActual('../services/upload')) as any;
  return {
    ...actual, // the real multer middleware, so the multipart body is parsed for real
    processUploadedFile: vi.fn(),
    listUploadedFiles: vi.fn(),
  };
});

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
import { processUploadedFile, listUploadedFiles } from '../services/upload';
const storage: any = (storageModule as any).storage;

const OWN = 10; // team "alpha": the caller is a member
const OTHER = 20; // team "beta": the caller is not
const TEAMS: Record<string, number> = { alpha: OWN, beta: OTHER };
const CALLER = { id: 1, email: 'caller@example.com' };

const auth = () => ({
  Authorization: `Bearer ${jwt.sign({ id: CALLER.id, email: CALLER.email, role: 'user' }, TEST_SECRET, { expiresIn: '1h' })}`,
});

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.enforceAuthForWrites = true;
  storage.getUserTeamIds.mockImplementation(async (userId: number) =>
    userId === CALLER.id ? [OWN] : []
  );
  storage.getTeamByName.mockImplementation(async (name: string) =>
    TEAMS[name] ? { id: TEAMS[name], name } : undefined
  );
  storage.createWikiPage.mockImplementation(async (page: any) => ({ id: 1, ...page }));
  storage.getCalendarEvents.mockResolvedValue([]);
  storage.createCalendarEvent.mockImplementation(async (event: any) => ({ id: 1, ...event }));
  storage.createTask.mockImplementation(async (task: any) => ({ id: 1, ...task }));
  storage.createWorkflow.mockImplementation(async (workflow: any) => ({ id: 1, ...workflow }));
  storage.createSavedView.mockImplementation(async (view: any) => ({ id: 1, ...view }));
  (processUploadedFile as any).mockImplementation(async (file: any, teamId?: string) => ({
    filename: file.originalname,
    teamId,
  }));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const pageBody = { title: 'Notes', slug: 'notes', content: '', folder: 'docs', author: 'a' };
const eventBody = { title: 'Sync', startDate: '2026-11-01T10:00:00.000Z' };
const taskBody = { title: 'Write tests' };
const workflowBody = {
  name: 'Notify',
  createdBy: 'caller',
  trigger: { type: 'page_created' },
  actions: [{ type: 'send_notification', config: { message: 'hi' } }],
};
const viewBody = { name: 'Board', viewType: 'kanban', entityType: 'tasks' };

type Case = {
  route: string;
  send: () => request.Test;
  /** Storage or service calls the handler makes; none may happen for a refused request. */
  untouched: () => unknown[];
};

const upload = (path: string, teamField?: string) => {
  const req = request(app).post(path).set(auth());
  if (teamField !== undefined) req.field('teamId', teamField);
  return req.attach('files', Buffer.from('hello'), {
    filename: 'note.txt',
    contentType: 'text/plain',
  });
};

// Every route that uses requireTeamMembership, with its own team in one source and another team
// in a second source.
const MISMATCHED: Case[] = [
  {
    route: 'POST /api/pages',
    send: () =>
      request(app)
        .post(`/api/pages?teamId=${OWN}`)
        .set(auth())
        .send({ ...pageBody, teamId: OTHER }),
    untouched: () => [storage.createWikiPage],
  },
  {
    route: 'POST /api/pages/import/markdown',
    send: () =>
      request(app)
        .post(`/api/pages/import/markdown?teamId=${OWN}`)
        .set(auth())
        .send({ content: '# Notes', teamId: OTHER }),
    untouched: () => [storage.createWikiPage],
  },
  {
    route: 'GET /api/calendar',
    send: () => request(app).get(`/api/calendar?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [storage.getCalendarEvents],
  },
  {
    route: 'GET /api/calendar/:teamId',
    send: () => request(app).get(`/api/calendar/${OWN}?teamId=${OTHER}`).set(auth()),
    untouched: () => [storage.getCalendarEvents],
  },
  {
    route: 'POST /api/calendar',
    send: () =>
      request(app)
        .post(`/api/calendar?teamId=${OWN}`)
        .set(auth())
        .send({ ...eventBody, teamId: String(OTHER) }),
    untouched: () => [storage.createCalendarEvent],
  },
  {
    route: 'POST /api/upload',
    send: () => upload(`/api/upload?teamId=${OWN}`, String(OTHER)),
    untouched: () => [processUploadedFile],
  },
  {
    route: 'GET /api/uploads',
    send: () => request(app).get(`/api/uploads?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [listUploadedFiles],
  },
  {
    route: 'GET /api/dashboard/overview',
    send: () =>
      request(app).get(`/api/dashboard/overview?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [storage.getDashboardOverview],
  },
  {
    route: 'GET /api/dashboard/team/:teamId',
    send: () => request(app).get(`/api/dashboard/team/${OWN}?teamId=${OTHER}`).set(auth()),
    untouched: () => [storage.getTeamProgressStats],
  },
  {
    route: 'GET /api/tasks',
    send: () => request(app).get(`/api/tasks?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [storage.getTasks],
  },
  {
    route: 'POST /api/tasks',
    send: () =>
      request(app)
        .post(`/api/tasks?teamId=${OWN}`)
        .set(auth())
        .send({ ...taskBody, teamId: String(OTHER) }),
    untouched: () => [storage.createTask],
  },
  {
    route: 'GET /api/members',
    send: () => request(app).get(`/api/members?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [storage.getMembers],
  },
  {
    route: 'GET /api/knowledge-graph',
    send: () =>
      request(app).get(`/api/knowledge-graph?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [storage.getKnowledgeGraphSource],
  },
  {
    route: 'GET /api/workflows',
    send: () =>
      request(app).get(`/api/workflows?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [storage.getWorkflows],
  },
  {
    route: 'POST /api/workflows',
    send: () =>
      request(app)
        .post(`/api/workflows?teamId=${OWN}`)
        .set(auth())
        .send({ ...workflowBody, teamId: OTHER }),
    untouched: () => [storage.createWorkflow],
  },
  {
    route: 'PUT /api/workflows/:id',
    send: () =>
      request(app).put(`/api/workflows/5?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [storage.getWorkflow, storage.updateWorkflow],
  },
  {
    route: 'GET /api/saved-views',
    send: () =>
      request(app).get(`/api/saved-views?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [storage.getSavedViews],
  },
  {
    route: 'POST /api/saved-views',
    send: () =>
      request(app)
        .post(`/api/saved-views?teamId=${OWN}`)
        .set(auth())
        .send({ ...viewBody, teamId: OTHER }),
    untouched: () => [storage.createSavedView],
  },
  {
    route: 'PUT /api/saved-views/:id',
    send: () =>
      request(app).put(`/api/saved-views/5?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [storage.getSavedView, storage.updateSavedView],
  },
  {
    route: 'POST /api/saved-views/:id/set-default',
    send: () =>
      request(app)
        .post(`/api/saved-views/5/set-default?teamId=${OWN}`)
        .set(auth())
        .send({ teamId: OTHER }),
    untouched: () => [storage.getSavedView, storage.setDefaultView],
  },
  {
    route: 'GET /api/analytics/popular',
    send: () =>
      request(app).get(`/api/analytics/popular?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [],
  },
  {
    route: 'GET /api/activity',
    send: () => request(app).get(`/api/activity?teamId=${OWN}`).set(auth()).send({ teamId: OTHER }),
    untouched: () => [],
  },
];

describe('every requireTeamMembership route refuses sources that name different teams', () => {
  it.each(MISMATCHED.map((c) => [c.route, c] as const))('%s', async (_route, c) => {
    const res = await c.send();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'teamId mismatch' });
    for (const call of c.untouched()) expect(call).not.toHaveBeenCalled();
  });

  it('compares teams after resolving names', async () => {
    const mismatch = await request(app)
      .post('/api/tasks?teamId=alpha')
      .set(auth())
      .send({ ...taskBody, teamId: String(OTHER) });
    expect(mismatch.status).toBe(400);
    expect(storage.createTask).not.toHaveBeenCalled();

    // The same team by name and by id is one team
    const same = await request(app)
      .post('/api/tasks?teamId=alpha')
      .set(auth())
      .send({ ...taskBody, teamId: String(OWN) });
    expect(same.status).toBe(201);
    expect(storage.createTask).toHaveBeenCalledWith(expect.objectContaining({ teamId: '10' }));
  });
});

describe('team references are read strictly', () => {
  it('reads ids, names and absent values', () => {
    expect(parseTeamReference(undefined)).toBeNull();
    expect(parseTeamReference('')).toBeNull();
    expect(parseTeamReference(null)).toBeNull();
    expect(parseTeamReference(0)).toBeNull();
    expect(parseTeamReference(7)).toEqual({ id: 7 });
    expect(parseTeamReference('7')).toEqual({ id: 7 });
    expect(parseTeamReference('alpha')).toEqual({ name: 'alpha' });
    // Not an id: these used to pass as team 10 through parseInt
    expect(parseTeamReference('10e1')).toEqual({ name: '10e1' });
    expect(parseTeamReference('10abc')).toEqual({ name: '10abc' });
    expect(parseTeamReference(['10', '20'])).toBe('invalid');
    expect(parseTeamReference({ id: 10 })).toBe('invalid');
    expect(parseTeamReference(10.5)).toBe('invalid');
    expect(parseTeamReference(-10)).toBe('invalid');
    expect(parseTeamReference('0')).toBe('invalid');
    expect(parseTeamReference('99999999999999999999')).toBe('invalid');
    expect(parseTeamReference(true)).toBe('invalid');
  });

  it('refuses a repeated teamId query parameter', async () => {
    const res = await request(app).get(`/api/tasks?teamId=${OWN}&teamId=${OTHER}`).set(auth());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid teamId' });
    expect(storage.getTasks).not.toHaveBeenCalled();
  });

  it('keeps 404 for an unknown team name and 403 for a team the caller is not in', async () => {
    const unknown = await request(app).get('/api/tasks?teamId=nope').set(auth());
    expect(unknown.status).toBe(404);
    const other = await request(app).get('/api/tasks?teamId=beta').set(auth());
    expect(other.status).toBe(403);
    expect(storage.getTasks).not.toHaveBeenCalled();
  });
});

describe('markdown import puts the page into the checked team', () => {
  const importPage = (query: string, teamId: unknown) =>
    request(app)
      .post(`/api/pages/import/markdown${query}`)
      .set(auth())
      .send({ content: '# Notes', teamId });

  it('imports into its own team, named by id or by name', async () => {
    const byId = await importPage(`?teamId=${OWN}`, OWN);
    expect(byId.status).toBe(201);
    const byName = await importPage('', 'alpha');
    expect(byName.status).toBe(201);
    expect(storage.createWikiPage).toHaveBeenCalledTimes(2);
    for (const [page] of storage.createWikiPage.mock.calls) expect(page.teamId).toBe(OWN);
  });

  it('refuses a value that only looks like its own team id', async () => {
    // parseInt read `10e1` as team 10 and the handler's Number() as team 100
    const res = await importPage('', `${OWN}e1`);
    expect(res.status).toBe(404);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });

  it('refuses another team in the body', async () => {
    const res = await importPage('', OTHER);
    expect(res.status).toBe(403);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });
});

describe('calendar reads use the checked team id', () => {
  it('reads a team named in the query or the path by its id', async () => {
    const query = await request(app).get('/api/calendar?teamId=alpha').set(auth());
    expect(query.status).toBe(200);
    const path = await request(app).get('/api/calendar/alpha').set(auth());
    expect(path.status).toBe(200);
    // The name used to become NaN, which getCalendarEvents reads as "every team"
    expect(storage.getCalendarEvents.mock.calls).toEqual([[OWN], [OWN]]);
  });

  it('reads its own team by id', async () => {
    const res = await request(app).get(`/api/calendar/${OWN}`).set(auth());
    expect(res.status).toBe(200);
    expect(storage.getCalendarEvents).toHaveBeenCalledWith(OWN);
  });

  it('refuses a value that only looks like its own team id', async () => {
    const res = await request(app).get(`/api/calendar/${OWN}e1`).set(auth());
    expect(res.status).toBe(404);
    expect(storage.getCalendarEvents).not.toHaveBeenCalled();
  });

  it('creates an event in its own team', async () => {
    const res = await request(app)
      .post(`/api/calendar?teamId=${OWN}`)
      .set(auth())
      .send({ ...eventBody, teamId: String(OWN) });
    expect(res.status).toBe(201);
    expect(storage.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: String(OWN) })
    );
  });
});

describe('file upload checks the team in the multipart body', () => {
  it('refuses a body team the caller is not in, with no team in the query', async () => {
    // The check used to run before the multipart parser and saw no team at all
    const res = await upload('/api/upload', String(OTHER));
    expect(res.status).toBe(403);
    expect(processUploadedFile).not.toHaveBeenCalled();
  });

  it('uploads into its own team', async () => {
    const res = await upload(`/api/upload?teamId=${OWN}`, String(OWN));
    expect(res.status).toBe(201);
    expect(processUploadedFile).toHaveBeenCalledWith(expect.anything(), String(OWN));
  });

  it('uploads a file with no team, as before', async () => {
    const res = await upload('/api/upload');
    expect(res.status).toBe(201);
    expect(processUploadedFile).toHaveBeenCalledWith(expect.anything(), undefined);
  });
});

describe('creating tasks, workflows and saved views in the checked team still works', () => {
  it('creates a task in its own team', async () => {
    const res = await request(app)
      .post(`/api/tasks?teamId=${OWN}`)
      .set(auth())
      .send({ ...taskBody, teamId: String(OWN) });
    expect(res.status).toBe(201);
    expect(storage.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: String(OWN) })
    );
  });

  it('creates a workflow in its own team', async () => {
    const res = await request(app)
      .post(`/api/workflows?teamId=${OWN}`)
      .set(auth())
      .send({ ...workflowBody, teamId: OWN });
    expect(res.status).toBe(201);
    expect(storage.createWorkflow).toHaveBeenCalledWith(expect.objectContaining({ teamId: OWN }));
  });

  it('creates a saved view in its own team', async () => {
    const res = await request(app)
      .post(`/api/saved-views?teamId=${OWN}`)
      .set(auth())
      .send({ ...viewBody, teamId: OWN });
    expect(res.status).toBe(201);
    expect(storage.createSavedView).toHaveBeenCalledWith(expect.objectContaining({ teamId: OWN }));
  });
});

describe('development without a signed-in user', () => {
  beforeEach(() => {
    mockConfig.enforceAuthForWrites = false;
  });

  it('needs no membership, as before', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ ...taskBody, teamId: String(OTHER) });
    expect(res.status).toBe(201);
    expect(storage.getUserTeamIds).not.toHaveBeenCalled();
  });

  it('still accepts a team name no team has, as before', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ ...taskBody, teamId: 'dev-team' });
    expect(res.status).toBe(201);
    expect(storage.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'dev-team' })
    );
  });

  it('refuses sources that name different teams', async () => {
    const res = await request(app)
      .post(`/api/tasks?teamId=${OWN}`)
      .send({ ...taskBody, teamId: String(OTHER) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'teamId mismatch' });
    expect(storage.createTask).not.toHaveBeenCalled();
  });
});
