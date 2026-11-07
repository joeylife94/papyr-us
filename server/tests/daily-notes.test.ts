/**
 * POST /api/pages/daily (#111 daily notes): date validation, scope resolution that fails closed,
 * the trash/conflict refusals and the `created` flag. Find-or-create idempotency under concurrent
 * requests is proven against a real database by tests/security-daily-notes.spec.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'daily-notes-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'daily-notes-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    enforceAuthForWrites: false,
    allowAdminPassword: false,
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

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage';

const token = jwt.sign({ id: 7, email: 'writer@example.com', role: 'user' }, TEST_SECRET);
const viewer = { userId: 7, email: 'writer@example.com', teamIds: [3] };

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const today = utcDate(0);

const notePage = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  title: today,
  slug: `daily-${today}-u7`,
  content: '',
  folder: 'logs',
  tags: ['daily'],
  author: 'writer@example.com',
  teamId: null,
  ...overrides,
});

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
  (storage.getPageViewer as any).mockImplementation(async (userId?: number) =>
    userId ? viewer : { teamIds: [] }
  );
  (storage.checkPagePermission as any).mockResolvedValue(true);
  (storage.getActiveWorkflowsByTrigger as any).mockResolvedValue([]);
  (storage.findOrCreateDailyNote as any).mockResolvedValue({
    status: 'created',
    page: notePage(),
  });
});

afterAll((done) => {
  server.close(done);
});

const open = (body: unknown) =>
  request(app)
    .post('/api/pages/daily')
    .set('Cookie', [`accessToken=${token}`])
    .send(body as object);

describe('POST /api/pages/daily', () => {
  it("creates the caller's personal note on first use", async () => {
    const response = await open({ date: today });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ page: notePage(), created: true });
    expect(storage.findOrCreateDailyNote).toHaveBeenCalledWith({
      slug: `daily-${today}-u7`,
      title: today,
      folder: 'logs',
      tags: ['daily'],
      author: 'writer@example.com',
      teamId: null,
      userId: 7,
    });
  });

  it("returns the team's existing note without creating another", async () => {
    const page = notePage({ slug: `daily-${today}-t3`, teamId: 3 });
    (storage.findOrCreateDailyNote as any).mockResolvedValue({ status: 'found', page });

    const response = await open({ date: today, teamId: 3 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ page, created: false });
    expect(storage.findOrCreateDailyNote).toHaveBeenCalledWith(
      expect.objectContaining({ slug: `daily-${today}-t3`, teamId: 3, userId: 7 })
    );
  });

  it('resolves a team name like every scope-taking path', async () => {
    (storage.getTeamByName as any).mockResolvedValue({ id: 3, name: 'alpha' });

    const response = await open({ date: today, teamId: 'alpha' });

    expect(response.status).toBe(200);
    expect(storage.findOrCreateDailyNote).toHaveBeenCalledWith(
      expect.objectContaining({ slug: `daily-${today}-t3`, teamId: 3 })
    );
  });

  it.each([
    ['yesterday', utcDate(-1)],
    ['tomorrow', utcDate(1)],
  ])("accepts %s (UTC), which is some time zone's today", async (_label, date) => {
    const response = await open({ date });

    expect(response.status).toBe(200);
    expect(storage.findOrCreateDailyNote).toHaveBeenCalledWith(
      expect.objectContaining({ title: date, slug: `daily-${date}-u7` })
    );
  });

  it.each([
    ['two days ago', { date: utcDate(-2) }],
    ['two days ahead', { date: utcDate(2) }],
    ['a malformed date', { date: today.replace(/-/g, '/') }],
    ['a date with a time', { date: `${today}T00:00` }],
    ['an impossible date', { date: '2026-02-30' }],
    ['no date', {}],
    ['a numeric date', { date: 20261026 }],
    ['unknown fields', { date: today, slug: 'chosen-slug' }],
  ])('rejects %s with 400 before touching storage', async (_label, body) => {
    const response = await open(body);

    expect(response.status).toBe(400);
    expect(storage.findOrCreateDailyNote).not.toHaveBeenCalled();
  });

  it.each([
    ['a team the caller is not in', 4],
    ['an unknown team name', 'nope'],
  ])('refuses %s with 403', async (_label, teamId) => {
    (storage.getTeamByName as any).mockResolvedValue(undefined);

    const response = await open({ date: today, teamId });

    expect(response.status).toBe(403);
    expect(storage.findOrCreateDailyNote).not.toHaveBeenCalled();
  });

  it('refuses a caller without a session', async () => {
    const response = await request(app).post('/api/pages/daily').send({ date: today });

    expect(response.status).toBe(401);
    expect(storage.findOrCreateDailyNote).not.toHaveBeenCalled();
  });

  it('asks to restore a trashed note instead of creating a second one', async () => {
    (storage.findOrCreateDailyNote as any).mockResolvedValue({ status: 'trashed' });

    const response = await open({ date: today });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('daily_note_trashed');
    expect(response.body.message).toMatch(/trash/i);
  });

  it('refuses a slug held by a page that is not this scope note', async () => {
    (storage.findOrCreateDailyNote as any).mockResolvedValue({ status: 'conflict' });

    const response = await open({ date: today, teamId: 3 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('daily_note_unavailable');
  });

  it('never returns a found page the caller cannot read', async () => {
    (storage.findOrCreateDailyNote as any).mockResolvedValue({
      status: 'found',
      page: notePage({ title: 'Someone else secret plan', content: 'secret body' }),
    });
    (storage.checkPagePermission as any).mockResolvedValue(false);

    const response = await open({ date: today });

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(storage.checkPagePermission).toHaveBeenCalledWith(7, 41, 'viewer');
  });

  it('does not leak internal errors', async () => {
    (storage.findOrCreateDailyNote as any).mockRejectedValue(
      new Error('relation "secret_table" does not exist')
    );

    const response = await open({ date: today });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret_table');
  });
});

describe('daily note slugs are reserved', () => {
  it('refuses to rename a page to a daily note slug before anything is written', async () => {
    const response = await request(app)
      .put('/api/pages/5')
      .set('Cookie', [`accessToken=${token}`])
      .send({ slug: `daily-${today}-t3` });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/reserved/);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});
