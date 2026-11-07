import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import http from 'http';
import { registerRoutes } from '../routes';
import { vi } from 'vitest';

// Mock storage minimally for route registration
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

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Route bundle health endpoints', () => {
  // Issue #124 X0: /health and /ready exist once, in operational.ts (see operational.test.ts).
  it('leaves /health and /ready to the operational routes', async () => {
    expect((await request(app).get('/health')).status).toBe(404);
    expect((await request(app).get('/ready')).status).toBe(404);
  });
});
