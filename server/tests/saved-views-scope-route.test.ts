/**
 * Route rules of /api/saved-views (#124 X1b, decision D4). Same rules as the workflow routes:
 * - a view belongs to a team: POST without a team is 400, PUT cannot remove the team;
 * - a view with no team (legacy row) answers 404 to everyone on GET/PUT/DELETE/set-default,
 *   and nothing is changed or deleted;
 * - a view of another team (or organization) answers 403 on each route;
 * - a caller without a session gets 401, also when auth is not enforced (the single-view read
 *   used to be open to anonymous callers then);
 * - a member of the view's team keeps working access.
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
  jwtSecret: 'saved-views-scope-route-secret',
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

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const OWN_TEAM = 3;
const OTHER_TEAM = 4;
const CALLER = { id: 7, email: 'member@example.com' };
const token = jwt.sign({ id: CALLER.id, email: CALLER.email, role: 'user' }, mockConfig.jwtSecret);
const signedIn = () => ({ Cookie: [`accessToken=${token}`] });

const viewOf = (teamId: number | null) => ({
  id: 5,
  name: 'V',
  description: null,
  viewType: 'table',
  entityType: 'tasks',
  teamId,
  createdBy: null,
  isDefault: false,
  isPublic: false,
  config: {},
});

const body = { name: 'New', viewType: 'table', entityType: 'tasks', config: {} };

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
  storage.createSavedView.mockImplementation(async (data: any) => ({ id: 9, ...data }));
  storage.updateSavedView.mockImplementation(async (id: number, data: any) => ({
    ...viewOf(OWN_TEAM),
    id,
    ...data,
  }));
  storage.deleteSavedView.mockResolvedValue(true);
  storage.setDefaultView.mockResolvedValue(undefined);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const noWrites = () => {
  expect(storage.createSavedView).not.toHaveBeenCalled();
  expect(storage.updateSavedView).not.toHaveBeenCalled();
  expect(storage.deleteSavedView).not.toHaveBeenCalled();
  expect(storage.setDefaultView).not.toHaveBeenCalled();
};

const singleRoutes: Array<[string, (a: Express) => request.Test]> = [
  ['GET /api/saved-views/5', (a) => request(a).get('/api/saved-views/5')],
  ['PUT /api/saved-views/5', (a) => request(a).put('/api/saved-views/5').send({ name: 'x' })],
  ['DELETE /api/saved-views/5', (a) => request(a).delete('/api/saved-views/5')],
  ['POST /api/saved-views/5/set-default', (a) => request(a).post('/api/saved-views/5/set-default')],
];

describe('POST /api/saved-views needs a team', () => {
  it('answers 400 without a team (or with a null/empty one) and creates nothing', async () => {
    for (const extra of [{}, { teamId: null }, { teamId: '' }]) {
      const response = await request(app)
        .post('/api/saved-views')
        .set(signedIn())
        .send({ ...body, ...extra });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'teamId is required' });
    }
    noWrites();
  });

  it('creates in the checked team, by id or by name', async () => {
    const byId = await request(app)
      .post('/api/saved-views')
      .set(signedIn())
      .send({ ...body, teamId: OWN_TEAM });
    expect(byId.status).toBe(201);
    expect(storage.createSavedView).toHaveBeenLastCalledWith(
      expect.objectContaining({ teamId: OWN_TEAM })
    );

    const byName = await request(app)
      .post('/api/saved-views')
      .set(signedIn())
      .send({ ...body, teamId: 'own-team' });
    expect(byName.status).toBe(201);
    expect(storage.createSavedView).toHaveBeenLastCalledWith(
      expect.objectContaining({ teamId: OWN_TEAM })
    );
  });

  it('refuses another team with 403 and creates nothing', async () => {
    const response = await request(app)
      .post('/api/saved-views')
      .set(signedIn())
      .send({ ...body, teamId: OTHER_TEAM });
    expect(response.status).toBe(403);
    noWrites();
  });
});

describe('PUT /api/saved-views/:id cannot remove the team', () => {
  it.each([null, ''])('answers 400 for teamId %j and updates nothing', async (teamId) => {
    storage.getSavedView.mockResolvedValue(viewOf(OWN_TEAM));
    const response = await request(app).put('/api/saved-views/5').set(signedIn()).send({ teamId });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'teamId is required' });
    noWrites();
  });

  it('still refuses a move to a team the caller is not in', async () => {
    storage.getSavedView.mockResolvedValue(viewOf(OWN_TEAM));
    const response = await request(app)
      .put('/api/saved-views/5')
      .set(signedIn())
      .send({ teamId: OTHER_TEAM });
    expect(response.status).toBe(403);
    noWrites();
  });
});

describe('a view with no team answers 404 to everyone', () => {
  beforeEach(() => storage.getSavedView.mockResolvedValue(viewOf(null)));

  it.each(singleRoutes)('%s', async (_name, call) => {
    const response = await call(app).set(signedIn());
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'View not found' });
    noWrites();
  });

  it.each(singleRoutes)('%s, when auth is not enforced', async (_name, call) => {
    mockConfig.enforceAuthForWrites = false;
    const response = await call(app).set(signedIn());
    expect(response.status).toBe(404);
    noWrites();
  });

  it.each([true, false])(
    'every route answers 401 to a caller without a session, so team-less and team views look alike (auth enforced: %s)',
    async (enforced) => {
      mockConfig.enforceAuthForWrites = enforced;
      for (const [, call] of singleRoutes) {
        const response = await call(app);
        expect(response.status).toBe(401);
      }
      expect(storage.getSavedView).not.toHaveBeenCalled();
      noWrites();
    }
  );
});

describe('creating or changing a view needs a session in both auth modes', () => {
  it.each([true, false])(
    'POST and PUT answer 401 before any lookup (enforced: %s)',
    async (enforced) => {
      mockConfig.enforceAuthForWrites = enforced;
      const created = await request(app)
        .post('/api/saved-views')
        .send({ ...body, teamId: OWN_TEAM });
      expect(created.status).toBe(401);
      const updated = await request(app).put('/api/saved-views/5').send({ teamId: OWN_TEAM });
      expect(updated.status).toBe(401);
      expect(storage.getTeamByName).not.toHaveBeenCalled();
      expect(storage.getSavedView).not.toHaveBeenCalled();
      noWrites();
    }
  );
});

describe('a view of another team answers 403', () => {
  beforeEach(() => storage.getSavedView.mockResolvedValue(viewOf(OTHER_TEAM)));

  it.each(singleRoutes)('%s', async (_name, call) => {
    const response = await call(app).set(signedIn());
    expect(response.status).toBe(403);
    noWrites();
  });
});

describe('a caller without a session', () => {
  beforeEach(() => storage.getSavedView.mockResolvedValue(viewOf(OWN_TEAM)));

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

describe('a member of the view team', () => {
  beforeEach(() => storage.getSavedView.mockResolvedValue(viewOf(OWN_TEAM)));

  it.each([true, false])('keeps access to every route (auth enforced: %s)', async (enforced) => {
    mockConfig.enforceAuthForWrites = enforced;
    for (const [, call] of singleRoutes) {
      const response = await call(app).set(signedIn());
      expect([200, 204]).toContain(response.status);
    }
    expect(storage.setDefaultView).toHaveBeenCalledWith(5, OWN_TEAM, 'tasks');
  });
});
