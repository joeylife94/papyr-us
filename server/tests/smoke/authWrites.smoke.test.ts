import { beforeAll, afterAll, describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../../routes';

// Mock storage similar to other tests
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

const OLD_ENV = { ...process.env };

beforeAll(async () => {
  process.env.ENFORCE_AUTH_WRITES = 'true';
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  process.env = { ...OLD_ENV };
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Smoke: ENFORCE_AUTH_WRITES', () => {
  it('returns 401 for write without token', async () => {
    const payload = {
      title: 'T',
      slug: 't',
      content: 'c',
      folder: 'docs',
      tags: [],
      author: 'tester',
    };

    const res = await request(app).post('/api/pages').send(payload);
    expect(res.status).toBe(401);
  });

  it('allows write with valid JWT', async () => {
    (storage.createWikiPage as any).mockResolvedValue({ id: 1, title: 'T' });
    const token = jwt.sign({ id: 1, email: 'u@test.com' }, 'your-default-secret', {
      expiresIn: '1h',
    });

    const payload = {
      title: 'T',
      slug: 't',
      content: 'c',
      folder: 'docs',
      tags: [],
      author: 'tester',
    };

    const res = await request(app)
      .post('/api/pages')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
  });
});
