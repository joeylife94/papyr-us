/**
 * A team id in a query string is read by the one strict rule (server/team-ids.ts): plain decimal
 * digits, no sign, leading zero, exponent, space, fraction or other text. A spelling that parseInt
 * would turn into a team number never selects that team.
 *
 * Rules under test, in both ENFORCE_AUTH_WRITES modes, for a caller who belongs to team 10 only:
 * - GET /api/pages?teamId= takes a strict id as an id and any other string as a team name (a team
 *   named `20-team` is found by that name, and a spelling that names no team scopes the listing to
 *   the caller's own teams, never to the number it starts with);
 * - GET /api/page-tree and GET /api/page-links/search answer 400 `Invalid team ID` for any other
 *   spelling and read nothing;
 * - GET /api/trash answers 400 `Invalid team ID` and lists nothing for any other spelling;
 * - DELETE /api/trash (platform admin) answers 400 and deletes nothing for any other spelling, so
 *   a malformed team id never widens the deletion to every team.
 *
 * The `strict ids and absent values keep working` cases are guards: they pass with the old and the
 * new reading alike.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

const SECRET = 'team-id-query-secret';
const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'team-id-query-secret',
  adminEmails: ['admin@example.com'],
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
  featureFlags: { PAPYR_MODE: 'team', FEATURE_TEAMS: true, FEATURE_ADMIN: true },
  isFeatureEnabled: () => true,
}));
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';
import { readTeamIdQuery } from '../team-ids';
const s: any = storage;

const MEMBER = { id: 7, email: 'member@example.com' };
const ADMIN = { id: 1, email: 'admin@example.com' };
const as = (who: { id: number; email: string }) => ({
  Authorization: `Bearer ${jwt.sign(who, SECRET)}`,
});
// The caller belongs to team 10 only; team 31 is named `20-team`, a team the caller is not in
const MY_TEAM = 10;
const NAMED_TEAM = 31;

/** Spellings that parseInt reads as team 10 (the caller's team) but the strict rule refuses. */
const ODD = ['10abc', '10-team', '10.5', '010', '10e1', '10 ', '+10', '%2010', '10%20'];

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});
afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  vi.clearAllMocks();
  s.getUserAccount.mockImplementation(async (id: number) => ({
    id,
    email: id === ADMIN.id ? ADMIN.email : MEMBER.email,
    isActive: true,
  }));
  s.getUserTeamIds.mockResolvedValue([MY_TEAM]);
  s.getUserTeamRole.mockResolvedValue('member');
  s.getUserOrganizationId.mockResolvedValue(1);
  s.getTeamByName.mockImplementation(async (name: string) =>
    name === '20-team'
      ? { id: NAMED_TEAM, name, organizationId: 1 }
      : name === 'other-org-team'
        ? { id: 50, name, organizationId: 2 }
        : undefined
  );
  s.getPageViewer.mockImplementation(async (userId: number) => ({
    userId,
    email: MEMBER.email,
    teamIds: [MY_TEAM],
  }));
  s.searchWikiPages.mockResolvedValue({ pages: [], total: 0 });
  s.getReadablePageTreeRows.mockResolvedValue([]);
  s.searchLinkTargets.mockResolvedValue([]);
  s.getTrashPages.mockResolvedValue([]);
  s.emptyTrash.mockResolvedValue(0);
});

describe('readTeamIdQuery', () => {
  it('reads nothing for an empty value, an id for a strict one, and refuses the rest', () => {
    expect(readTeamIdQuery(undefined)).toEqual({ ok: true, id: undefined });
    expect(readTeamIdQuery('')).toEqual({ ok: true, id: undefined });
    expect(readTeamIdQuery('10')).toEqual({ ok: true, id: 10 });
    for (const raw of [...ODD, 'abc', '0', '-1', '99999999999999999999', ['10'], { a: 1 }, 10]) {
      expect(readTeamIdQuery(raw), String(raw)).toEqual({ ok: false });
    }
  });
});

