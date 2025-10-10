import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

// Mock the config to have a predictable admin password and allow password fallback in this suite
vi.mock('../config', () => ({
  config: {
    adminPassword: 'test-admin-password',
    allowAdminPassword: true,
    adminEmails: [],
    jwtSecret: 'your-default-secret',
  },
}));

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

describe('Admin & Directory Management API', () => {
  const adminPassword = 'test-admin-password';
  const mockDirectory = {
    id: 1,
    name: 'protected-docs',
    displayName: 'Protected Documents',
  };

  it('TC-ADM-001: should authenticate as admin successfully', async () => {
    const response = await request(app).post('/api/admin/auth').send({ password: adminPassword });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('TC-ADM-001: should fail admin authentication with wrong password', async () => {
    const response = await request(app)
      .post('/api/admin/auth')
      .send({ password: 'wrong-password' });

    expect(response.status).toBe(401);
  });

  it('TC-ADM-002: should create a new directory as admin', async () => {
    const newDirData = { name: 'new-dir', displayName: 'New Directory' };
    (storage.createDirectory as vi.Mock).mockResolvedValue({ ...newDirData, id: 2 });

    const response = await request(app)
      .post('/api/admin/directories')
      .send({ ...newDirData, adminPassword });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id', 2);
  });

  it('TC-ADM-003: should get all directories as admin', async () => {
    (storage.getDirectories as vi.Mock).mockResolvedValue([mockDirectory]);

    const response = await request(app).get('/api/admin/directories').query({ adminPassword });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([mockDirectory]);
  });

  it('TC-ADM-005: should delete a directory as admin', async () => {
    (storage.deleteDirectory as vi.Mock).mockResolvedValue(true);

    const response = await request(app)
      .delete(`/api/admin/directories/${mockDirectory.id}`)
      .send({ adminPassword });

    expect(response.status).toBe(204);
  });

  it('TC-ADM-006: should verify a password-protected directory', async () => {
    (storage.verifyDirectoryPassword as vi.Mock).mockResolvedValue(true);
    const payload = { directoryName: 'protected-docs', password: 'dir-password' };

    const response = await request(app).post('/api/directory/verify').send(payload);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
