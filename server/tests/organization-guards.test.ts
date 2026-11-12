/**
 * Organization guards and GET /api/organization (issue #124 X1c, base package).
 *
 * The organization and organization role of a request are read from the database for the
 * signed-in account, never from the token or the body. The new modules are not part of
 * registerRoutes, so the tests build a small express app: express.json(), cookieParser(),
 * app.locals.storage, then the module under test. Storage is mocked.
 *
 * Rules under test:
 * - GET /api/organization: 401 signed out, 403 without membership, 200 with the stored role
 *   (a token claiming another role or organization changes nothing);
 * - requireOrganizationRole: a role outside the list is 403, a listed one passes, a failing
 *   lookup is 500 and never passes;
 * - requireOrganizationAi: signed out is 401 with ENFORCE_AUTH_WRITES on and off, a signed-in
 *   caller is read in both modes, a disabled organization is 403 `ai_disabled`, a failing
 *   lookup is 500 and never passes;
 * - organizationAiEnabledFor is false without user, without organization and on error.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'org-guards-test-secret';
const configMock = vi.hoisted(() => ({
  config: {
    jwtSecret: 'org-guards-test-secret',
    adminEmails: [] as string[],
    enforceAuthForWrites: true,
    rateLimitEnabled: false,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 1000,
    adminIpWhitelist: [],
    port: 5001,
    host: '0.0.0.0',
    isProduction: false,
    isReplit: false,
  },
}));
vi.mock('../config', () => configMock);

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
import { authMiddleware } from '../middleware.js';
import {
  requireOrganizationRole,
  requireOrganizationAi,
  organizationAiEnabledFor,
} from '../organization-guards.js';
import { registerOrganizationRoutes } from '../organization-routes.js';

const storage: any = (storageModule as any).storage;

function token(payload: Record<string, unknown> = { id: 7, email: 'u@example.com' }) {
  return jwt.sign(payload, TEST_JWT_SECRET);
}
const bearer = (payload?: Record<string, unknown>) => `Bearer ${token(payload)}`;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.locals.storage = storage;
  registerOrganizationRoutes(app, storage);
  app.get('/t/role', authMiddleware, requireOrganizationRole(['owner', 'admin']), (req: any, res) =>
    res.json({ ok: true, organization: req.organization })
  );
  app.post('/t/ai', requireOrganizationAi, (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
  configMock.config.enforceAuthForWrites = true;
});

describe('GET /api/organization', () => {
  it('answers 401 when signed out', async () => {
    const res = await request(buildApp()).get('/api/organization');
    expect(res.status).toBe(401);
    expect(storage.getOrganizationMembership).not.toHaveBeenCalled();
  });

  it('answers 403 for an account without an organization', async () => {
    storage.getOrganizationMembership.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/organization').set('Authorization', bearer());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Your account does not belong to an organization');
    expect(storage.getOrganization).not.toHaveBeenCalled();
  });

  it('answers 200 with the organization and the stored role', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'member' });
    storage.getOrganization.mockResolvedValue({
      id: 3,
      slug: 'acme',
      name: 'Acme',
      isActive: true,
      aiEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await request(buildApp()).get('/api/organization').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 3,
      slug: 'acme',
      name: 'Acme',
      role: 'member',
      aiEnabled: false,
    });
    expect(storage.getOrganizationMembership).toHaveBeenCalledWith(7);
    expect(storage.getOrganization).toHaveBeenCalledWith(3);
  });

  it('takes role and organization from storage, not from the token', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'member' });
    storage.getOrganization.mockResolvedValue({
      id: 3,
      slug: 'acme',
      name: 'Acme',
      aiEnabled: true,
    });
    const res = await request(buildApp())
      .get('/api/organization')
      .set(
        'Authorization',
        bearer({ id: 7, email: 'u@example.com', role: 'owner', organizationId: 99 })
      );
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('member');
    expect(res.body.id).toBe(3);
    expect(storage.getOrganization).toHaveBeenCalledWith(3);
  });

  it('answers 403 when the organization row is missing', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'owner' });
    storage.getOrganization.mockResolvedValue(undefined);
    const res = await request(buildApp()).get('/api/organization').set('Authorization', bearer());
    expect(res.status).toBe(403);
  });

  it('answers 500 and no data when the lookup fails', async () => {
    storage.getOrganizationMembership.mockRejectedValue(new Error('db down secret'));
    const res = await request(buildApp()).get('/api/organization').set('Authorization', bearer());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('refuses a token without a user id', async () => {
    const res = await request(buildApp())
      .get('/api/organization')
      .set('Authorization', bearer({ email: 'u@example.com' }));
    expect(res.status).toBe(401);
  });
});

describe('requireOrganizationRole', () => {
  it('refuses a member where owner or admin is required', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'member' });
    const res = await request(buildApp()).get('/t/role').set('Authorization', bearer());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Organization owner or admin role required');
  });

  it('lets an admin through and sets req.organization', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'admin' });
    const res = await request(buildApp()).get('/t/role').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.organization).toEqual({ id: 3, role: 'admin' });
  });

  it('refuses an account without membership', async () => {
    storage.getOrganizationMembership.mockResolvedValue(null);
    const res = await request(buildApp()).get('/t/role').set('Authorization', bearer());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Your account does not belong to an organization');
  });

  it('answers 500 and never calls next when storage throws', async () => {
    storage.getOrganizationMembership.mockRejectedValue(new Error('boom'));
    const res = await request(buildApp()).get('/t/role').set('Authorization', bearer());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Organization check failed' });
  });
});

describe.each([true, false])('requireOrganizationAi with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    configMock.config.enforceAuthForWrites = enforce;
  });

  it('answers 401 when signed out', async () => {
    const res = await request(buildApp()).post('/t/ai');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
    expect(storage.getOrganizationMembership).not.toHaveBeenCalled();
  });

  it('answers 401 for an invalid token', async () => {
    const res = await request(buildApp()).post('/t/ai').set('Authorization', 'Bearer nonsense');
    expect(res.status).toBe(401);
  });

  it('reads a signed-in caller from a bearer token and from the cookie', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'member' });
    storage.isOrganizationAiEnabled.mockResolvedValue(true);
    const viaBearer = await request(buildApp()).post('/t/ai').set('Authorization', bearer());
    expect(viaBearer.status).toBe(200);
    const viaCookie = await request(buildApp())
      .post('/t/ai')
      .set('Cookie', `accessToken=${token()}`);
    expect(viaCookie.status).toBe(200);
    expect(storage.isOrganizationAiEnabled).toHaveBeenCalledWith(3);
  });

  it('answers 403 ai_disabled when the organization has AI off', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'owner' });
    storage.isOrganizationAiEnabled.mockResolvedValue(false);
    const res = await request(buildApp()).post('/t/ai').set('Authorization', bearer());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      code: 'ai_disabled',
      message: 'AI features are turned off for your organization',
    });
  });

  it('answers 403 for an account without an organization', async () => {
    storage.getOrganizationMembership.mockResolvedValue(null);
    const res = await request(buildApp()).post('/t/ai').set('Authorization', bearer());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Your account does not belong to an organization');
    expect(storage.isOrganizationAiEnabled).not.toHaveBeenCalled();
  });

  it('ignores a role or organization claimed in the token or the body', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'member' });
    storage.isOrganizationAiEnabled.mockResolvedValue(false);
    const res = await request(buildApp())
      .post('/t/ai')
      .set('Authorization', bearer({ id: 7, role: 'owner', organizationId: 99 }))
      .send({ organizationId: 99 });
    expect(res.status).toBe(403);
    expect(storage.isOrganizationAiEnabled).toHaveBeenCalledWith(3);
  });

  it('answers 500 and never calls next when storage throws', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'member' });
    storage.isOrganizationAiEnabled.mockRejectedValue(new Error('boom'));
    const res = await request(buildApp()).post('/t/ai').set('Authorization', bearer());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Organization check failed' });
  });
});

describe('organizationAiEnabledFor', () => {
  it('is false without a user, without an organization and on error', async () => {
    expect(await organizationAiEnabledFor(storage, undefined)).toBe(false);
    storage.getOrganizationMembership.mockResolvedValue(null);
    expect(await organizationAiEnabledFor(storage, 7)).toBe(false);
    storage.getOrganizationMembership.mockRejectedValue(new Error('boom'));
    expect(await organizationAiEnabledFor(storage, 7)).toBe(false);
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'member' });
    storage.isOrganizationAiEnabled.mockRejectedValue(new Error('boom'));
    expect(await organizationAiEnabledFor(storage, 7)).toBe(false);
  });

  it('is true only when the setting is on', async () => {
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: 3, role: 'member' });
    storage.isOrganizationAiEnabled.mockResolvedValue(true);
    expect(await organizationAiEnabledFor(storage, 7)).toBe(true);
    storage.isOrganizationAiEnabled.mockResolvedValue(false);
    expect(await organizationAiEnabledFor(storage, 7)).toBe(false);
  });
});
