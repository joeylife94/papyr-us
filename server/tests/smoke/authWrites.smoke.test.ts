import { beforeAll, afterAll, describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../../routes';

// Mock bcryptjs so the login endpoint works without a real hashed password
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
  compare: vi.fn(),
  hash: vi.fn(),
}));

// Mock storage — build instance from prototype WITHOUT calling constructor (no DATABASE_URL needed).
// Include a chainable db mock so the login route (which queries storage.db directly) works.
vi.mock('../../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const methodNames = Object.getOwnPropertyNames(actual.DBStorage.prototype).filter(
    (key: string) => key !== 'constructor'
  );
  const dbStorageInstance: any = {
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    },
  };
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
import bcrypt from 'bcryptjs';

let app: Express;
let server: http.Server;
const storage: any = (storageModule as any).storage;

const OLD_ENV = { ...process.env };
const TEST_JWT_SECRET = 'authwrites-smoke-test-secret-fixed';

const MOCK_USER = {
  id: 1,
  name: 'Smoke Tester',
  email: 'smoke@test.com',
  hashedPassword: 'hashed_password',
  provider: null,
  providerId: null,
};

beforeAll(async () => {
  process.env.ENFORCE_AUTH_WRITES = 'true';
  // Pin JWT_SECRET so login and verify both use the same value
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply chainable db mock after clearAllMocks wipes all implementations
  (storage.db.select as ReturnType<typeof vi.fn>).mockReturnThis();
  (storage.db.from as ReturnType<typeof vi.fn>).mockReturnThis();
  (storage.db.where as ReturnType<typeof vi.fn>).mockResolvedValue([]);
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

  it('allows write authenticated via cookie from login response', async () => {
    // --- Step 1: Mock the login DB query to return our test user ---
    (storage.db.where as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_USER]);
    // bcrypt.compare mock: password always matches
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    // --- Step 2: POST to /api/auth/login and extract the Set-Cookie header ---
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: MOCK_USER.email, password: 'any-password' });

    expect(loginRes.status).toBe(200);

    const setCookieHeader = loginRes.headers['set-cookie'] as string[] | undefined;
    expect(setCookieHeader).toBeDefined();

    const accessTokenCookieLine = setCookieHeader!.find((c) => c.startsWith('accessToken='));
    expect(accessTokenCookieLine).toBeDefined();

    // Extract "accessToken=<value>" (trim off Path/HttpOnly/etc.)
    const cookieHeader = accessTokenCookieLine!.split(';')[0];

    // --- Step 3: Use the extracted cookie for the protected write request ---
    (storage.createWikiPage as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, title: 'T' });

    const payload = {
      title: 'T',
      slug: 't',
      content: 'c',
      folder: 'docs',
      tags: [],
      author: 'tester',
    };

    const res = await request(app).post('/api/pages').set('Cookie', cookieHeader).send(payload);

    expect(res.status).toBe(201);
  });
});
