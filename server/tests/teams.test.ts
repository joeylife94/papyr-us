import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const dbStorageInstance = new actual.DBStorage();

  // Replace all methods with vi.fn() to allow for mocking in tests
  for (const key of Object.getOwnPropertyNames(actual.DBStorage.prototype)) {
    if (key !== 'constructor' && typeof dbStorageInstance[key] === 'function') {
      dbStorageInstance[key] = vi.fn();
    }
  }

  return {
    ...actual,
    DBStorage: vi.fn(() => dbStorageInstance),
    storage: dbStorageInstance,
  };
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

  it('TC-TEAM-001: should create a new team successfully', async () => {
    const newTeamData = { name: 'new-team', displayName: 'New Team' };
    (storage.createTeam as vi.Mock).mockResolvedValue({ ...newTeamData, id: 2 });

    const response = await request(app).post('/api/teams').send(newTeamData);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id', 2);
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
    (storage.deleteTeam as vi.Mock).mockResolvedValue({ success: true });

    const response = await request(app).delete(`/api/teams/${mockTeam.id}`);

    expect(response.status).toBe(204);
  });
});
