/**
 * A team id in a URL is read by one strict rule: plain decimal digits, no sign, no leading zero,
 * no exponent, space, fraction or other text, within the database's integer range. Anything else
 * names no team, so a spelling that a looser reader would turn into another team (`1e1`, `0x10`,
 * `5.0`, ` 5`) never reaches that team's rules.
 *
 * Rules under test, in both ENFORCE_AUTH_WRITES modes, with a caller who owns teams 5, 10 and 16:
 * - GET, PUT and DELETE /api/teams/:id answer 404 { error: 'Team not found' } for such a spelling
 *   and read or change nothing;
 * - the team membership routes answer their existing 400 for a team id or a user id spelled so;
 * - the plain spelling works as before.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { registerTeamMembershipRoutes } from '../team-membership-routes';
import { parseTeamIdParam, MAX_TEAM_ID } from '../team-ids';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'team-id-params-secret',
  adminEmails: [] as string[],
  enforceAuthForWrites: false,
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
  featureFlags: { PAPYR_MODE: 'team', FEATURE_TEAMS: true },
  isFeatureEnabled: () => true,
}));
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';
const s: any = storage;

const OWNER = 7;
const token = jwt.sign({ id: OWNER, email: 'owner@example.com' }, 'team-id-params-secret');
const auth = { Authorization: `Bearer ${token}` };
const OWNED = [5, 10, 16];

/** Spellings a strict reader refuses (each is also a plain URL segment once encoded). */
const ODD = [
  '1e1',
  '0x10',
  '0b101',
  '5.0',
  '5.',
  '+5',
  '-5',
  '05',
  '0',
  '00',
  '5abc',
  '5,6',
  '%205',
  '5%20',
  '%0a5',
  '٥',
  '2147483648',
  '99999999999999999999',
  'Infinity',
];

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
  // Registered by the server's entry point, after the routes above
  registerTeamMembershipRoutes(app, storage as any);
});
afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  vi.clearAllMocks();
  s.getUserTeamIds.mockResolvedValue(OWNED);
  s.getUserTeamRole.mockImplementation(async (_u: number, t: number) =>
    OWNED.includes(t) ? 'owner' : null
  );
  s.getTeam.mockImplementation(async (id: number) => ({ id, name: `team-${id}`, password: null }));
  s.updateTeam.mockImplementation(async (id: number, d: any) => ({ id, name: `team-${id}`, ...d }));
  s.deleteTeam.mockResolvedValue('deleted');
});

describe('parseTeamIdParam', () => {
  it('reads plain digits only', () => {
    expect(parseTeamIdParam('5')).toBe(5);
    expect(parseTeamIdParam('2147483647')).toBe(MAX_TEAM_ID);
    for (const raw of [...ODD, '', undefined, null, 5, ['5'], {}]) {
      expect(parseTeamIdParam(raw as unknown), String(raw)).toBeNull();
    }
  });
});

describe.each([true, false])('with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mockConfig.enforceAuthForWrites = enforce;
  });

  describe.each(ODD)('team id %j in /api/teams/:id', (spelling) => {
    it('GET, PUT and DELETE answer 404 and read or change nothing', async () => {
      const get = await request(app).get(`/api/teams/${spelling}`).set(auth);
      const put = await request(app)
        .put(`/api/teams/${spelling}`)
        .set(auth)
        .send({ displayName: 'Renamed' });
      const del = await request(app).delete(`/api/teams/${spelling}`).set(auth);
      for (const res of [get, put, del]) {
        expect(res.status, `${res.request.method} ${spelling}`).toBe(404);
        expect(res.body).toEqual({ error: 'Team not found' });
      }
      expect(s.getTeam).not.toHaveBeenCalled();
      expect(s.updateTeam).not.toHaveBeenCalled();
      expect(s.deleteTeam).not.toHaveBeenCalled();
      expect(s.getUserTeamRole).not.toHaveBeenCalled();
    });
  });

  it('a signed-out caller is still asked to sign in first where a session is required', async () => {
    // GET asks for a session only under enforcement; without it a signed-out caller meets the id rule
    const get = await request(app).get('/api/teams/1e1');
    expect([get.status, get.body]).toEqual(
      enforce ? [401, { error: 'Authentication required' }] : [404, { error: 'Team not found' }]
    );
    const put = await request(app).put('/api/teams/1e1').send({ displayName: 'x' });
    // the write gate answers under enforcement, the handler otherwise
    const refusal = enforce
      ? { message: 'No token provided' }
      : { error: 'Authentication required' };
    expect([put.status, put.body]).toEqual([401, refusal]);
    const del = await request(app).delete('/api/teams/1e1');
    expect([del.status, del.body]).toEqual([401, refusal]);
  });

  it('the plain spelling works as before', async () => {
    expect((await request(app).get('/api/teams/10').set(auth)).status).toBe(200);
    const put = await request(app).put('/api/teams/10').set(auth).send({ displayName: 'Renamed' });
    expect(put.status).toBe(200);
    expect(s.updateTeam).toHaveBeenCalledWith(10, { displayName: 'Renamed' });
    expect((await request(app).delete('/api/teams/10').set(auth)).status).toBe(204);
    expect(s.deleteTeam).toHaveBeenCalledWith(10);
  });

  describe.each(ODD)('team id %j in the membership routes', (spelling) => {
    it('answers 400 and reaches no team', async () => {
      const base = `/api/teams/${spelling}`;
      const answers = [
        await request(app).get(`${base}/members`).set(auth),
        await request(app).get(`${base}/member-candidates?q=ab`).set(auth),
        await request(app).post(`${base}/memberships`).set(auth).send({ email: 'a@b.co' }),
        await request(app).patch(`${base}/memberships/9`).set(auth).send({ role: 'member' }),
        await request(app).delete(`${base}/memberships/me`).set(auth),
        await request(app).delete(`${base}/memberships/9`).set(auth),
      ];
      for (const res of answers) expect(res.status, res.request.url).toBe(400);
      expect(s.listTeamMembers).not.toHaveBeenCalled();
      expect(s.listTeamMemberCandidates).not.toHaveBeenCalled();
      expect(s.admitTeamMember).not.toHaveBeenCalled();
      expect(s.changeTeamMemberRole).not.toHaveBeenCalled();
      expect(s.removeTeamMember).not.toHaveBeenCalled();
    });

    it('as the user id of a membership answers 400 and changes nothing', async () => {
      const patch = await request(app)
        .patch(`/api/teams/10/memberships/${spelling}`)
        .set(auth)
        .send({ role: 'member' });
      const del = await request(app).delete(`/api/teams/10/memberships/${spelling}`).set(auth);
      expect(patch.status).toBe(400);
      expect(del.status).toBe(400);
      expect(s.changeTeamMemberRole).not.toHaveBeenCalled();
      expect(s.removeTeamMember).not.toHaveBeenCalled();
    });
  });
});