describe.each([true, false])('with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mockConfig.enforceAuthForWrites = enforce;
  });

  describe('GET /api/pages?teamId=', () => {
    const teamsSearched = () =>
      s.searchWikiPages.mock.calls.map((call: any[]) => call[0].teamId).sort();

    it('reads a strict id as an id', async () => {
      const res = await request(app).get(`/api/pages?teamId=${MY_TEAM}`).set(as(MEMBER));
      expect(res.status).toBe(200);
      expect(teamsSearched()).toEqual([String(MY_TEAM)]);
    });

    it('finds a team named like a number-prefixed string by that name, not by its number', async () => {
      // `20-team` is team 31, which the caller is not in: refused as that team, never read as 20
      const res = await request(app).get('/api/pages?teamId=20-team').set(as(MEMBER));
      expect(res.status).toBe(403);
      expect(s.getTeamByName).toHaveBeenCalledWith('20-team');
      expect(s.searchWikiPages).not.toHaveBeenCalled();
    });

    it('lists the named team for a member of it', async () => {
      s.getUserTeamIds.mockResolvedValue([MY_TEAM, NAMED_TEAM]);
      const res = await request(app).get('/api/pages?teamId=20-team').set(as(MEMBER));
      expect(res.status).toBe(200);
      expect(teamsSearched()).toEqual([String(NAMED_TEAM)]);
    });

    it.each(ODD)('does not read %j as team 10', async (spelling) => {
      s.getUserTeamIds.mockResolvedValue([NAMED_TEAM]); // not a member of team 10
      const res = await request(app)
        .get(`/api/pages?teamId=${encodeURIComponent(decodeURIComponent(spelling))}`)
        .set(as(MEMBER));
      // Not team 10: no team is named, so the listing is the caller's own teams (and team-less pages)
      expect(res.status).toBe(200);
      expect(teamsSearched()).toEqual(['null', String(NAMED_TEAM)].sort());
    });
  });

  describe.each(ODD)('team id %j', (spelling) => {
    const query = encodeURIComponent(decodeURIComponent(spelling));

    it('GET /api/page-tree answers 400 and reads nothing', async () => {
      const res = await request(app).get(`/api/page-tree?teamId=${query}`).set(as(MEMBER));
      expect([res.status, res.body]).toEqual([400, { message: 'Invalid team ID' }]);
      expect(s.getReadablePageTreeRows).not.toHaveBeenCalled();
    });

    it('GET /api/page-links/search answers 400 and reads nothing', async () => {
      const res = await request(app)
        .get(`/api/page-links/search?q=plan&teamId=${query}`)
        .set(as(MEMBER));
      expect([res.status, res.body]).toEqual([400, { message: 'Invalid team ID' }]);
      expect(s.searchLinkTargets).not.toHaveBeenCalled();
    });

    it('GET /api/trash answers 400 and lists nothing', async () => {
      const res = await request(app).get(`/api/trash?teamId=${query}`).set(as(MEMBER));
      expect([res.status, res.body]).toEqual([400, { error: 'Invalid team ID' }]);
      expect(s.getTrashPages).not.toHaveBeenCalled();
    });

    it('DELETE /api/trash answers 400 and deletes nothing', async () => {
      const res = await request(app).delete(`/api/trash?teamId=${query}`).set(as(ADMIN));
      expect(res.status).toBe(400);
      expect(s.emptyTrash).not.toHaveBeenCalled();
    });
  });

  describe('strict ids and absent values keep working', () => {
    it('GET /api/page-tree takes a strict id', async () => {
      expect(
        (await request(app).get(`/api/page-tree?teamId=${MY_TEAM}`).set(as(MEMBER))).status
      ).toBe(200);
      expect(s.getReadablePageTreeRows.mock.calls[0][1]).toMatchObject({ teamId: MY_TEAM });
    });

    it('GET /api/trash filters by a strict id', async () => {
      await request(app).get(`/api/trash?teamId=${MY_TEAM}`).set(as(MEMBER));
      expect(s.getTrashPages.mock.calls[0][1]).toBe(MY_TEAM);
    });

    it('DELETE /api/trash takes a strict id, or none for the whole trash', async () => {
      expect(
        (await request(app).delete(`/api/trash?teamId=${MY_TEAM}`).set(as(ADMIN))).status
      ).toBe(200);
      expect((await request(app).delete('/api/trash').set(as(ADMIN))).status).toBe(200);
      expect(s.emptyTrash.mock.calls.map((call: any[]) => call[0])).toEqual([MY_TEAM, undefined]);
    });
  });
});

// This route reads the session only under enforcement (requireAuthIfEnabled), so its strict-id
// case is run in that mode.
describe('GET /api/page-links/search with ENFORCE_AUTH_WRITES=true', () => {
  beforeEach(() => {
    mockConfig.enforceAuthForWrites = true;
  });

  it('takes a strict id', async () => {
    const res = await request(app)
      .get(`/api/page-links/search?q=a&teamId=${MY_TEAM}`)
      .set(as(MEMBER));
    expect(res.status).toBe(200);
    expect(s.searchLinkTargets.mock.calls[0][1]).toEqual({ teamId: MY_TEAM });
  });
});

describe('GET /api/pages?teamId=<name> looks the name up in the caller organization only', () => {
  const teamsSearched = () =>
    s.searchWikiPages.mock.calls.map((call: any[]) => call[0].teamId).sort();

  describe.each([true, false])('with ENFORCE_AUTH_WRITES=%s', (enforce) => {
    beforeEach(() => {
      mockConfig.enforceAuthForWrites = enforce;
    });

    it('answers the name of a team of another organization exactly as an unknown name', async () => {
      const otherOrganization = await request(app)
        .get('/api/pages?teamId=other-org-team')
        .set(as(MEMBER));
      const searchedForOther = teamsSearched();
      s.searchWikiPages.mockClear();
      const unknown = await request(app).get('/api/pages?teamId=no-such-team').set(as(MEMBER));
      expect([otherOrganization.status, otherOrganization.body]).toEqual([
        unknown.status,
        unknown.body,
      ]);
      expect(searchedForOther).toEqual(teamsSearched());
      expect(searchedForOther).not.toContain('50');
    });

    it('resolves the name of a team in the caller organization', async () => {
      s.getUserTeamIds.mockResolvedValue([MY_TEAM, NAMED_TEAM]);
      const res = await request(app).get('/api/pages?teamId=20-team').set(as(MEMBER));
      expect(res.status).toBe(200);
      expect(teamsSearched()).toEqual([String(NAMED_TEAM)]);
    });

    it('an account without an organization resolves no name', async () => {
      s.getUserOrganizationId.mockResolvedValue(null);
      s.getUserTeamIds.mockResolvedValue([MY_TEAM, NAMED_TEAM]);
      await request(app).get('/api/pages?teamId=20-team').set(as(MEMBER));
      expect(teamsSearched()).not.toEqual([String(NAMED_TEAM)]);
      expect(s.getTeamByName).not.toHaveBeenCalled();
    });
  });

  it('without a session (enforcement off) never resolves a team name', async () => {
    mockConfig.enforceAuthForWrites = false;
    const res = await request(app).get('/api/pages?teamId=20-team');
    expect(res.status).toBe(200);
    expect(s.getTeamByName).not.toHaveBeenCalled();
    expect(s.searchWikiPages.mock.calls.map((call: any[]) => call[0].teamId)).toEqual(['null']);
  });
});
