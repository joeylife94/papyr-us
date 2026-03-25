import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const AI_TEST_SECRET = 'ai-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'ai-test-secret',
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

// Enable AI feature flag for testing
vi.mock('../features', () => ({
  featureFlags: {
    PAPYR_MODE: 'team',
    FEATURE_COLLABORATION: true,
    FEATURE_NOTIFICATIONS: true,
    FEATURE_ADMIN: true,
    FEATURE_CALENDAR: true,
    FEATURE_AI_SEARCH: true,
    FEATURE_AUTOMATION: true,
    FEATURE_SSO: false,
    FEATURE_DATABASE_VIEWS: false,
  },
  isFeatureEnabled: (key: string) => true,
}));

// Mock the AI and dependent storage services
vi.mock('../services/ai', () => ({
  generateContent: vi.fn(),
  generateContentSuggestions: vi.fn(),
  smartSearch: vi.fn(),
  generateSearchSuggestions: vi.fn(),
}));

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

vi.mock('../services/upload', async () => {
  const actual = (await vi.importActual('../services/upload')) as any;
  return {
    ...actual, // Use actual 'upload' middleware from multer
    listUploadedFiles: vi.fn(),
  };
});

import {
  generateContent,
  generateContentSuggestions,
  smartSearch,
  generateSearchSuggestions,
} from '../services/ai';
import { storage } from '../storage';
import { listUploadedFiles } from '../services/upload.js';

function authCookie(token: string) {
  return [`accessToken=${token}`];
}

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

describe('AI Services API', () => {
  // Shared auth token — all routes require authentication (enforceAuthForWrites: true)
  const token = jwt.sign({ id: 1, email: 'user@ai-test.com', role: 'user' }, AI_TEST_SECRET);

  it('TC-AI-001: should generate content with AI successfully', async () => {
    const prompt = 'Write a poem about coding.';
    const generated = {
      content: 'Roses are red, my screen is blue, I love to code, how about you?',
    };
    (generateContent as vi.Mock).mockResolvedValue(generated.content);

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Cookie', authCookie(token))
      .send({ prompt, type: 'poem' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(generated);
    expect(generateContent).toHaveBeenCalledWith(prompt, 'poem');
  });

  it('TC-AI-002: should get AI-powered suggestions to improve content', async () => {
    const content = { title: 'My Doc', content: 'This is my doc.' };
    const suggestions = { suggestions: ['Make it longer.', 'Add a joke.'] };
    (generateContentSuggestions as vi.Mock).mockResolvedValue(suggestions.suggestions);

    const response = await request(app)
      .post('/api/ai/improve')
      .set('Cookie', authCookie(token))
      .send(content);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(suggestions);
  });

  it('TC-AI-003: should perform an AI-powered search across documents', async () => {
    const query = 'What is the project status?';
    const teamId = 1; // numeric ID must match getUserTeamIds mock
    const searchResults = [
      { id: 1, title: 'Project Status Page', content: 'Everything is on track.', type: 'page' },
    ];

    // Mock dependent data sources
    (storage.searchWikiPages as vi.Mock).mockResolvedValue({
      pages: [
        { id: 1, title: 'Project Status Page', content: 'Everything is on track.', slug: 'status' },
      ],
    });
    (storage.getTasks as vi.Mock).mockResolvedValue([]);
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([teamId]);
    (listUploadedFiles as vi.Mock).mockResolvedValue({ files: [] });
    (smartSearch as vi.Mock).mockResolvedValue(searchResults);

    const token = jwt.sign({ id: 1, email: 'user@test.com', role: 'user' }, AI_TEST_SECRET);
    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query, teamId });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual(searchResults);
    expect(smartSearch).toHaveBeenCalled();
  });

  it('TC-AI-004: should get search suggestions based on a query', async () => {
    const query = 'how to';
    const suggestions = { suggestions: ['how to setup the project', 'how to run tests'] };
    (generateSearchSuggestions as vi.Mock).mockResolvedValue(suggestions.suggestions);

    const response = await request(app)
      .post('/api/ai/search-suggestions')
      .set('Cookie', authCookie(token))
      .send({ query });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(suggestions);
  });
});
