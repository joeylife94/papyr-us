import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';

// Platform admins are accounts whose email is in ADMIN_EMAILS; there is no shared admin password
// (issue #124 X0).
vi.mock('../config', () => ({
  config: {
    adminEmails: ['admin@example.com'],
    jwtSecret: 'admin-test-secret',
  },
}));

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';

let app: Express;
let server: http.Server;

const ADMIN = { id: 1, email: 'admin@example.com', isActive: true };
const MEMBER = { id: 2, email: 'member@example.com', isActive: true };
const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${jwt.sign(claims, 'admin-test-secret', { expiresIn: '1h' })}`;
const adminToken = () => bearer({ id: ADMIN.id, email: ADMIN.email, role: 'admin' });

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserAccount as vi.Mock).mockImplementation(
    async (id: number) => [ADMIN, MEMBER].find((account) => account.id === id) ?? undefined
  );
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Platform admin access', () => {
  it('confirms an ADMIN_EMAILS account through /api/admin/session', async () => {
    const response = await request(app)
      .get('/api/admin/session')
      .set('Authorization', adminToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ admin: true });
    expect(storage.getUserAccount).toHaveBeenCalledWith(ADMIN.id);
  });

  it('no longer offers the shared-password login', async () => {
    const response = await request(app)
      .post('/api/admin/auth')
      .send({ password: 'test-admin-password' });

    expect(response.status).toBe(404);
  });

  it('refuses a shared admin password in a header, the query, or the body', async () => {
    const viaHeader = await request(app)
      .get('/api/admin/directories')
      .set('x-admin-password', 'test-admin-password');
    const viaQuery = await request(app)
      .get('/api/admin/directories')
      .query({ adminPassword: 'test-admin-password' });
    const viaBody = await request(app)
      .delete('/api/admin/directories/1')
      .send({ adminPassword: 'test-admin-password', password: 'test-admin-password' });

    expect([viaHeader.status, viaQuery.status, viaBody.status]).toEqual([403, 403, 403]);
    expect(storage.getDirectories).not.toHaveBeenCalled();
    expect(storage.deleteDirectory).not.toHaveBeenCalled();
  });

  it('does not trust role or email claims in the token on their own', async () => {
    // The shape the removed password login issued: an admin role and no user id.
    const passwordToken = await request(app)
      .get('/api/admin/session')
      .set('Authorization', bearer({ role: 'admin', via: 'password' }));
    // A member whose token claims the admin role and an admin email.
    const claimedAdmin = await request(app)
      .get('/api/admin/session')
      .set('Authorization', bearer({ id: MEMBER.id, email: ADMIN.email, role: 'admin' }));

    expect(passwordToken.status).toBe(403);
    expect(claimedAdmin.status).toBe(403);
  });

  it('refuses a deactivated admin account and an account that no longer exists', async () => {
    (storage.getUserAccount as vi.Mock).mockResolvedValueOnce({ ...ADMIN, isActive: false });
    const deactivated = await request(app)
      .get('/api/admin/session')
      .set('Authorization', adminToken());

    (storage.getUserAccount as vi.Mock).mockResolvedValueOnce(undefined);
    const deleted = await request(app).get('/api/admin/session').set('Authorization', adminToken());

    expect(deactivated.status).toBe(403);
    expect(deleted.status).toBe(403);
  });

  it('refuses a signed-in member and a visitor without a token', async () => {
    const member = await request(app)
      .get('/api/admin/session')
      .set('Authorization', bearer({ id: MEMBER.id, email: MEMBER.email, role: 'user' }));
    const anonymous = await request(app).get('/api/admin/session');

    expect(member.status).toBe(403);
    expect(anonymous.status).toBe(403);
  });

  it('fails closed when the account lookup fails', async () => {
    (storage.getUserAccount as vi.Mock).mockRejectedValueOnce(new Error('db down'));

    const response = await request(app)
      .get('/api/admin/directories')
      .set('Authorization', adminToken());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Admin check failed' });
    expect(storage.getDirectories).not.toHaveBeenCalled();
  });
});

describe('Admin directory management', () => {
  const mockDirectory = { id: 1, name: 'protected-docs', displayName: 'Protected Documents' };

  it('TC-ADM-002: creates a directory as a platform admin', async () => {
    const newDirData = { name: 'new-dir', displayName: 'New Directory' };
    (storage.createDirectory as vi.Mock).mockResolvedValue({ ...newDirData, id: 2 });

    const response = await request(app)
      .post('/api/admin/directories')
      .set('Authorization', adminToken())
      .send(newDirData);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id', 2);
  });

  it('TC-ADM-003: lists directories as a platform admin', async () => {
    (storage.getDirectories as vi.Mock).mockResolvedValue([mockDirectory]);

    const response = await request(app)
      .get('/api/admin/directories')
      .set('Authorization', adminToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([mockDirectory]);
  });

  it('TC-ADM-004: updates a directory, ignoring a stray adminPassword field', async () => {
    (storage.updateDirectory as vi.Mock).mockResolvedValue({ ...mockDirectory, displayName: 'X' });

    const response = await request(app)
      .patch(`/api/admin/directories/${mockDirectory.id}`)
      .set('Authorization', adminToken())
      .send({ displayName: 'X', adminPassword: 'old-client' });

    expect(response.status).toBe(200);
    expect(storage.updateDirectory).toHaveBeenCalledWith(mockDirectory.id, { displayName: 'X' });
  });

  it('TC-ADM-005: deletes a directory as a platform admin', async () => {
    (storage.deleteDirectory as vi.Mock).mockResolvedValue(true);

    const response = await request(app)
      .delete(`/api/admin/directories/${mockDirectory.id}`)
      .set('Authorization', adminToken());

    expect(response.status).toBe(204);
  });

  it('TC-ADM-006: verifies a password-protected directory', async () => {
    (storage.verifyDirectoryPassword as vi.Mock).mockResolvedValue(true);
    const payload = { directoryName: 'protected-docs', password: 'dir-password' };

    const response = await request(app).post('/api/directory/verify').send(payload);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
