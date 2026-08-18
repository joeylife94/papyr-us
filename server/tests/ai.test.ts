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
  // No API key in tests — the route must fall back to FTS ranking.
  isAIAvailable: vi.fn(() => false),
  generateContent: vi.fn(),
  generateContentSuggestions: vi.fn(),
  smartSearch: vi.fn(),
  generateSearchSuggestions: vi.fn(),
  inlineAIAction: vi.fn(),
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
  inlineAIAction,
  isAIAvailable,
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

  it('TC-AI-003: should perform a team-scoped retrieval search across documents', async () => {
    const query = 'What is the project status?';
    const teamId = 1; // numeric ID must match getUserTeamIds mock

    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([teamId]);
    (storage.retrieveTeamScopedPages as vi.Mock).mockResolvedValue([
      {
        pageId: 1,
        teamId,
        slug: 'status',
        title: 'Project Status Page',
        snippet: 'Everything is on track.',
        score: 0.42,
      },
    ]);

    const token = jwt.sign({ id: 1, email: 'user@test.com', role: 'user' }, AI_TEST_SECRET);
    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query, teamId });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      {
        pageId: 1,
        teamId,
        slug: 'status',
        title: 'Project Status Page',
        snippet: 'Everything is on track.',
        ftsScore: 0.42,
        rank: 1,
        sourceType: 'page',
      },
    ]);
    expect(response.body.rankingSource).toBe('fts');
    expect(storage.retrieveTeamScopedPages).toHaveBeenCalledWith(
      expect.objectContaining({ teamIds: [teamId] })
    );
  });

  it('TC-AI-005: retrieval search still works when no AI provider is configured', async () => {
    // isAIAvailable() is false without OPENAI_API_KEY, so no LLM call is made,
    // but the FTS-ranked results must still be returned.
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([1]);
    (storage.retrieveTeamScopedPages as vi.Mock).mockResolvedValue([
      { pageId: 7, teamId: 1, slug: 'runbook', title: 'Runbook', snippet: 'restart the worker', score: 0.3 },
    ]);

    const token = jwt.sign({ id: 1, email: 'user@test.com', role: 'user' }, AI_TEST_SECRET);
    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: 'runbook' });

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0].pageId).toBe(7);
    expect(smartSearch).not.toHaveBeenCalled();
  });

  it('TC-AI-007: AI re-ranking cannot introduce a document retrieval did not return', async () => {
    (isAIAvailable as vi.Mock).mockReturnValue(true);
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([1]);
    (storage.retrieveTeamScopedPages as vi.Mock).mockResolvedValue([
      { pageId: 7, teamId: 1, slug: 'runbook', title: 'Runbook', snippet: 'restart the worker', score: 0.3 },
    ]);
    // A compromised / hallucinating model returns an id outside the candidate set.
    (smartSearch as vi.Mock).mockResolvedValue([
      { id: 999, title: 'Other team doc', content: 'secret', relevance: 0.99, type: 'page' },
      { id: 7, title: 'Runbook', content: 'restart the worker', relevance: 0.5, type: 'page' },
    ]);

    const token = jwt.sign({ id: 1, email: 'user@test.com', role: 'user' }, AI_TEST_SECRET);
    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: 'runbook' });

    expect(response.status).toBe(200);
    expect(response.body.results.map((r: { pageId: number }) => r.pageId)).toEqual([7]);
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('TC-AI-008: hands the AI layer only the bounded retrieval candidates', async () => {
    (isAIAvailable as vi.Mock).mockReturnValue(true);
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([1]);
    (storage.retrieveTeamScopedPages as vi.Mock).mockResolvedValue([
      { pageId: 7, teamId: 1, slug: 'runbook', title: 'Runbook', snippet: 'restart the worker', score: 0.3 },
    ]);
    (smartSearch as vi.Mock).mockResolvedValue([]);

    const token = jwt.sign({ id: 1, email: 'user@test.com', role: 'user' }, AI_TEST_SECRET);
    await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: 'runbook' });

    const [, documents] = (smartSearch as vi.Mock).mock.calls[0];
    expect(documents).toHaveLength(1);
    // Snippets, not full page bodies, are what reaches the prompt.
    expect(documents[0].content).toBe('restart the worker');
  });

  it('TC-AI-010: caps AI re-rank candidates well below the retrieval limit', async () => {
    (isAIAvailable as vi.Mock).mockReturnValue(true);
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([1]);
    // Retrieval legitimately returns 50 documents…
    (storage.retrieveTeamScopedPages as vi.Mock).mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        pageId: i + 1,
        teamId: 1,
        slug: `page-${i + 1}`,
        title: `Page ${i + 1}`,
        snippet: 'body',
        score: 1 - i / 100,
      }))
    );
    (smartSearch as vi.Mock).mockResolvedValue([]);

    const token = jwt.sign({ id: 1, email: 'user@test.com', role: 'user' }, AI_TEST_SECRET);
    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: 'anything', limit: 50 });

    // …but the prompt only ever sees the head of that list.
    const [, documents] = (smartSearch as vi.Mock).mock.calls[0];
    expect(documents).toHaveLength(15);

    // Nothing retrieved is lost: the tail keeps its FTS ordering.
    expect(response.body.results).toHaveLength(50);
    expect(response.body.rankingSource).toBe('fts');
    expect(response.body.results.map((r: { rank: number }) => r.rank).slice(0, 3)).toEqual([
      1, 2, 3,
    ]);
  });

  it('TC-AI-011: re-ranks the AI window while preserving documents outside it', async () => {
    (isAIAvailable as vi.Mock).mockReturnValue(true);
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([1]);
    (storage.retrieveTeamScopedPages as vi.Mock).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        pageId: i + 1,
        teamId: 1,
        slug: `page-${i + 1}`,
        title: `Page ${i + 1}`,
        snippet: 'body',
        score: 1 - i / 100,
      }))
    );
    // The model promotes the last document inside the 15-item window.
    (smartSearch as vi.Mock).mockResolvedValue([{ id: 15, relevance: 0.99, type: 'page' }]);

    const token = jwt.sign({ id: 1, email: 'user@test.com', role: 'user' }, AI_TEST_SECRET);
    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: 'anything', limit: 20 });

    expect(response.body.rankingSource).toBe('ai-reranked');
    expect(response.body.results[0].pageId).toBe(15);
    expect(response.body.results[0].aiScore).toBe(0.99);
    // Documents 16-20 were never shown to the model but must still be returned.
    expect(response.body.results).toHaveLength(20);
    expect(response.body.results.map((r: { pageId: number }) => r.pageId)).toContain(20);
  });

  it('TC-AI-009: falls back to FTS ranking when the AI provider fails', async () => {
    (isAIAvailable as vi.Mock).mockReturnValue(true);
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([1]);
    (storage.retrieveTeamScopedPages as vi.Mock).mockResolvedValue([
      { pageId: 7, teamId: 1, slug: 'runbook', title: 'Runbook', snippet: 'restart the worker', score: 0.3 },
    ]);
    (smartSearch as vi.Mock).mockRejectedValue(new Error('openai unavailable'));

    const token = jwt.sign({ id: 1, email: 'user@test.com', role: 'user' }, AI_TEST_SECRET);
    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: 'runbook' });

    expect(response.status).toBe(200);
    expect(response.body.results.map((r: { pageId: number }) => r.pageId)).toEqual([7]);
  });

  it('TC-AI-006: never passes the whole workspace to the AI layer', async () => {
    (storage.getUserTeamIds as vi.Mock).mockResolvedValue([1]);
    (storage.retrieveTeamScopedPages as vi.Mock).mockImplementation(
      async ({ limit }: { limit: number }) =>
        Array.from({ length: limit }, (_, i) => ({
          pageId: i + 1,
          teamId: 1,
          slug: `page-${i}`,
          title: `Page ${i}`,
          snippet: 'content',
          score: 1 - i / 100,
        }))
    );

    const token = jwt.sign({ id: 1, email: 'user@test.com', role: 'user' }, AI_TEST_SECRET);
    const response = await request(app)
      .post('/api/ai/search')
      .set('Cookie', authCookie(token))
      .send({ query: 'anything', limit: 9999 });

    expect(response.status).toBe(200);
    // The top-k cap holds regardless of what the caller asks for.
    expect(response.body.results.length).toBeLessThanOrEqual(50);
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

describe('Inline AI API (POST /api/ai/inline)', () => {
  const token = jwt.sign({ id: 1, email: 'user@ai-test.com', role: 'user' }, AI_TEST_SECRET);

  it('TC-AI-INL-001: processes a valid inline summarize action', async () => {
    const selectedText = 'This is a long paragraph that needs to be summarized.';
    const expected = { action: 'summarize', result: 'Short summary.' };
    (inlineAIAction as vi.Mock).mockResolvedValue(expected);

    const response = await request(app)
      .post('/api/ai/inline')
      .set('Cookie', authCookie(token))
      .send({ action: 'summarize', text: selectedText });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expected);
    expect(inlineAIAction).toHaveBeenCalledWith('summarize', selectedText);
  });

  it('TC-AI-INL-002: returns 400 for an unrecognized inline action', async () => {
    const response = await request(app)
      .post('/api/ai/inline')
      .set('Cookie', authCookie(token))
      .send({ action: 'invalid_action', text: 'some text' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/invalid action/i);
    expect(inlineAIAction).not.toHaveBeenCalled();
  });

  it('TC-AI-INL-003: returns 400 when action or text is missing', async () => {
    const response = await request(app)
      .post('/api/ai/inline')
      .set('Cookie', authCookie(token))
      .send({ action: 'rewrite' }); // text is missing

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/required/i);
    expect(inlineAIAction).not.toHaveBeenCalled();
  });
});
