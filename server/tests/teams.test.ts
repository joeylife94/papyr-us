import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { config } from '../config';
import { parseTeamReference } from '../middleware';
import { onPageAccessChanged } from '../services/page-access-events.js';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'teams-test-secret',
  adminEmails: [] as string[],
  // The legacy generic tests below run unsigned, as with the default test environment.
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

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';

let app: Express;
let server: http.Server;
const memberToken = jwt.sign({ id: 7, email: 'owner@example.com' }, config.jwtSecret);

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  // An active account unless a test says otherwise
  (storage.getUserAccount as vi.Mock).mockResolvedValue({
    id: 7,
    email: 'creator@example.com',
    isActive: true,
  });
});

afterAll((done) => {
  server.close(done);
});

describe('Team Management API', () => {
  const mockTeam = {
    id: 1,
    name: 'core-devs',
    displayName: 'Core Developers',
    description: 'The core development team.',
  };

  it('TC-TEAM-001: should create a new team owned by its creator', async () => {
    const newTeamData = { name: 'new-team', displayName: 'New Team' };
    (storage.createTeamWithOwner as vi.Mock).mockResolvedValue({ ...newTeamData, id: 2 });
    const token = jwt.sign({ id: 7, email: 'creator@example.com' }, config.jwtSecret);

    const response = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send(newTeamData);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id', 2);
    // The team goes into the creator's organization (issue #124 X1), which storage resolves
    expect(storage.createTeamWithOwner).toHaveBeenCalledWith(
      expect.objectContaining(newTeamData),
      7
    );
  });

  it('TC-TEAM-001b: refuses to create a team without a signed-in creator', async () => {
    const response = await request(app)
      .post('/api/teams')
      .send({ name: 'anon-team', displayName: 'Anon Team' });

    expect(response.status).toBe(401);
    expect(storage.createTeam).not.toHaveBeenCalled();
    expect(storage.createTeamWithOwner).not.toHaveBeenCalled();
  });

  it('TC-TEAM-001c: refuses a creator who belongs to no organization', async () => {
    const { OrganizationRequiredError } =
      await vi.importActual<typeof import('../storage')>('../storage');
    (storage.createTeamWithOwner as vi.Mock).mockRejectedValue(new OrganizationRequiredError());
    const token = jwt.sign({ id: 8, email: 'nobody@example.com' }, config.jwtSecret);

    const response = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'orphan-team', displayName: 'Orphan Team' });

    expect(response.status).toBe(403);
  });

  for (const enforce of [true, false]) {
    describe(`creating a team with ENFORCE_AUTH_WRITES=${enforce}`, () => {
      beforeEach(() => {
        mockConfig.enforceAuthForWrites = enforce;
      });
      afterEach(() => {
        mockConfig.enforceAuthForWrites = false;
      });

      it('signed out is 401 and nothing is created', async () => {
        const response = await request(app)
          .post('/api/teams')
          .send({ name: 'anon-team', displayName: 'Anon Team' });
        expect(response.status).toBe(401);
        expect(storage.createTeamWithOwner).not.toHaveBeenCalled();
      });

      it('signed in creates the team for its creator', async () => {
        (storage.createTeamWithOwner as vi.Mock).mockResolvedValue({ id: 3, name: 'mode-team' });
        const token = jwt.sign({ id: 9, email: 'mode@example.com' }, config.jwtSecret);
        const response = await request(app)
          .post('/api/teams')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'mode-team', displayName: 'Mode Team' });
        expect(response.status).toBe(201);
        expect(storage.createTeamWithOwner).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'mode-team' }),
          9
        );
      });
    });
  }

  it('TC-TEAM-001d: refuses a team without a display name (400)', async () => {
    const token = jwt.sign({ id: 7, email: 'creator@example.com' }, config.jwtSecret);
    for (const body of [{}, { name: 'only-name' }]) {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(storage.createTeamWithOwner).not.toHaveBeenCalled();
  });

  const taken = () =>
    Object.assign(new Error('duplicate key value violates unique constraint "teams_name_unique"'), {
      code: '23505',
      constraint: 'teams_name_unique',
    });
  const creator = () => jwt.sign({ id: 7, email: 'creator@example.com' }, config.jwtSecret);

  it('TC-TEAM-001e: a clash on a requested name yields a different, usable name; a clash is never a 409 or a 500', async () => {
    (storage.createTeamWithOwner as vi.Mock)
      .mockRejectedValueOnce(taken())
      .mockImplementation(async (team: any) => ({ id: 9, ...team }));
    const response = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${creator()}`)
      .send({ name: 'taken', displayName: 'Taken' });
    expect(response.status).toBe(201);
    expect(response.status).not.toBe(409);
    expect(response.status).not.toBe(500);
    expect(response.body.name).not.toBe('taken');
    expect(response.body.name).toMatch(/^taken-[a-z0-9]{5}$/);
    // The new name is one every team-scoped route reads as a name
    expect(parseTeamReference(response.body.name)).toEqual({ name: response.body.name });
    expect(storage.createTeamWithOwner).toHaveBeenCalledTimes(2);
  });

  it('TC-TEAM-001f: five clashes in a row give a generic 503 that says nothing about names', async () => {
    (storage.createTeamWithOwner as vi.Mock).mockRejectedValue(taken());
    const response = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${creator()}`)
      .send({ displayName: 'Busy name' });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Could not create the team, try again' });
    expect(storage.createTeamWithOwner).toHaveBeenCalledTimes(5);
  });

  it('TC-TEAM-001g: the URL name is made by the server from the display name when none is sent', async () => {
    (storage.createTeamWithOwner as vi.Mock).mockImplementation(async (team: any) => ({
      id: 4,
      ...team,
    }));
    const named = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${creator()}`)
      .send({ displayName: '  Design Guild  ' });
    expect(named.status).toBe(201);
    expect(named.body.displayName).toBe('Design Guild');
    expect(named.body.name).toMatch(/^design-guild-[a-z0-9]{5}$/);
    const korean = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${creator()}`)
      .send({ displayName: '디자인' });
    expect(korean.body.name).toMatch(/^team-[a-z0-9]{5}$/);
    const own = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${creator()}`)
      .send({ name: 'chosen-name', displayName: 'Chosen' });
    expect(own.body.name).toBe('chosen-name');
  });

  it('TC-TEAM-001h: the display name is validated on the server (blank, too long, not text)', async () => {
    for (const displayName of ['', '   ', 'x'.repeat(101), 5, null]) {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${creator()}`)
        .send({ displayName });
      expect(response.status, JSON.stringify(displayName)).toBe(400);
    }
    expect(storage.createTeamWithOwner).not.toHaveBeenCalled();
  });

  it('TC-TEAM-001i: creating teams is rate limited per creator (the 11th in a minute is 429)', async () => {
    mockConfig.rateLimitEnabled = true;
    (storage.createTeamWithOwner as vi.Mock).mockImplementation(async (team: any) => ({
      id: 5,
      ...team,
    }));
    const other = jwt.sign({ id: 99, email: 'other@example.com' }, config.jwtSecret);
    try {
      for (let i = 0; i < 10; i += 1) {
        const ok = await request(app)
          .post('/api/teams')
          .set('Authorization', `Bearer ${creator()}`)
          .send({ displayName: `Team ${i}` });
        expect(ok.status, `request ${i + 1}`).toBe(201);
      }
      const limited = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${creator()}`)
        .send({ displayName: 'One too many' });
      expect(limited.status).toBe(429);
      const fine = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${other}`)
        .send({ displayName: 'Another person' });
      expect(fine.status).toBe(201);
    } finally {
      mockConfig.rateLimitEnabled = false;
    }
  });

  it('TC-TEAM-001j: a requested name that no team route would read as a name is refused with 400', async () => {
    for (const name of ['5', '2024-plans', '10e1', '-5', '0x10', 'Infinity', '20-team']) {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${creator()}`)
        .send({ name, displayName: 'Whatever' });
      expect(response.status, name).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid team data' });
    }
    expect(storage.createTeamWithOwner).not.toHaveBeenCalled();
  });

  it('TC-TEAM-001k: a team named from a digit-leading display name gets a name the team routes read as a name', async () => {
    (storage.createTeamWithOwner as vi.Mock).mockImplementation(async (team: any) => ({
      id: 4,
      ...team,
    }));
    for (const displayName of ['2024 Plans', '1st Floor', '3D Design', '12345']) {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${creator()}`)
        .send({ displayName });
      expect(response.status, displayName).toBe(201);
      expect(parseTeamReference(response.body.name), displayName).toEqual({
        name: response.body.name,
      });
    }
  });

  it('TC-TEAM-001l: a deactivated account cannot create a team, in either auth mode', async () => {
    (storage.getUserAccount as vi.Mock).mockResolvedValue({
      id: 7,
      email: 'creator@example.com',
      isActive: false,
    });
    for (const enforce of [true, false]) {
      mockConfig.enforceAuthForWrites = enforce;
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${creator()}`)
        .send({ displayName: 'Nope' });
      expect(response.status, `enforce=${enforce}`).toBe(403);
      expect(response.body).toEqual({ error: 'Your account does not belong to an organization' });
    }
    mockConfig.enforceAuthForWrites = false;
    expect(storage.createTeamWithOwner).not.toHaveBeenCalled();
  });

  it('TC-TEAM-001m: the created team and the updated team are answered without the password hash', async () => {
    (storage.createTeamWithOwner as vi.Mock).mockImplementation(async (team: any) => ({
      id: 4,
      ...team,
      password: '$2a$10$hash',
    }));
    const created = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${creator()}`)
      .send({ displayName: 'Locked', password: 'secret' });
    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty('password');
    expect(JSON.stringify(created.body)).not.toContain('$2a$');

    (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
    (storage.updateTeam as vi.Mock).mockResolvedValue({
      id: 4,
      name: 'locked',
      displayName: 'Renamed',
      password: '$2a$10$hash',
    });
    const updated = await request(app)
      .put('/api/teams/4')
      .set('Authorization', `Bearer ${creator()}`)
      .send({ displayName: 'Renamed' });
    expect(updated.status).toBe(200);
    expect(updated.body.displayName).toBe('Renamed');
    expect(updated.body).not.toHaveProperty('password');
  });

  for (const enforce of [true, false]) {
    it(`TC-TEAM-001n: refused requests never use up an account's team-creation allowance (ENFORCE_AUTH_WRITES=${enforce})`, async () => {
      mockConfig.enforceAuthForWrites = enforce;
      mockConfig.rateLimitEnabled = true;
      (storage.createTeamWithOwner as vi.Mock).mockImplementation(async (team: any) => ({
        id: 5,
        ...team,
      }));
      // Tokens that name account 7 but were not signed with the server's secret
      const forged = jwt.sign({ id: 31, email: 'quiet@example.com' }, 'not-the-secret');
      const quiet = jwt.sign({ id: 31, email: 'quiet@example.com' }, config.jwtSecret);
      try {
        for (let i = 0; i < 12; i += 1) {
          const refused = await request(app)
            .post('/api/teams')
            .set('Authorization', `Bearer ${forged}`)
            .send({ displayName: `Forged ${i}` });
          expect(refused.status, `forged ${i + 1}`).toBe(401);
        }
        for (let i = 0; i < 12; i += 1) {
          const anonymous = await request(app).post('/api/teams').send({ displayName: 'Anon' });
          expect(anonymous.status).toBe(401);
        }
        const real = await request(app)
          .post('/api/teams')
          .set('Authorization', `Bearer ${quiet}`)
          .send({ displayName: 'The real one' });
        expect(real.status).toBe(201);
      } finally {
        mockConfig.rateLimitEnabled = false;
        mockConfig.enforceAuthForWrites = false;
      }
    });
  }

  it('TC-TEAM-002: should retrieve all teams', async () => {
    const teams = [mockTeam, { ...mockTeam, id: 2, name: 'qa-team' }];
    (storage.getTeams as vi.Mock).mockResolvedValue(teams);

    const response = await request(app).get('/api/teams');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(teams);
  });

  it('TC-TEAM-003: should retrieve a single team by ID', async () => {
    (storage.getTeam as vi.Mock).mockResolvedValue(mockTeam);

    const response = await request(app).get(`/api/teams/${mockTeam.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockTeam);
  });

  it('TC-TEAM-004: should verify team password successfully', async () => {
    (storage.verifyTeamPassword as vi.Mock).mockResolvedValue(true);
    const payload = { teamName: 'core-devs', password: 'password123' };

    const response = await request(app).post('/api/teams/verify').send(payload);

    expect(response.status).toBe(200);
    expect(response.body.isValid).toBe(true);
  });

  it('TC-TEAM-005: should fail to verify incorrect team password', async () => {
    (storage.verifyTeamPassword as vi.Mock).mockResolvedValue(false);
    const payload = { teamName: 'core-devs', password: 'wrongpassword' };

    const response = await request(app).post('/api/teams/verify').send(payload);

    expect(response.status).toBe(200);
    expect(response.body.isValid).toBe(false);
  });

  it('TC-TEAM-006: should update an existing team', async () => {
    const updateData = { description: 'Updated description' };
    const updatedTeam = { ...mockTeam, ...updateData };
    (storage.updateTeam as vi.Mock).mockResolvedValue(updatedTeam);

    (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');

    const response = await request(app)
      .put(`/api/teams/${mockTeam.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send(updateData);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedTeam);
    expect(storage.updateTeam).toHaveBeenCalledWith(mockTeam.id, updateData);
  });

  describe('PUT /api/teams/:id (organization management)', () => {
    afterEach(() => {
      mockConfig.enforceAuthForWrites = false;
    });

    it('TC-TEAM-006b: a body naming organizationId or id reaches updateTeam without them', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('admin');
      (storage.updateTeam as vi.Mock).mockResolvedValue({ ...mockTeam, displayName: 'x' });

      const response = await request(app)
        .put(`/api/teams/${mockTeam.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ organizationId: 2, id: 99, createdAt: '2020-01-01', displayName: 'x' });

      expect(response.status).toBe(200);
      expect(storage.updateTeam).toHaveBeenCalledTimes(1);
      const [teamId, written] = (storage.updateTeam as vi.Mock).mock.calls[0];
      expect(teamId).toBe(mockTeam.id);
      expect(written).toEqual({ displayName: 'x' });
      expect(written).not.toHaveProperty('organizationId');
    });

    it('TC-TEAM-006c: an invalid body is 400 { error } and nothing is written', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');

      const response = await request(app)
        .put(`/api/teams/${mockTeam.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ displayName: 42 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid team data' });
      expect(storage.updateTeam).not.toHaveBeenCalled();
    });

    for (const enforce of [true, false]) {
      it(`TC-TEAM-006d: signed out is 401 with ENFORCE_AUTH_WRITES=${enforce}`, async () => {
        mockConfig.enforceAuthForWrites = enforce;

        const response = await request(app)
          .put(`/api/teams/${mockTeam.id}`)
          .send({ displayName: 'x' });

        expect(response.status).toBe(401);
        expect(storage.updateTeam).not.toHaveBeenCalled();
      });

      it(`TC-TEAM-006e: a signed-in owner updates with ENFORCE_AUTH_WRITES=${enforce}`, async () => {
        mockConfig.enforceAuthForWrites = enforce;
        (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
        (storage.updateTeam as vi.Mock).mockResolvedValue(mockTeam);

        const response = await request(app)
          .put(`/api/teams/${mockTeam.id}`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ displayName: 'x' });

        expect(response.status).toBe(200);
      });
    }

    it('TC-TEAM-006f: a body that parses to nothing is 400 and nothing is written', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
      for (const body of [{}, { organizationId: 2 }, { id: 5, createdAt: '2020-01-01' }]) {
        const response = await request(app)
          .put(`/api/teams/${mockTeam.id}`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send(body);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid team data' });
      }
      expect(storage.updateTeam).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/teams/:id with membersCanEdit (members can edit team pages)', () => {
    const answer = (membersCanEdit: boolean, changed = true) => ({
      ok: true,
      value: {
        team: { ...mockTeam, membersCanEdit, password: '$2a$10$hash' },
        changed,
        memberIds: [7, 8, 9],
      },
    });
    const put = (body: unknown) =>
      request(app)
        .put(`/api/teams/${mockTeam.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send(body as object);
    let notified: number[];
    let stopListening: () => void;
    beforeEach(() => {
      notified = [];
      stopListening = onPageAccessChanged(async (userId) => {
        notified.push(userId);
      });
    });
    afterEach(() => {
      stopListening();
      mockConfig.enforceAuthForWrites = false;
    });

    for (const role of ['owner', 'admin']) {
      it(`a team ${role} turns it on or off through the team lock, answered without the password hash, and every member's open sessions re-check`, async () => {
        (storage.getUserTeamRole as vi.Mock).mockResolvedValue(role);
        (storage.setTeamMembersCanEdit as vi.Mock).mockResolvedValue(answer(true));

        const res = await put({ membersCanEdit: true });

        expect(res.status).toBe(200);
        expect(res.body.membersCanEdit).toBe(true);
        expect(res.body).not.toHaveProperty('password');
        expect(storage.setTeamMembersCanEdit).toHaveBeenCalledWith(mockTeam.id, 7, true);
        expect(storage.updateTeam).not.toHaveBeenCalled();
        expect(notified.sort()).toEqual([7, 8, 9]);
      });
    }

    it('a value that did not change is answered and notifies nobody', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
      (storage.setTeamMembersCanEdit as vi.Mock).mockResolvedValue(answer(false, false));
      const res = await put({ membersCanEdit: false });
      expect(res.status).toBe(200);
      expect(notified).toEqual([]);
    });

    it('a plain member is refused in the existing 403 shape and nothing is written', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('member');
      const res = await put({ membersCanEdit: true });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Admin or owner role required to update team' });
      expect(storage.setTeamMembersCanEdit).not.toHaveBeenCalled();
      expect(notified).toEqual([]);
    });

    it('someone who is not in the team is refused in the existing 403 shape', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue(null);
      const res = await put({ membersCanEdit: true });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'You are not a member of this team' });
      expect(storage.setTeamMembersCanEdit).not.toHaveBeenCalled();
    });

    for (const enforce of [true, false]) {
      it(`signed out is 401 with ENFORCE_AUTH_WRITES=${enforce}`, async () => {
        mockConfig.enforceAuthForWrites = enforce;
        const res = await request(app)
          .put(`/api/teams/${mockTeam.id}`)
          .send({ membersCanEdit: true });
        expect(res.status).toBe(401);
        expect(storage.setTeamMembersCanEdit).not.toHaveBeenCalled();
      });

      it(`a signed-in owner changes it with ENFORCE_AUTH_WRITES=${enforce}`, async () => {
        mockConfig.enforceAuthForWrites = enforce;
        (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
        (storage.setTeamMembersCanEdit as vi.Mock).mockResolvedValue(answer(true));
        expect((await put({ membersCanEdit: true })).status).toBe(200);
      });
    }

    it('a role lost between the check and the lock is refused by the lock’s own answer, with the same shape', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('admin');
      (storage.setTeamMembersCanEdit as vi.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        body: { message: 'Owner or admin role required' },
      });
      const res = await put({ membersCanEdit: true });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Admin or owner role required to update team' });
      expect(notified).toEqual([]);
    });

    it('a busy team is 503 and says nothing else', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
      const { TeamBusyError } = await import('../storage.js');
      (storage.setTeamMembersCanEdit as vi.Mock).mockRejectedValue(new TeamBusyError());
      const res = await put({ membersCanEdit: true });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Team is busy, try again' });
    });

    it('anything but a boolean is 400 and nothing is written', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
      for (const value of ['true', 1, null, 'yes', {}]) {
        const res = await put({ membersCanEdit: value });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid team data' });
      }
      expect(storage.setTeamMembersCanEdit).not.toHaveBeenCalled();
      expect(storage.updateTeam).not.toHaveBeenCalled();
    });

    it('together with other fields: the setting goes through the lock, the other fields through updateTeam, and the answer is the team as it is now', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
      (storage.setTeamMembersCanEdit as vi.Mock).mockResolvedValue(answer(true));
      (storage.updateTeam as vi.Mock).mockResolvedValue({
        ...mockTeam,
        displayName: 'Renamed',
        membersCanEdit: true,
        password: '$2a$10$hash',
      });
      const res = await put({ membersCanEdit: true, displayName: 'Renamed' });
      expect(res.status).toBe(200);
      expect(storage.setTeamMembersCanEdit).toHaveBeenCalledWith(mockTeam.id, 7, true);
      expect(storage.updateTeam).toHaveBeenCalledWith(mockTeam.id, { displayName: 'Renamed' });
      expect(res.body).toMatchObject({ displayName: 'Renamed', membersCanEdit: true });
      expect(res.body).not.toHaveProperty('password');
    });

    it('a body without the setting never reaches the lock method', async () => {
      (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
      (storage.updateTeam as vi.Mock).mockResolvedValue(mockTeam);
      await put({ displayName: 'x' });
      expect(storage.setTeamMembersCanEdit).not.toHaveBeenCalled();
    });

    it('a team is created with the setting on whatever the body says: the route never passes it on', async () => {
      (storage.createTeamWithOwner as vi.Mock).mockImplementation(async (team: any) => ({
        id: 9,
        ...team,
        membersCanEdit: true,
      }));
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ displayName: 'Fresh', membersCanEdit: false });
      expect(res.status).toBe(201);
      const [written] = (storage.createTeamWithOwner as vi.Mock).mock.calls[0];
      expect(written).not.toHaveProperty('membersCanEdit');
      expect(res.body.membersCanEdit).toBe(true);
    });
  });

  describe('DELETE /api/teams/:id (session in every mode)', () => {
    afterEach(() => {
      mockConfig.enforceAuthForWrites = false;
    });

    for (const enforce of [true, false]) {
      it(`signed out is 401 with ENFORCE_AUTH_WRITES=${enforce}`, async () => {
        mockConfig.enforceAuthForWrites = enforce;
        const response = await request(app).delete(`/api/teams/${mockTeam.id}`);
        expect(response.status).toBe(401);
        expect(storage.getUserTeamRole).not.toHaveBeenCalled();
        expect(storage.deleteTeam).not.toHaveBeenCalled();
      });

      it(`a signed-in owner deletes with ENFORCE_AUTH_WRITES=${enforce}`, async () => {
        mockConfig.enforceAuthForWrites = enforce;
        (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
        (storage.deleteTeam as vi.Mock).mockResolvedValue('deleted');
        const response = await request(app)
          .delete(`/api/teams/${mockTeam.id}`)
          .set('Authorization', `Bearer ${memberToken}`);
        expect(response.status).toBe(204);
      });

      it(`a signed-in non-owner is 403 with ENFORCE_AUTH_WRITES=${enforce}`, async () => {
        mockConfig.enforceAuthForWrites = enforce;
        (storage.getUserTeamRole as vi.Mock).mockResolvedValue('admin');
        const response = await request(app)
          .delete(`/api/teams/${mockTeam.id}`)
          .set('Authorization', `Bearer ${memberToken}`);
        expect(response.status).toBe(403);
        expect(storage.deleteTeam).not.toHaveBeenCalled();
      });
    }
  });

  it('TC-TEAM-007: should delete a team', async () => {
    (storage.deleteTeam as vi.Mock).mockResolvedValue('deleted');

    (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
    const response = await request(app)
      .delete(`/api/teams/${mockTeam.id}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(response.status).toBe(204);
  });

  it('TC-TEAM-008: refuses to delete a team that still has pages', async () => {
    (storage.deleteTeam as vi.Mock).mockResolvedValue('has-pages');

    (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
    const response = await request(app)
      .delete(`/api/teams/${mockTeam.id}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/still has pages/);
  });

  it('TC-TEAM-009: reports a missing team as not found', async () => {
    (storage.deleteTeam as vi.Mock).mockResolvedValue('not-found');

    (storage.getUserTeamRole as vi.Mock).mockResolvedValue('owner');
    const response = await request(app)
      .delete(`/api/teams/${mockTeam.id}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(response.status).toBe(404);
  });
});
