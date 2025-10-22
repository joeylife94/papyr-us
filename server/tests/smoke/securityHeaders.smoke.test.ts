import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import request from 'supertest';
import { registerRoutes } from '../../routes';

// Mock storage minimal
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

let app: Express;
let server: http.Server;
const storage: any = (storageModule as any).storage;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const { setupSecurity } = await import('../../middleware.js');
  setupSecurity(app);
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Smoke: security headers', () => {
  it('adds basic security headers on a simple GET', async () => {
    // Use /api/health or root endpoint that doesn't require params
    const res = await request(app).get('/api/health');

    // If /api/health doesn't exist, try root
    if (res.status === 404) {
      const rootRes = await request(app).get('/');
      expect(rootRes.headers['x-dns-prefetch-control']).toBeDefined();
      expect(rootRes.headers['x-content-type-options']).toBeDefined();
      expect(rootRes.headers['x-frame-options']).toBeDefined();
    } else {
      expect(res.status).toBe(200);
      expect(res.headers['x-dns-prefetch-control']).toBeDefined();
      expect(res.headers['x-content-type-options']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
    }
  });
});
