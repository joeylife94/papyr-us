import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

vi.mock('../services/redis.js', () => ({
  isRedisEnabled: vi.fn(() => true),
  getRedisClient: vi.fn(async () => ({ ping: async () => 'PONG' })),
}));

vi.mock('../services/ai.js', () => ({
  isAIAvailable: vi.fn(() => false),
}));

import { registerOperationalRoutes } from '../operational.js';

let uploadsDir: string;
const originalEnv = { ...process.env };

beforeEach(async () => {
  uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'papyr-operational-'));
  process.env.APP_VERSION = 'test-version';
  process.env.GIT_REVISION = 'test-revision';
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.REDIS_URL = 'redis://redis:6379';
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await fs.rm(uploadsDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function createApp(query: () => Promise<unknown>) {
  const app = express();
  registerOperationalRoutes(app, { pool: { query } } as any);
  return app;
}

describe('operational endpoints', () => {
  it('reports build identity through /version', async () => {
    const response = await request(createApp(async () => ({ rows: [] }))).get('/version');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'papyr-us',
      version: 'test-version',
      revision: 'test-revision',
    });
  });

  it('reports ready dependencies through /health', async () => {
    const response = await request(createApp(async () => ({ rows: [{ '?column?': 1 }] }))).get(
      '/health'
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'healthy',
      database: 'ready',
      redis: 'ready',
      uploads: 'ready',
      ai: 'optional',
    });
  });

  it('returns 503 when PostgreSQL is unavailable', async () => {
    const response = await request(
      createApp(async () => {
        throw new Error('database unavailable');
      })
    ).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.database).toBe('degraded');
  });
});
