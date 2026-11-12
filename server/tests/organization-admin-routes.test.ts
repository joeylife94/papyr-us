/**
 * Platform admin organization routes (issue #124 X1c P1), storage mocked.
 *
 * The module is not part of registerRoutes, so the tests build a small express app and call
 * registerOrganizationAdminRoutes. Platform admin status comes from the mocked getUserAccount and
 * ADMIN_EMAILS, never from the token.
 *
 * Rules under test, for GET /api/admin/organizations, POST /api/admin/organizations and
 * POST /api/admin/organizations/:id/owners:
 * - signed out, not a platform admin or inactive: 403 and nothing reaches storage; a failing
 *   admin check is 500;
 * - bodies are strict: unknown keys (an organization id included) and bad values are 400;
 * - creating: unknown email 404, account with data elsewhere 409 with reasons, taken slug 409,
 *   busy organization 503, success 201 and the owner's open sessions are re-checked once;
 * - owners: unknown organization 404, account not in that organization 404, organization that
 *   has an owner 409, success 200.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

const configMock = vi.hoisted(() => ({
  config: {
    jwtSecret: 'org-admin-test-secret',
    adminEmails: ['admin@example.com'] as string[],
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

vi.mock('../services/page-access-events.js', () => ({
  notifyPageAccessChanged: vi.fn(async () => undefined),
  onPageAccessChanged: vi.fn(() => () => undefined),
}));

import * as storageModule from '../storage.js';
import { OrganizationBusyError } from '../storage.js';
import { notifyPageAccessChanged } from '../services/page-access-events.js';
import { registerOrganizationAdminRoutes } from '../organization-admin-routes.js';

const storage: any = (storageModule as any).storage;

const ADMIN = { id: 1, email: 'admin@example.com', isActive: true };
const MEMBER = { id: 2, email: 'member@example.com', isActive: true };
const INACTIVE_ADMIN = { id: 3, email: 'admin@example.com', isActive: false };

const bearer = (id: number, email: string, extra: Record<string, unknown> = {}) =>
  `Bearer ${jwt.sign({ id, email, ...extra }, 'org-admin-test-secret')}`;
const asAdmin = () => bearer(ADMIN.id, ADMIN.email);
const asMember = () => bearer(MEMBER.id, MEMBER.email, { role: 'admin' });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.locals.storage = storage;
  registerOrganizationAdminRoutes(app, storage);
  return app;
}

const VALID = { name: 'Acme', slug: 'acme', ownerEmail: 'owner@example.com' };
const ROUTES: Array<[string, 'get' | 'post', string, object | undefined]> = [
  ['list', 'get', '/api/admin/organizations', undefined],
  ['create', 'post', '/api/admin/organizations', VALID],
  ['owners', 'post', '/api/admin/organizations/4/owners', { email: 'm@example.com' }],
];

beforeEach(() => {
  vi.resetAllMocks();
  configMock.config.enforceAuthForWrites = true;
  configMock.config.adminEmails = ['admin@example.com'];
  storage.getUserAccount.mockImplementation(
    async (id: number) => [ADMIN, MEMBER, INACTIVE_ADMIN].find((a) => a.id === id) ?? undefined
  );
});

describe.each([true, false])('platform admin guard (ENFORCE_AUTH_WRITES=%s)', (enforce) => {
  beforeEach(() => {
    configMock.config.enforceAuthForWrites = enforce;
  });

  it.each(ROUTES)('%s: signed out is 403', async (_name, method, path, body) => {
    const req = request(buildApp())[method](path);
    const res = await (body ? req.send(body) : req);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Forbidden: admin required' });
  });

  it.each(ROUTES)('%s: a non-admin is 403 whatever its token claims', async (_name, m, p, b) => {
    const req = request(buildApp())[m](p).set('Authorization', asMember());
    const res = await (b ? req.send(b) : req);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Forbidden: admin required' });
  });

  it.each(ROUTES)('%s: an inactive admin account is 403', async (_name, m, p, b) => {
    const req = request(buildApp())[m](p).set('Authorization', bearer(3, 'admin@example.com'));
    const res = await (b ? req.send(b) : req);
    expect(res.status).toBe(403);
  });

  it.each(ROUTES)('%s: a failing admin check is 500', async (_name, m, p, b) => {
    storage.getUserAccount.mockRejectedValue(new Error('db down'));
    const req = request(buildApp())[m](p).set('Authorization', asAdmin());
    const res = await (b ? req.send(b) : req);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Admin check failed' });
  });

  it('a denied caller reaches no storage method of the feature', async () => {
    await request(buildApp()).post('/api/admin/organizations').send(VALID);
    await request(buildApp())
      .post('/api/admin/organizations')
      .set('Authorization', asMember())
      .send(VALID);
    expect(storage.createOrganizationWithOwner).not.toHaveBeenCalled();
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('an admin passes', async () => {
    storage.listOrganizationsForAdmin.mockResolvedValue([]);
    const res = await request(buildApp())
      .get('/api/admin/organizations')
      .set('Authorization', asAdmin());
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/organizations', () => {
  it('returns the rows from storage in the documented shape', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    storage.listOrganizationsForAdmin.mockResolvedValue([
      {
        id: 1,
        slug: 'default',
        name: 'Default',
        isActive: true,
        aiEnabled: true,
        memberCount: 5,
        ownerCount: 0,
        createdAt,
      },
    ]);
    const res = await request(buildApp())
      .get('/api/admin/organizations')
      .set('Authorization', asAdmin());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 1,
        slug: 'default',
        name: 'Default',
        isActive: true,
        aiEnabled: true,
        memberCount: 5,
        ownerCount: 0,
        createdAt: createdAt.toISOString(),
      },
    ]);
  });

  it('answers 500 without internals when storage fails', async () => {
    storage.listOrganizationsForAdmin.mockRejectedValue(new Error('select * from secret'));
    const res = await request(buildApp())
      .get('/api/admin/organizations')
      .set('Authorization', asAdmin());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});

describe('POST /api/admin/organizations', () => {
  const post = (body: unknown) =>
    request(buildApp()).post('/api/admin/organizations').set('Authorization', asAdmin()).send(body);

  it.each([
    ['empty name', { ...VALID, name: '   ' }],
    ['name over 100 characters', { ...VALID, name: 'x'.repeat(101) }],
    ['uppercase slug', { ...VALID, slug: 'Acme' }],
    ['slug starting with a hyphen', { ...VALID, slug: '-acme' }],
    ['slug ending with a hyphen', { ...VALID, slug: 'acme-' }],
    ['slug over 40 characters', { ...VALID, slug: 'a'.repeat(41) }],
    ['slug with a slash', { ...VALID, slug: 'a/b' }],
    ['empty owner email', { ...VALID, ownerEmail: '  ' }],
    ['missing owner email', { name: 'Acme', slug: 'acme' }],
    ['an organization id in the body', { ...VALID, organizationId: 1 }],
    ['an id in the body', { ...VALID, id: 9 }],
    ['an ai flag in the body', { ...VALID, aiEnabled: true }],
    ['non-string name', { ...VALID, name: 5 }],
  ])('400 for %s', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid organization data');
    expect(storage.createOrganizationWithOwner).not.toHaveBeenCalled();
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('accepts a 40-character slug and a single-character slug', async () => {
    storage.createOrganizationWithOwner.mockResolvedValue({ kind: 'user_not_found' });
    expect((await post({ ...VALID, slug: 'a'.repeat(40) })).status).toBe(404);
    expect((await post({ ...VALID, slug: 'a' })).status).toBe(404);
  });

  it('passes trimmed values to storage', async () => {
    storage.createOrganizationWithOwner.mockResolvedValue({ kind: 'user_not_found' });
    await post({ name: '  Acme  ', slug: 'acme', ownerEmail: '  owner@example.com ' });
    expect(storage.createOrganizationWithOwner).toHaveBeenCalledWith({
      name: 'Acme',
      slug: 'acme',
      ownerEmail: 'owner@example.com',
    });
  });

  it('404 for an email no account has', async () => {
    storage.createOrganizationWithOwner.mockResolvedValue({ kind: 'user_not_found' });
    const res = await post(VALID);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Registered user not found' });
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('409 account_not_eligible with the reasons', async () => {
    storage.createOrganizationWithOwner.mockResolvedValue({
      kind: 'not_eligible',
      reasons: ['team_memberships', 'comments'],
    });
    const res = await post(VALID);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'account_not_eligible',
      message: 'This account already has data or a role in another organization',
      reasons: ['team_memberships', 'comments'],
    });
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('409 slug_taken when storage throws a unique violation on the slug', async () => {
    storage.createOrganizationWithOwner.mockRejectedValue(
      Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'organizations_slug_unique',
      })
    );
    const res = await post(VALID);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'slug_taken',
      message: 'Organization slug is already in use',
    });
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('a unique violation on another constraint is a 500, not slug_taken', async () => {
    storage.createOrganizationWithOwner.mockRejectedValue(
      Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'organization_members_user_id_unique',
      })
    );
    const res = await post(VALID);
    expect(res.status).toBe(500);
  });

  it('503 when the source organization is busy', async () => {
    storage.createOrganizationWithOwner.mockRejectedValue(new OrganizationBusyError());
    const res = await post(VALID);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: 'Organization is busy, try again' });
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('500 without internals for any other failure', async () => {
    storage.createOrganizationWithOwner.mockRejectedValue(new Error('insert into secret'));
    const res = await post(VALID);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('201 with the organization and the owner, and re-checks the owner sessions once', async () => {
    const createdAt = new Date('2026-02-03T04:05:06.000Z');
    storage.createOrganizationWithOwner.mockResolvedValue({
      kind: 'created',
      organization: {
        id: 8,
        slug: 'acme',
        name: 'Acme',
        isActive: true,
        aiEnabled: false,
        createdAt,
        updatedAt: createdAt,
      },
      owner: { userId: 42, email: 'Owner@Example.com' },
    });
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      organization: {
        id: 8,
        slug: 'acme',
        name: 'Acme',
        isActive: true,
        aiEnabled: false,
        createdAt: createdAt.toISOString(),
      },
      owner: { userId: 42, email: 'Owner@Example.com', role: 'owner' },
    });
    expect(notifyPageAccessChanged).toHaveBeenCalledTimes(1);
    expect(notifyPageAccessChanged).toHaveBeenCalledWith(42);
  });
});

describe('POST /api/admin/organizations/:id/owners', () => {
  const post = (id: string, body: unknown) =>
    request(buildApp())
      .post(`/api/admin/organizations/${id}/owners`)
      .set('Authorization', asAdmin())
      .send(body);

  it.each(['0', '-1', 'abc', '1.5', '1e2'])('400 for organization id %s', async (id) => {
    const res = await post(id, { email: 'm@example.com' });
    expect(res.status).toBe(400);
    expect(storage.promoteFirstOrganizationOwner).not.toHaveBeenCalled();
  });

  it.each([
    ['missing email', {}],
    ['blank email', { email: ' ' }],
    ['an organization id in the body', { email: 'm@example.com', organizationId: 2 }],
    ['a role in the body', { email: 'm@example.com', role: 'admin' }],
  ])('400 for %s', async (_label, body) => {
    const res = await post('4', body);
    expect(res.status).toBe(400);
    expect(storage.promoteFirstOrganizationOwner).not.toHaveBeenCalled();
  });

  it('404 for an unknown organization', async () => {
    storage.promoteFirstOrganizationOwner.mockResolvedValue({ kind: 'organization_not_found' });
    const res = await post('4', { email: 'm@example.com' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Organization not found' });
  });

  it('404 when the account is unknown or not a member of that organization', async () => {
    storage.promoteFirstOrganizationOwner.mockResolvedValue({ kind: 'member_not_found' });
    const res = await post('4', { email: 'm@example.com' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Member not found' });
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('409 when the organization already has an owner', async () => {
    storage.promoteFirstOrganizationOwner.mockResolvedValue({ kind: 'has_owner' });
    const res = await post('4', { email: 'm@example.com' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'organization_has_owner',
      message: 'The organization already has an owner',
    });
  });

  it('503 when the organization is busy', async () => {
    storage.promoteFirstOrganizationOwner.mockRejectedValue(new OrganizationBusyError());
    const res = await post('4', { email: 'm@example.com' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: 'Organization is busy, try again' });
  });

  it('200 with the new owner; the id comes from the path only', async () => {
    storage.promoteFirstOrganizationOwner.mockResolvedValue({
      kind: 'promoted',
      userId: 9,
      email: 'm@example.com',
    });
    const res = await post('4', { email: '  m@example.com ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 9, email: 'm@example.com', role: 'owner' });
    expect(storage.promoteFirstOrganizationOwner).toHaveBeenCalledWith(4, 'm@example.com');
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });
});
