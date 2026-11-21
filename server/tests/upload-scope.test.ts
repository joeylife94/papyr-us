/**
 * Who may upload, read, list and delete a file (issue #124 X1b, decision D5).
 *
 * An upload is a file plus a sidecar naming its team and organization. Rules under test:
 * - a sidecar written now holds the numeric id of the checked team (never the raw field, so a
 *   team named in the query or by name is stored as its id), the uploader's organization and
 *   the uploader's id; uploading needs a session and an organization;
 * - a team file is readable and deletable by members of that team only;
 * - a team-less file belongs to the organization in its sidecar; a legacy sidecar without one
 *   counts as the default organization's; any other organization is refused with the same
 *   answer as a team refusal;
 * - a legacy sidecar that holds a team name is resolved by name;
 * - a missing or unreadable sidecar denies reading and deleting alike;
 * - deleting needs a session even when auth is not enforced.
 * The access helper is checked directly first, then through the routes (storage and the file
 * service mocked; filename validation and multer are the real ones).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'upload-scope-secret';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'upload-scope-secret',
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

vi.mock('../services/upload', async () => {
  const actual = (await vi.importActual('../services/upload')) as any;
  return {
    ...actual,
    processUploadedFile: vi.fn(),
    listUploadedFiles: vi.fn(),
    getFileInfo: vi.fn(),
    deleteUploadedFile: vi.fn(),
    getFileMeta: vi.fn(),
    getFileTeamId: vi.fn(),
  };
});

import * as storageModule from '../storage.js';
import * as uploadService from '../services/upload';
import { checkUploadAccess } from '../services/upload';

const storage: any = (storageModule as any).storage;
const svc: any = uploadService;

const DEFAULT_ORG = 1;
const ORG = 5; // the caller's organization
const OTHER_ORG = 6;
const TEAM = 5;
const OTHER_TEAM = 9;
const MEMBER = { id: 7, email: 'member@example.com' }; // in ORG and TEAM
const COLLEAGUE = { id: 8, email: 'colleague@example.com' }; // in ORG, no team
const OUTSIDER = { id: 10, email: 'outsider@example.com' }; // in OTHER_ORG
const NO_ORG = { id: 11, email: 'noorg@example.com' };
const orgOf: Record<number, number | null> = {
  [MEMBER.id]: ORG,
  [COLLEAGUE.id]: ORG,
  [OUTSIDER.id]: OTHER_ORG,
  [NO_ORG.id]: null,
};
const teamsOf: Record<number, number[]> = { [MEMBER.id]: [TEAM], [OUTSIDER.id]: [OTHER_TEAM] };

const tokenFor = (user: { id: number; email: string }) =>
  jwt.sign({ id: user.id, email: user.email, role: 'user' }, TEST_SECRET);
const as = (user: { id: number; email: string }) => ({ Cookie: [`accessToken=${tokenFor(user)}`] });

/** Makes the mocked file service describe one sidecar, both the new way and the old one. */
function sidecar(meta: { teamId: string | null; organizationId: number | null } | undefined) {
  svc.getFileMeta.mockResolvedValue(meta);
  svc.getFileTeamId.mockResolvedValue(meta ? meta.teamId : undefined);
}

