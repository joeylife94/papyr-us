import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import http from 'http';
import { registerRoutes } from '../routes';
import { vi } from 'vitest';

// Mock storage minimally for route registration
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const dbStorageInstance = new actual.DBStorage();
  return { ...actual, DBStorage: vi.fn(() => dbStorageInstance), storage: dbStorageInstance };
});

// Create a storage instance via the mocked constructor
import { DBStorage } from '../storage.js';
const storage = new DBStorage() as any;

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

describe('Health endpoint', () => {
  it('GET /health returns ok with version and uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });
});
