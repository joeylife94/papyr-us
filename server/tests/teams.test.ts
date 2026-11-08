import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { config } from '../config';

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
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

    const response = await request(app).put(`/api/teams/${mockTeam.id}`).send(updateData);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedTeam);
  });

  it('TC-TEAM-007: should delete a team', async () => {
    (storage.deleteTeam as vi.Mock).mockResolvedValue('deleted');

    const response = await request(app).delete(`/api/teams/${mockTeam.id}`);

    expect(response.status).toBe(204);
  });

  it('TC-TEAM-008: refuses to delete a team that still has pages', async () => {
    (storage.deleteTeam as vi.Mock).mockResolvedValue('has-pages');

    const response = await request(app).delete(`/api/teams/${mockTeam.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/still has pages/);
  });

  it('TC-TEAM-009: reports a missing team as not found', async () => {
    (storage.deleteTeam as vi.Mock).mockResolvedValue('not-found');

    const response = await request(app).delete(`/api/teams/${mockTeam.id}`);

    expect(response.status).toBe(404);
  });
});
