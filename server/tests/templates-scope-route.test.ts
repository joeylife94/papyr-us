/**
 * Route-level rules of the template routes (issue #124 X1b, decision D1). Templates belong to an
 * organization; template categories stay an instance-wide taxonomy that only platform admins
 * change. The SQL rules are proven against real Postgres by
 * tests/integration-layer4/templates-organizations.test.ts and end to end by
 * tests/security-templates-uploads.spec.ts.
 *
 * Rules under test:
 * - every template route needs a session (401 otherwise, whatever ENFORCE_AUTH_WRITES says);
 * - an account without an organization is refused (403);
 * - storage is always asked with the caller's organization, which is never taken from the body;
 * - a template of another organization and an unknown id answer the same 404;
 * - category reads are unchanged; category writes are platform-admin only (403 otherwise, also
 *   for a signed-out caller).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'templates-scope-route-secret';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'templates-scope-route-secret',
  adminEmails: ['admin@example.com'] as string[],
  enforceAuthForWrites: true,
  rateLimitEnabled: false,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 1000,
  adminIpWhitelist: [] as string[],
  port: 5001,
  host: '0.0.0.0',
  isProduction: false,
  isReplit: false,
}));

vi.mock('../config', () => ({ config: mockConfig }));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const ORG = 5;
const MEMBER = { id: 7, email: 'member@example.com' };
const NO_ORG = { id: 8, email: 'noorg@example.com' };
const ADMIN = { id: 9, email: 'admin@example.com' };

const tokenFor = (user: { id: number; email: string }) =>
  jwt.sign({ id: user.id, email: user.email, role: 'user' }, TEST_SECRET);
const as = (user: { id: number; email: string }) => ({ Cookie: [`accessToken=${tokenFor(user)}`] });

const template = {
  id: 11,
  title: 'Meeting notes',
  content: 'body',
  author: 'a',
  organizationId: ORG,
};
const newTemplate = { title: 'T', content: 'c', author: 'someone', categoryId: 1 };

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.enforceAuthForWrites = true;
  storage.getUserOrganizationId.mockImplementation(async (userId: number) =>
    userId === NO_ORG.id ? null : ORG
  );
  storage.getUserAccount.mockImplementation(async (userId: number) => ({
    email: [MEMBER, NO_ORG, ADMIN].find((u) => u.id === userId)?.email ?? 'x@example.com',
    isActive: true,
  }));
  storage.getTemplates.mockResolvedValue([template]);
  storage.getTemplate.mockResolvedValue(template);
  storage.createTemplate.mockResolvedValue(template);
  storage.updateTemplate.mockResolvedValue(template);
  storage.deleteTemplate.mockResolvedValue(true);
  storage.incrementTemplateUsage.mockResolvedValue(true);
  storage.getTemplateCategories.mockResolvedValue([]);
  storage.getTemplateCategory.mockResolvedValue({ id: 1, name: 'c' });
  storage.createTemplateCategory.mockResolvedValue({ id: 1, name: 'c' });
  storage.updateTemplateCategory.mockResolvedValue({ id: 1, name: 'c' });
  storage.deleteTemplateCategory.mockResolvedValue(true);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const routes: Array<[string, string, string, object?]> = [
  ['list', 'get', '/api/templates'],
  ['read', 'get', '/api/templates/11'],
  ['create', 'post', '/api/templates', newTemplate],
  ['update', 'put', '/api/templates/11', { title: 'New' }],
  ['delete', 'delete', '/api/templates/11'],
  ['use', 'post', '/api/templates/11/use'],
];
const send = (method: string, path: string, body?: object, headers: object = {}) => {
  const req = (request(app) as any)[method](path).set(headers);
  return body ? req.send(body) : req;
};

describe('template routes need a session and an organization', () => {
  it.each(routes)(
    '%s: 401 without a session, storage untouched',
    async (_n, method, path, body) => {
      const response = await send(method, path, body);
      expect(response.status).toBe(401);
      for (const name of [
        'getTemplates',
        'getTemplate',
        'createTemplate',
        'updateTemplate',
        'deleteTemplate',
        'incrementTemplateUsage',
      ]) {
        expect(storage[name], name).not.toHaveBeenCalled();
      }
    }
  );

  it.each(routes)(
    '%s: 401 without a session also when auth is not enforced',
    async (_n, method, path, body) => {
      mockConfig.enforceAuthForWrites = false;
      expect((await send(method, path, body)).status).toBe(401);
    }
  );

  it.each(routes)(
    '%s: 403 for an account without an organization',
    async (_n, method, path, body) => {
      const response = await send(method, path, body, as(NO_ORG));
      expect(response.status).toBe(403);
      expect(storage.getTemplates).not.toHaveBeenCalled();
      expect(storage.getTemplate).not.toHaveBeenCalled();
      expect(storage.createTemplate).not.toHaveBeenCalled();
      expect(storage.updateTemplate).not.toHaveBeenCalled();
      expect(storage.deleteTemplate).not.toHaveBeenCalled();
      expect(storage.incrementTemplateUsage).not.toHaveBeenCalled();
    }
  );

  it('refuses (never grants) when the organization lookup fails', async () => {
    storage.getUserOrganizationId.mockRejectedValue(new Error('db down'));
    const response = await request(app).get('/api/templates').set(as(MEMBER));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(storage.getTemplates).not.toHaveBeenCalled();
  });
});

describe('template routes act inside the caller organization', () => {
  it('lists with the caller organization and the optional category filter', async () => {
    const response = await request(app).get('/api/templates').set(as(MEMBER));
    expect(response.status).toBe(200);
    expect(response.body).toEqual([template]);
    expect(storage.getTemplates).toHaveBeenCalledWith(ORG, undefined);

    await request(app).get('/api/templates?categoryId=3').set(as(MEMBER));
    expect(storage.getTemplates).toHaveBeenLastCalledWith(ORG, 3);

    expect((await request(app).get('/api/templates?categoryId=x').set(as(MEMBER))).status).toBe(
      400
    );
  });

  it('reads, updates, deletes and counts a use only through the organization', async () => {
    expect((await request(app).get('/api/templates/11').set(as(MEMBER))).body).toEqual(template);
    expect(storage.getTemplate).toHaveBeenCalledWith(11, ORG);

    await request(app).put('/api/templates/11').set(as(MEMBER)).send({ title: 'New' });
    expect(storage.updateTemplate).toHaveBeenCalledWith(11, { title: 'New' }, ORG);

    expect((await request(app).delete('/api/templates/11').set(as(MEMBER))).status).toBe(204);
    expect(storage.deleteTemplate).toHaveBeenCalledWith(11, ORG);

    expect((await request(app).post('/api/templates/11/use').set(as(MEMBER))).body).toEqual({
      success: true,
    });
    expect(storage.incrementTemplateUsage).toHaveBeenCalledWith(11, ORG);
  });

  it('answers another organization and an unknown id with the same 404', async () => {
    storage.getTemplate.mockResolvedValue(undefined);
    storage.updateTemplate.mockResolvedValue(undefined);
    storage.deleteTemplate.mockResolvedValue(false);
    storage.incrementTemplateUsage.mockResolvedValue(false);

    const answers = [
      await request(app).get('/api/templates/99').set(as(MEMBER)),
      await request(app).put('/api/templates/99').set(as(MEMBER)).send({ title: 'x' }),
      await request(app).delete('/api/templates/99').set(as(MEMBER)),
      await request(app).post('/api/templates/99/use').set(as(MEMBER)),
    ];
    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer.body).toEqual({ error: 'Template not found' });
    }
  });

  it('creates in the caller organization and ignores an organizationId in the body', async () => {
    const response = await request(app)
      .post('/api/templates')
      .set(as(MEMBER))
      .send({ ...newTemplate, organizationId: 999 });
    expect(response.status).toBe(201);
    expect(storage.createTemplate).toHaveBeenCalledTimes(1);
    const [data, organizationId] = storage.createTemplate.mock.calls[0];
    expect(organizationId).toBe(ORG);
    expect(data).not.toHaveProperty('organizationId');
    expect(data).toMatchObject(newTemplate);
  });

  it('never lets an update move a template to another organization', async () => {
    await request(app)
      .put('/api/templates/11')
      .set(as(MEMBER))
      .send({ title: 'x', organizationId: 999 });
    const [, data, organizationId] = storage.updateTemplate.mock.calls[0];
    expect(organizationId).toBe(ORG);
    expect(data).not.toHaveProperty('organizationId');
  });
});

describe('template categories: reads unchanged, writes for platform admins only', () => {
  it('still serves the category reads', async () => {
    expect((await request(app).get('/api/template-categories')).status).toBe(200);
    expect((await request(app).get('/api/template-categories/1')).status).toBe(200);
  });

  const writes: Array<[string, string, object?]> = [
    ['post', '/api/template-categories', { name: 'n', displayName: 'N' }],
    ['put', '/api/template-categories/1', { displayName: 'N2' }],
    ['delete', '/api/template-categories/1'],
  ];

  it.each(writes)(
    '%s %s: 403 for a member and for a signed-out caller',
    async (method, path, body) => {
      const member = await send(method, path, body, as(MEMBER));
      expect(member.status).toBe(403);
      expect(member.body).toEqual({ message: 'Forbidden: admin required' });
      // Signed out: the global write guard answers 401 when auth is enforced; otherwise
      // requireAdmin itself refuses (403).
      expect((await send(method, path, body)).status).toBe(401);
      mockConfig.enforceAuthForWrites = false;
      const anonymous = await send(method, path, body);
      expect(anonymous.status).toBe(403);
      expect(anonymous.body).toEqual({ message: 'Forbidden: admin required' });
      expect(storage.createTemplateCategory).not.toHaveBeenCalled();
      expect(storage.updateTemplateCategory).not.toHaveBeenCalled();
      expect(storage.deleteTemplateCategory).not.toHaveBeenCalled();
    }
  );

  it('lets a platform admin create, update and delete a category', async () => {
    expect(
      (await send('post', '/api/template-categories', { name: 'n', displayName: 'N' }, as(ADMIN)))
        .status
    ).toBe(201);
    expect(
      (await send('put', '/api/template-categories/1', { displayName: 'N2' }, as(ADMIN))).status
    ).toBe(200);
    expect((await send('delete', '/api/template-categories/1', undefined, as(ADMIN))).status).toBe(
      204
    );
  });
});
