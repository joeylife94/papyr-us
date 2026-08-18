import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { SearchResponseSchema } from '../../contracts/api.schema';
import { registerRoutes } from '../routes';

const AI_TEST_SECRET = 'ai-search-contract-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'ai-search-contract-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    enforceAuthForWrites: true,
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

vi.mock('../features', () => ({
  featureFlags: {
    PAPYR_MODE: 'team',
    FEATURE_COLLABORATION: false,
    FEATURE_NOTIFICATIONS: false,
    FEATURE_ADMIN: false,
    FEATURE_CALENDAR: false,
    FEATURE_AI_SEARCH: true,
    FEATURE_AUTOMATION: false,
    FEATURE_SSO: false,
    FEATURE_DATABASE_VIEWS: false,
    FEATURE_TEAMS: true,
    FEATURE_TEMPLATES: false,
  },
  isFeatureEnabled: (key: string) => key === 'FEATURE_AI_SEARCH' || key === 'FEATURE_TEAMS',
}));

vi.mock('../services/ai', () => ({
  isAIAvailable: vi.fn(() => false),
  generateContent: vi.fn(),
  generateContentSuggestions: vi.fn(),
  smartSearch: vi.fn(),
  generateSearchSuggestions: vi.fn(),
  inlineAIAction: vi.fn(),
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

vi.mock('../services/upload', async () => {
  const actual = (await vi.importActual('../services/upload')) as any;
  return {
    ...actual,
    listUploadedFiles: vi.fn(),
  };
});

import { storage } from '../storage';

function authCookie(token: string) {
  return [`accessToken=${token}`];
}

const token = jwt.sign(
  { id: 1, email: 'search-contract@test.com', role: 'user' },
  AI_TEST_SECRET
);

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
});

afterAll((done) => {
  server.close(done);
});

describe('POST /api/ai/search empty-result response contract', () => {
  it('returns a normalized SearchResponse for a valid query when the user has no teams', async () => {
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([]);

    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: '  deploy   guide  ' });

    expect(response.status).toBe(200);
    expect(SearchResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      results: [],
      rankingSource: 'fts',
      query: 'deploy guide',
      totalResults: 0,
    });
    expect(storage.retrieveTeamScopedPages).not.toHaveBeenCalled();
  });

  it('rejects a blank query even when the user has no teams', async () => {
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([]);

    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: '   ' });

    expect(response.status).toBe(400);
    expect(storage.retrieveTeamScopedPages).not.toHaveBeenCalled();
  });

  it('rejects an invalid limit even when the user has no teams', async () => {
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([]);

    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: 'deploy guide', limit: 'many' });

    expect(response.status).toBe(400);
    expect(storage.retrieveTeamScopedPages).not.toHaveBeenCalled();
  });

  it('returns the same SearchResponse contract when scoped retrieval has zero hits', async () => {
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([1]);
    (storage.retrieveTeamScopedPages as vi.Mock).mockResolvedValue([]);

    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: '  missing   document  ', teamId: 1 });

    expect(response.status).toBe(200);
    expect(SearchResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      results: [],
      rankingSource: 'fts',
      query: 'missing document',
      totalResults: 0,
    });
    expect(storage.retrieveTeamScopedPages).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'missing document', teamIds: [1] })
    );
  });
});