describe('checkUploadAccess', () => {
  const caller = { organizationId: ORG, teamIds: [TEAM] };
  const deps = {
    defaultOrganizationId: async () => DEFAULT_ORG,
    teamByName: async (name: string) =>
      name === 'alpha'
        ? { id: TEAM, organizationId: DEFAULT_ORG }
        : name === 'beta'
          ? { id: TEAM, organizationId: OTHER_ORG } // a team of another organization
          : undefined,
  };
  const check = (meta: any, who = caller) => checkUploadAccess(meta, who, deps);

  it('allows a team file to a member of that team only', async () => {
    const file = { teamId: String(TEAM), organizationId: ORG };
    expect(await check(file)).toBe('allowed');
    expect(await check(file, { organizationId: ORG, teamIds: [OTHER_TEAM] })).toBe('denied');
    expect(await check(file, { organizationId: ORG, teamIds: [] })).toBe('denied');
  });

  it('refuses a team file whose sidecar organization is not the caller one', async () => {
    expect(await check({ teamId: String(TEAM), organizationId: OTHER_ORG })).toBe('denied');
  });

  it('gives a team-less file to the organization in its sidecar', async () => {
    const file = { teamId: null, organizationId: ORG };
    expect(await check(file)).toBe('allowed');
    expect(await check(file, { organizationId: ORG, teamIds: [] })).toBe('allowed');
    expect(await check(file, { organizationId: OTHER_ORG, teamIds: [] })).toBe('denied');
  });

  it('counts a legacy team-less sidecar as the default organization', async () => {
    const legacy = { teamId: null, organizationId: null };
    expect(await check(legacy, { organizationId: DEFAULT_ORG, teamIds: [] })).toBe('allowed');
    expect(await check(legacy, { organizationId: ORG, teamIds: [] })).toBe('denied');
  });

  it('rejects, never allows, when the default organization cannot be read', async () => {
    const failing = {
      ...deps,
      defaultOrganizationId: async () => {
        throw new Error('db down');
      },
    };
    await expect(
      checkUploadAccess({ teamId: null, organizationId: null }, caller, failing)
    ).rejects.toThrow();
  });

  it('resolves a legacy sidecar that holds a team name, for a default-organization team', async () => {
    const inDefault = { organizationId: DEFAULT_ORG, teamIds: [TEAM] };
    const legacyName = { teamId: 'alpha', organizationId: null };
    expect(await check(legacyName, inDefault)).toBe('allowed');
    expect(await check(legacyName, { organizationId: DEFAULT_ORG, teamIds: [OTHER_TEAM] })).toBe(
      'denied'
    );
    expect(await check({ teamId: 'unknown-team', organizationId: null }, inDefault)).toBe('denied');
  });

  it('refuses a legacy team name that resolves to a team of another organization', async () => {
    // The original team is gone; another organization created a team with the same name.
    const members = { organizationId: OTHER_ORG, teamIds: [TEAM] };
    expect(await check({ teamId: 'beta', organizationId: null }, members)).toBe('denied');
    expect(await check({ teamId: 'beta', organizationId: null })).toBe('denied');
  });

  it('reports a missing sidecar as unavailable', async () => {
    expect(await check(undefined)).toBe('metadata_unavailable');
  });
});

let app: Express;
let server: http.Server;
const testFilePath = path.join(__dirname, 'upload-scope-test-file.txt');

beforeAll(async () => {
  fs.writeFileSync(testFilePath, 'a test file');
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  fs.unlinkSync(testFilePath);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.enforceAuthForWrites = true;
  storage.getUserOrganizationId.mockImplementation(async (id: number) => orgOf[id] ?? null);
  storage.getUserTeamIds.mockImplementation(async (id: number) => teamsOf[id] ?? []);
  storage.getDefaultOrganizationId.mockResolvedValue(DEFAULT_ORG);
  storage.getTeamByName.mockImplementation(async (name: string) =>
    name === 'alpha'
      ? { id: TEAM, name: 'alpha', organizationId: DEFAULT_ORG }
      : name === 'beta'
        ? { id: TEAM, name: 'beta', organizationId: OTHER_ORG }
        : undefined
  );
  storage.getTeam.mockImplementation(async (id: number) =>
    id === TEAM ? { id: TEAM, name: 'alpha', organizationId: DEFAULT_ORG } : undefined
  );
  svc.processUploadedFile.mockImplementation(async (file: any, teamId?: string) => ({
    filename: 'stored.txt',
    originalName: file.originalname,
    size: 1,
    mimetype: 'text/plain',
    url: '/api/uploads/files/stored.txt',
    path: '/x/stored.txt',
    teamId,
  }));
  svc.listUploadedFiles.mockResolvedValue({ images: [], files: [] });
  svc.deleteUploadedFile.mockResolvedValue(true);
  svc.getFileInfo.mockResolvedValue({
    path: testFilePath,
    mimetype: 'text/plain',
    size: 11,
  });
  sidecar({ teamId: null, organizationId: ORG });
});

