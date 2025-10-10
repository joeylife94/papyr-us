import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

// Mock config with jwtSecret and adminEmails
vi.mock('../config', () => ({
  config: {
    jwtSecret: 'test-secret',
    adminPassword: 'test-admin-password',
    adminEmails: ['admin@example.com'],
  },
}));

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const dbStorageInstance = new actual.DBStorage();

  // Replace all methods with vi.fn()
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

import * as storageModule from '../storage.js';

let app: Express;
let server: http.Server;
const storage: any = (storageModule as any).storage;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('RBAC via JWT', () => {
  it('allows access to /api/admin/directories with admin JWT', async () => {
    (storage.getDirectories as any).mockResolvedValue([{ id: 1, name: 'alpha' }]);

    const token = jwt.sign({ id: 1, email: 'admin@example.com', role: 'admin' }, 'test-secret', {
      expiresIn: '1h',
    });

    const res = await request(app)
      .get('/api/admin/directories')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: 'alpha' }]);
  });

  it('forbids access without admin (no token and no password)', async () => {
    const res = await request(app).get('/api/admin/directories');
    expect(res.status).toBe(403);
  });
});
