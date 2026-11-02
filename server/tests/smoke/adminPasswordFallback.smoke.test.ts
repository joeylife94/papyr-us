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

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Smoke: no shared admin password', () => {
  // Issue #124 X0: the password fallback and its ALLOW_ADMIN_PASSWORD toggle are gone; only a
  // platform admin account passes requireAdmin.
  it('denies /api/admin/directories when only an admin password is provided', async () => {
    const viaQuery = await request(app)
      .get('/api/admin/directories')
      .query({ adminPassword: 'test-admin-password' });
    const viaHeader = await request(app)
      .get('/api/admin/directories')
      .set('x-admin-password', 'test-admin-password');

    expect(viaQuery.status).toBe(403);
    expect(viaHeader.status).toBe(403);
  });
});
