import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import request from 'supertest';
import { registerRoutes } from '../../routes';

// Mock storage
vi.mock('../../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const dbStorageInstance = new actual.DBStorage();
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

import * as storageModule from '../../storage.js';
const storage: any = (storageModule as any).storage;

let app: Express;
let server: http.Server;
const OLD_ENV = { ...process.env };

beforeAll(async () => {
  process.env.ALLOW_ADMIN_PASSWORD = 'false';
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  process.env = { ...OLD_ENV };
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Smoke: admin password fallback toggle', () => {
  it('denies /api/admin/directories when only adminPassword is provided and toggle is false', async () => {
    const res = await request(app)
      .get('/api/admin/directories')
      .query({ adminPassword: 'test-admin-password' });
    expect(res.status).toBe(403);
  });
});
