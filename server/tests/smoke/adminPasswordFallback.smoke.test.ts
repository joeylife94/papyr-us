import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import request from 'supertest';
import { registerRoutes } from '../../routes';

// Mock storage
vi.mock('../../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  // Build mock instance from prototype WITHOUT calling constructor (no DATABASE_URL needed)
  const methodNames = Object.getOwnPropertyNames(actual.DBStorage.prototype).filter(
    (key: string) => key !== 'constructor'
  );
  const dbStorageInstance: any = { db: {} };
  for (const key of methodNames) {
    dbStorageInstance[key] = vi.fn();
  }
  return {
    ...actual,
    DBStorage: vi.fn(() => dbStorageInstance),
    storage: dbStorageInstance,
    getStorage: vi.fn(() => dbStorageInstance),
    setStorage: vi.fn(),
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
