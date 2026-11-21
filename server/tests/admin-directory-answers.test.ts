/**
 * Admin directory answers never carry a directory's stored password.
 *
 * Rules under test, as a platform admin, with a mocked storage that returns the stored row (hash
 * included):
 * - GET /api/admin/directories, POST /api/admin/directories and PATCH /api/admin/directories/:id
 *   answer each directory with `hasPassword: boolean` and no `password` field, and the hash text
 *   appears nowhere in the answer;
 * - what a request sends for the password reaches storage unchanged: a typed password, an explicit
 *   `null` (remove) and no field at all (keep).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

vi.mock('../config', () => ({
  config: {
    adminEmails: ['admin@example.com'],
    jwtSecret: 'admin-directory-answers-secret',
  },
}));
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';
const s: any = storage;

const HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123';
const admin = {
  Authorization: `Bearer ${jwt.sign({ id: 1, email: 'admin@example.com' }, 'admin-directory-answers-secret')}`,
};
const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'locked',
  displayName: 'Locked',
  password: HASH,
  isVisible: true,
  order: 0,
  ...over,
});

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
beforeEach(() => {
  vi.clearAllMocks();
  s.getUserAccount.mockResolvedValue({ id: 1, email: 'admin@example.com', isActive: true });
});

describe('admin directory answers', () => {
  it('GET lists directories with hasPassword and without the stored password', async () => {
    s.getDirectories.mockResolvedValue([row(), row({ id: 2, name: 'open', password: null })]);
    const res = await request(app).get('/api/admin/directories').set(admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ id: 1, hasPassword: true }),
      expect.objectContaining({ id: 2, hasPassword: false }),
    ]);
    for (const directory of res.body) expect(directory).not.toHaveProperty('password');
    expect(res.text).not.toContain(HASH);
  });

  it('POST answers the created directory without its password', async () => {
    s.createDirectory.mockResolvedValue(row());
    const res = await request(app)
      .post('/api/admin/directories')
      .set(admin)
      .send({ name: 'locked', displayName: 'Locked', password: 'typed-secret' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, hasPassword: true });
    expect(res.body).not.toHaveProperty('password');
    expect(res.text).not.toContain(HASH);
    expect(s.createDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'typed-secret' })
    );
  });

  it('PATCH answers the updated directory without its password', async () => {
    s.updateDirectory.mockResolvedValue(row({ displayName: 'Renamed' }));
    const res = await request(app)
      .patch('/api/admin/directories/1')
      .set(admin)
      .send({ displayName: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, displayName: 'Renamed', hasPassword: true });
    expect(res.body).not.toHaveProperty('password');
    expect(res.text).not.toContain(HASH);
  });

  it('PATCH keeps the password when none is sent, and removes it on an explicit null', async () => {
    s.updateDirectory.mockResolvedValue(row({ password: null }));
    await request(app).patch('/api/admin/directories/1').set(admin).send({ displayName: 'Same' });
    expect(s.updateDirectory.mock.calls[0][1]).toEqual({ displayName: 'Same' });
    expect(s.updateDirectory.mock.calls[0][1]).not.toHaveProperty('password');

    const removed = await request(app)
      .patch('/api/admin/directories/1')
      .set(admin)
      .send({ password: null });
    expect(s.updateDirectory.mock.calls[1][1]).toEqual({ password: null });
    expect(removed.body).toMatchObject({ hasPassword: false });
    expect(removed.body).not.toHaveProperty('password');
  });
});