describe('POST /api/upload', () => {
  const post = (who: any, query = '', fields: Record<string, string> = {}) => {
    let req = request(app)
      .post(`/api/upload${query}`)
      .set(who ? as(who) : {});
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('files', testFilePath);
  };

  it('stores the checked team id when the team is only in the query', async () => {
    const response = await post(MEMBER, `?teamId=${TEAM}`);
    expect(response.status).toBe(201);
    expect(svc.processUploadedFile).toHaveBeenCalledTimes(1);
    const [, teamId, owner] = svc.processUploadedFile.mock.calls[0];
    expect(teamId).toBe(String(TEAM));
    expect(owner).toEqual({ organizationId: ORG, uploadedBy: MEMBER.id });
    expect(response.body.files[0].teamId).toBe(String(TEAM));
  });

  it('stores the numeric id when the team is named in the body by name', async () => {
    const response = await post(MEMBER, '', { teamId: 'alpha' });
    expect(response.status).toBe(201);
    expect(svc.processUploadedFile.mock.calls[0][1]).toBe(String(TEAM));
  });

  it('stores a team-less upload with the uploader organization', async () => {
    const response = await post(COLLEAGUE);
    expect(response.status).toBe(201);
    const [, teamId, owner] = svc.processUploadedFile.mock.calls[0];
    expect(teamId).toBeUndefined();
    expect(owner).toEqual({ organizationId: ORG, uploadedBy: COLLEAGUE.id });
  });

  it('refuses a team the caller is not in', async () => {
    const response = await post(OUTSIDER, `?teamId=${TEAM}`);
    expect(response.status).toBe(403);
    expect(svc.processUploadedFile).not.toHaveBeenCalled();
  });

  it('needs a session, also when auth is not enforced', async () => {
    expect((await post(undefined)).status).toBe(401);
    mockConfig.enforceAuthForWrites = false;
    expect((await post(undefined)).status).toBe(401);
    expect(svc.processUploadedFile).not.toHaveBeenCalled();
  });

  it('needs an organization', async () => {
    const response = await post(NO_ORG);
    expect(response.status).toBe(403);
    expect(svc.processUploadedFile).not.toHaveBeenCalled();
  });
});

describe('GET /api/uploads/:type/:filename', () => {
  const kinds = ['images', 'files'] as const;
  const MESSAGE = { message: 'You are not a member of this team' };

  it.each(kinds)('%s: 401 without a session', async (kind) => {
    expect((await request(app).get(`/api/uploads/${kind}/a.png`)).status).toBe(401);
  });

  it.each(kinds)('%s: a team-less file is served inside its organization', async (kind) => {
    const response = await request(app).get(`/api/uploads/${kind}/a.png`).set(as(COLLEAGUE));
    expect(response.status).toBe(200);
  });

  it.each(kinds)('%s: a team-less file is refused to another organization', async (kind) => {
    const response = await request(app).get(`/api/uploads/${kind}/a.png`).set(as(OUTSIDER));
    expect(response.status).toBe(403);
    expect(response.body).toEqual(MESSAGE);
  });

  it.each(kinds)('%s: a legacy sidecar counts as the default organization', async (kind) => {
    sidecar({ teamId: null, organizationId: null });
    expect((await request(app).get(`/api/uploads/${kind}/a.png`).set(as(OUTSIDER))).status).toBe(
      403
    );
    orgOf[OUTSIDER.id] = DEFAULT_ORG;
    try {
      expect((await request(app).get(`/api/uploads/${kind}/a.png`).set(as(OUTSIDER))).status).toBe(
        200
      );
    } finally {
      orgOf[OUTSIDER.id] = OTHER_ORG;
    }
  });

  it.each(kinds)('%s: a team file is served to its members only', async (kind) => {
    sidecar({ teamId: String(TEAM), organizationId: ORG });
    expect((await request(app).get(`/api/uploads/${kind}/a.png`).set(as(MEMBER))).status).toBe(200);
    const colleague = await request(app).get(`/api/uploads/${kind}/a.png`).set(as(COLLEAGUE));
    expect(colleague.status).toBe(403);
    expect(colleague.body).toEqual(MESSAGE);
    const outsider = await request(app).get(`/api/uploads/${kind}/a.png`).set(as(OUTSIDER));
    expect(outsider.status).toBe(403);
    expect(outsider.body).toEqual(MESSAGE);
  });

  it.each(kinds)('%s: a legacy sidecar with a team name serves that team', async (kind) => {
    sidecar({ teamId: 'alpha', organizationId: null });
    expect((await request(app).get(`/api/uploads/${kind}/a.png`).set(as(MEMBER))).status).toBe(200);
    expect((await request(app).get(`/api/uploads/${kind}/a.png`).set(as(COLLEAGUE))).status).toBe(
      403
    );
  });

  it.each(kinds)(
    '%s: a legacy team name that now resolves to another organization is refused',
    async (kind) => {
      sidecar({ teamId: 'beta', organizationId: null });
      const response = await request(app).get(`/api/uploads/${kind}/a.png`).set(as(MEMBER));
      expect(response.status).toBe(403);
      const del = await request(app).delete(`/api/uploads/${kind}/a.png`).set(as(MEMBER));
      expect(del.status).toBe(403);
      expect(svc.deleteUploadedFile).not.toHaveBeenCalled();
    }
  );

  it.each(kinds)('%s: a missing sidecar is refused', async (kind) => {
    sidecar(undefined);
    const response = await request(app).get(`/api/uploads/${kind}/a.png`).set(as(MEMBER));
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'File metadata unavailable' });
  });

  it.each(kinds)('%s: an account without an organization is refused', async (kind) => {
    expect((await request(app).get(`/api/uploads/${kind}/a.png`).set(as(NO_ORG))).status).toBe(403);
  });
});

describe('DELETE /api/uploads/:type/:filename', () => {
  const del = (who: any, name = 'a.txt', kind = 'files') =>
    request(app)
      .delete(`/api/uploads/${kind}/${name}`)
      .set(who ? as(who) : {});

  it('needs a session, also when auth is not enforced', async () => {
    expect((await del(undefined)).status).toBe(401);
    mockConfig.enforceAuthForWrites = false;
    expect((await del(undefined)).status).toBe(401);
    expect(svc.deleteUploadedFile).not.toHaveBeenCalled();
  });

  it('refuses a file without a readable sidecar', async () => {
    sidecar(undefined);
    const response = await del(MEMBER);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'File metadata unavailable' });
    expect(svc.deleteUploadedFile).not.toHaveBeenCalled();
  });

  it('deletes a team-less file of the own organization, not of another one', async () => {
    expect((await del(COLLEAGUE)).status).toBe(200);
    expect(svc.deleteUploadedFile).toHaveBeenCalledWith('a.txt', false);
    svc.deleteUploadedFile.mockClear();
    const outsider = await del(OUTSIDER);
    expect(outsider.status).toBe(403);
    expect(svc.deleteUploadedFile).not.toHaveBeenCalled();
  });

  it('deletes a team file for its members only', async () => {
    sidecar({ teamId: String(TEAM), organizationId: ORG });
    expect((await del(COLLEAGUE)).status).toBe(403);
    expect((await del(OUTSIDER)).status).toBe(403);
    expect(svc.deleteUploadedFile).not.toHaveBeenCalled();
    expect((await del(MEMBER, 'a.png', 'images')).status).toBe(200);
    expect(svc.deleteUploadedFile).toHaveBeenCalledWith('a.png', true);
  });

  it('refuses an account without an organization', async () => {
    expect((await del(NO_ORG)).status).toBe(403);
    expect(svc.deleteUploadedFile).not.toHaveBeenCalled();
  });
});

describe('GET /api/uploads', () => {
  it('lists a team by its resolved id and its legacy name', async () => {
    const response = await request(app).get(`/api/uploads?teamId=${TEAM}`).set(as(MEMBER));
    expect(response.status).toBe(200);
    expect(svc.listUploadedFiles).toHaveBeenCalledWith(String(TEAM), ['alpha']);
  });

  it('lists the union of the caller teams when no team is named', async () => {
    await request(app).get('/api/uploads').set(as(MEMBER));
    expect(svc.listUploadedFiles).toHaveBeenCalledWith(String(TEAM), ['alpha']);
  });

  it('refuses a team the caller is not in', async () => {
    const response = await request(app).get(`/api/uploads?teamId=${TEAM}`).set(as(OUTSIDER));
    expect(response.status).toBe(403);
    expect(svc.listUploadedFiles).not.toHaveBeenCalled();
  });

  it('needs a session in every mode, before any team resolution or listing', async () => {
    for (const enforced of [true, false]) {
      mockConfig.enforceAuthForWrites = enforced;
      for (const query of ['', `?teamId=${TEAM}`, '?teamId=alpha']) {
        const response = await request(app).get(`/api/uploads${query}`);
        expect(response.status, `${enforced} ${query}`).toBe(401);
      }
    }
    expect(svc.listUploadedFiles).not.toHaveBeenCalled();
    expect(storage.getTeamByName).not.toHaveBeenCalled();
  });

  it('matches the legacy team name only for a team of the default organization', async () => {
    storage.getTeam.mockResolvedValue({ id: TEAM, name: 'beta', organizationId: OTHER_ORG });
    await request(app).get(`/api/uploads?teamId=${TEAM}`).set(as(MEMBER));
    expect(svc.listUploadedFiles).toHaveBeenCalledWith(String(TEAM), []);
  });
});
