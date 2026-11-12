/**
 * Per-organization AI gate (#124 X1c P3), on the real routes with a mocked storage and spies in
 * place of the AI provider functions.
 *
 * Rule under test: content reaches a provider function only when the caller's organization has AI
 * on. With it off (or without an organization, or when the lookup fails) the provider function is
 * not called and the route answers 403 `ai_disabled` before it looks at the body; without a
 * session the answer is 401 whatever ENFORCE_AUTH_WRITES says. The search route keeps answering
 * with the full-text order when AI is off.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const SECRET = 'ai-organization-gate-secret';

const cfg = vi.hoisted(() => ({ enforce: true }));

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'ai-organization-gate-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    get enforceAuthForWrites() {
      return cfg.enforce;
    },
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
    FEATURE_COLLABORATION: true,
    FEATURE_NOTIFICATIONS: true,
    FEATURE_ADMIN: true,
    FEATURE_CALENDAR: true,
    FEATURE_AI_SEARCH: true,
    FEATURE_AUTOMATION: true,
    FEATURE_SSO: false,
    FEATURE_DATABASE_VIEWS: false,
  },
  isFeatureEnabled: () => true,
}));

vi.mock('../services/ai', () => ({
  isAIAvailable: vi.fn(() => true),
  generateContent: vi.fn().mockResolvedValue('generated'),
  generateContentSuggestions: vi.fn().mockResolvedValue([]),
  summarizeContent: vi.fn(),
  smartSearch: vi.fn().mockResolvedValue([]),
  generateSearchSuggestions: vi.fn().mockResolvedValue([]),
  chatWithCopilot: vi.fn().mockResolvedValue('hi'),
  extractTasks: vi.fn().mockResolvedValue([]),
  findRelatedPages: vi.fn().mockResolvedValue([]),
  inlineAIAction: vi.fn().mockResolvedValue({ action: 'summarize', result: 'x' }),
}));

vi.mock('../services/ai-assistant', () => ({
  aiAssistant: {
    isAvailable: vi.fn(() => true),
    assist: vi.fn().mockResolvedValue({ result: 'x' }),
    generateBlock: vi.fn().mockResolvedValue({ block: 'x' }),
    getSuggestions: vi.fn().mockResolvedValue([]),
    autoFormat: vi.fn().mockResolvedValue({ result: 'x' }),
  },
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

vi.mock('../services/upload', async () => {
  const actual = (await vi.importActual('../services/upload')) as any;
  return { ...actual, listUploadedFiles: vi.fn() };
});

import * as ai from '../services/ai';
import { aiAssistant } from '../services/ai-assistant';
import { storage } from '../storage';

const s = storage as any;
const aiFns = ai as any;
const assistant = aiAssistant as any;

const token = jwt.sign({ id: 7, email: 'member@org.test', role: 'user' }, SECRET);
const cookie = [`accessToken=${token}`];
const ORG = 4;

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll((done) => {
  server.close(done);
});

function setOrganization(state: 'on' | 'off' | 'none' | 'lookup-fails' | 'setting-fails') {
  s.getOrganizationMembership.mockReset();
  s.isOrganizationAiEnabled.mockReset();
  if (state === 'none') {
    s.getOrganizationMembership.mockResolvedValue(null);
    return;
  }
  if (state === 'lookup-fails') {
    s.getOrganizationMembership.mockRejectedValue(new Error('db down'));
    return;
  }
  s.getOrganizationMembership.mockResolvedValue({ organizationId: ORG, role: 'member' });
  if (state === 'setting-fails') {
    s.isOrganizationAiEnabled.mockRejectedValue(new Error('db down'));
    return;
  }
  s.isOrganizationAiEnabled.mockResolvedValue(state === 'on');
}

const providerSpies = () => [
  aiFns.generateContent,
  aiFns.generateContentSuggestions,
  aiFns.smartSearch,
  aiFns.generateSearchSuggestions,
  aiFns.chatWithCopilot,
  aiFns.extractTasks,
  aiFns.findRelatedPages,
  aiFns.inlineAIAction,
  assistant.assist,
  assistant.generateBlock,
  assistant.getSuggestions,
  assistant.autoFormat,
];

beforeEach(() => {
  cfg.enforce = true;
  vi.clearAllMocks();
  aiFns.isAIAvailable.mockReturnValue(true);
  s.getUserTeamIds.mockResolvedValue([3]);
  s.getPageViewer.mockResolvedValue({ userId: 7, email: 'member@org.test', teamIds: [3] });
  s.searchWikiPages.mockResolvedValue({ pages: [] });
  s.getKnowledgeGraphSource.mockResolvedValue({
    pages: [{ id: 1, title: 'A', slug: 'a', icon: null, tags: [], content: 'body' }],
    links: [],
  });
  setOrganization('on');
});

// Each route with a valid body, the spy its provider call goes through, and an invalid body.
const routes: Array<{
  name: string;
  path: string;
  body: Record<string, unknown>;
  spy: () => any;
  invalid: Record<string, unknown>;
}> = [
  {
    name: 'generate',
    path: '/api/ai/generate',
    body: { prompt: 'p', type: 'poem' },
    spy: () => aiFns.generateContent,
    invalid: {},
  },
  {
    name: 'improve',
    path: '/api/ai/improve',
    body: { content: 'c', title: 't' },
    spy: () => aiFns.generateContentSuggestions,
    invalid: {},
  },
  {
    name: 'search-suggestions',
    path: '/api/ai/search-suggestions',
    body: { query: 'roadmap' },
    spy: () => aiFns.generateSearchSuggestions,
    invalid: {},
  },
  {
    name: 'copilot chat',
    path: '/api/ai/copilot/chat',
    body: { messages: [{ role: 'user', content: 'hi' }] },
    spy: () => aiFns.chatWithCopilot,
    invalid: { messages: 'nope' },
  },
  {
    name: 'extract-tasks',
    path: '/api/ai/extract-tasks',
    body: { content: 'todo: ship' },
    spy: () => aiFns.extractTasks,
    invalid: {},
  },
  {
    name: 'related-pages',
    path: '/api/ai/related-pages',
    body: { content: 'c', title: 't' },
    spy: () => aiFns.findRelatedPages,
    invalid: {},
  },
  {
    name: 'assist',
    path: '/api/ai/assist',
    body: { command: 'improve', text: 'hello' },
    spy: () => assistant.assist,
    invalid: {},
  },
  {
    name: 'generate-block',
    path: '/api/ai/generate-block',
    body: { prompt: 'p', blockType: 'table' },
    spy: () => assistant.generateBlock,
    invalid: { prompt: 'p', blockType: 'bogus' },
  },
  {
    name: 'suggestions',
    path: '/api/ai/suggestions',
    body: { text: 'hello', cursorPosition: 2 },
    spy: () => assistant.getSuggestions,
    invalid: {},
  },
  {
    name: 'auto-format',
    path: '/api/ai/auto-format',
    body: { text: 'hello' },
    spy: () => assistant.autoFormat,
    invalid: {},
  },
  {
    name: 'inline',
    path: '/api/ai/inline',
    body: { action: 'summarize', text: 'hello' },
    spy: () => aiFns.inlineAIAction,
    invalid: { action: 'bogus', text: 'hello' },
  },
];

// related-pages hands the provider pages only when the caller has team pages to offer
beforeEach(() => {
  s.searchWikiPages.mockResolvedValue({
    pages: [{ id: 1, title: 'Other', content: 'c', tags: [] }],
  });
});

describe.each(routes)('POST $path', ({ path, body, spy, invalid }) => {
  const post = (b: Record<string, unknown> = body) =>
    request(app).post(path).set('Cookie', cookie).send(b);

  it('answers 403 ai_disabled and reaches no provider function when the organization has AI off', async () => {
    setOrganization('off');
    for (const b of [body, invalid]) {
      const res = await post(b);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ai_disabled');
    }
    for (const fn of providerSpies()) expect(fn).not.toHaveBeenCalled();
  });

  it.each(['none', 'lookup-fails', 'setting-fails'] as const)(
    'refuses and reaches no provider function when the organization state is %s',
    async (state) => {
      setOrganization(state);
      const res = await post();
      expect([403, 500]).toContain(res.status);
      for (const fn of providerSpies()) expect(fn).not.toHaveBeenCalled();
    }
  );

  it('calls the provider function when the organization has AI on', async () => {
    setOrganization('on');
    const res = await post();
    expect(res.status).toBe(200);
    expect(spy()).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    'answers 401 without a session when ENFORCE_AUTH_WRITES is %s',
    async (enforce) => {
      cfg.enforce = enforce;
      const res = await request(app).post(path).send(body);
      expect(res.status).toBe(401);
      for (const fn of providerSpies()) expect(fn).not.toHaveBeenCalled();
    }
  );

  it('uses the session of a signed-in caller when ENFORCE_AUTH_WRITES is off', async () => {
    cfg.enforce = false;
    setOrganization('off');
    const refused = await post();
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('ai_disabled');
    setOrganization('on');
    const allowed = await post();
    expect(allowed.status).toBe(200);
    expect(spy()).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/ai/search', () => {
  const search = () =>
    request(app).post('/api/ai/search').set('Cookie', cookie).send({ query: 'roadmap' });

  beforeEach(() => {
    s.retrieveTeamScopedPages.mockResolvedValue([
      { pageId: 1, teamId: 3, slug: 'roadmap', title: 'Roadmap', snippet: 'plan', score: 0.4 },
    ]);
  });

  it.each(['off', 'none', 'lookup-fails', 'setting-fails'] as const)(
    'keeps the full-text order and does not call smartSearch when the organization state is %s',
    async (state) => {
      setOrganization(state);
      const res = await search();
      expect(res.status).toBe(200);
      expect(res.body.rankingSource).toBe('fts');
      expect(aiFns.smartSearch).not.toHaveBeenCalled();
    }
  );

  it('calls smartSearch when the organization has AI on and a provider is configured', async () => {
    setOrganization('on');
    const res = await search();
    expect(res.status).toBe(200);
    expect(aiFns.smartSearch).toHaveBeenCalledTimes(1);
  });

  it('does not ask for the organization setting when no provider is configured', async () => {
    aiFns.isAIAvailable.mockReturnValue(false);
    const res = await search();
    expect(res.status).toBe(200);
    expect(res.body.rankingSource).toBe('fts');
    expect(aiFns.smartSearch).not.toHaveBeenCalled();
  });
});

describe('GET /api/knowledge-graph', () => {
  const graph = (query = '') =>
    request(app).get(`/api/knowledge-graph${query}`).set('Cookie', cookie);

  it('answers 403 ai_disabled for includeAI=true when AI is off, before reading any page', async () => {
    setOrganization('off');
    const res = await graph('?includeAI=true');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ai_disabled');
    expect(aiFns.findRelatedPages).not.toHaveBeenCalled();
    expect(s.getKnowledgeGraphSource).not.toHaveBeenCalled();
  });

  it.each(['none', 'lookup-fails', 'setting-fails'] as const)(
    'refuses includeAI=true when the organization state is %s',
    async (state) => {
      setOrganization(state);
      const res = await graph('?includeAI=true');
      expect(res.status).toBe(403);
      expect(aiFns.findRelatedPages).not.toHaveBeenCalled();
      expect(s.getKnowledgeGraphSource).not.toHaveBeenCalled();
    }
  );

  it('answers 401 for includeAI=true without a session in both modes', async () => {
    for (const enforce of [true, false]) {
      cfg.enforce = enforce;
      const res = await request(app).get('/api/knowledge-graph?includeAI=true');
      expect(res.status).toBe(401);
    }
    expect(aiFns.findRelatedPages).not.toHaveBeenCalled();
  });

  it('answers 200 without includeAI when AI is off', async () => {
    setOrganization('off');
    const res = await graph();
    expect(res.status).toBe(200);
    expect(aiFns.findRelatedPages).not.toHaveBeenCalled();
  });

  it('builds AI links for includeAI=true when the organization has AI on', async () => {
    s.getKnowledgeGraphSource.mockResolvedValue({
      pages: [
        { id: 1, title: 'A', slug: 'a', icon: null, tags: [], content: 'x'.repeat(150) },
        { id: 2, title: 'B', slug: 'b', icon: null, tags: [], content: 'y'.repeat(150) },
      ],
      links: [],
    });
    setOrganization('on');
    const res = await graph('?includeAI=true');
    expect(res.status).toBe(200);
    expect(aiFns.findRelatedPages).toHaveBeenCalled();
  });
});

describe("POST /api/ai/related-pages: AI on a page follows the page's organization", () => {
  const related = (body: Record<string, unknown>) =>
    request(app)
      .post('/api/ai/related-pages')
      .set('Cookie', cookie)
      .send({ content: 'c', title: 't', ...body });
  const viewer = { userId: 7, email: 'member@org.test', organizationId: ORG, teamIds: [3] };

  beforeEach(() => {
    s.getPageViewer.mockResolvedValue(viewer);
    s.checkPagePermission.mockResolvedValue(true);
    s.getWikiPage.mockImplementation(async (id: number) =>
      id === 50
        ? { id: 50, teamId: 3, organizationId: ORG }
        : id === 60
          ? { id: 60, teamId: 8, organizationId: ORG + 1 }
          : undefined
    );
  });

  it("reaches the provider function for a page of the caller's organization the caller can read", async () => {
    const res = await related({ pageId: 50 });
    expect(res.status).toBe(200);
    expect(aiFns.findRelatedPages).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a page of another organization', 60, true],
    ['a page the caller cannot read', 50, false],
    ['an unknown page', 999, true],
  ])('refuses %s with 404 before any provider call', async (_label, pageId, readable) => {
    s.checkPagePermission.mockResolvedValue(readable);
    const res = await related({ pageId });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Page not found' });
    expect(aiFns.findRelatedPages).not.toHaveBeenCalled();
    expect(s.searchWikiPages).not.toHaveBeenCalled();
  });

  it('answers the same for a page of another organization and for one the caller cannot read', async () => {
    const other = await related({ pageId: 60 });
    s.checkPagePermission.mockResolvedValue(false);
    const unreadable = await related({ pageId: 50 });
    expect(other.status).toBe(unreadable.status);
    expect(other.body).toEqual(unreadable.body);
  });

  it('hands the provider only pages the caller may list', async () => {
    const listable = { id: 1, title: 'Listed', content: 'a', tags: [] };
    const hidden = { id: 2, title: 'Hidden', content: 'b', tags: [] };
    s.searchWikiPages.mockImplementation(async (_params: unknown, options?: any) => ({
      pages: options?.readableBy ? [listable] : [listable, hidden],
    }));
    const res = await related({ pageId: 50 });
    expect(res.status).toBe(200);
    const sent = aiFns.findRelatedPages.mock.calls[0][2];
    expect(sent.map((page: any) => page.id)).toEqual([1]);
    expect(s.searchWikiPages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ readableBy: viewer })
    );
  });
});

describe('signed in with ENFORCE_AUTH_WRITES off', () => {
  beforeEach(() => {
    cfg.enforce = false;
    s.retrieveTeamScopedPages.mockResolvedValue([
      { pageId: 1, teamId: 3, slug: 'roadmap', title: 'Roadmap', snippet: 'plan', score: 0.4 },
    ]);
    s.getKnowledgeGraphSource.mockResolvedValue({
      pages: [
        { id: 1, title: 'A', slug: 'a', icon: null, tags: [], content: 'x'.repeat(150) },
        { id: 2, title: 'B', slug: 'b', icon: null, tags: [], content: 'y'.repeat(150) },
      ],
      links: [],
    });
  });
  const search = () =>
    request(app).post('/api/ai/search').set('Cookie', cookie).send({ query: 'roadmap' });
  const graph = () => request(app).get('/api/knowledge-graph?includeAI=true').set('Cookie', cookie);

  it('re-ranks AI search when the organization has AI on', async () => {
    setOrganization('on');
    const res = await search();
    expect(res.status).toBe(200);
    expect(aiFns.smartSearch).toHaveBeenCalledTimes(1);
  });

  it('keeps AI search in full-text order when the organization has AI off', async () => {
    setOrganization('off');
    const res = await search();
    expect(res.status).toBe(200);
    expect(res.body.rankingSource).toBe('fts');
    expect(aiFns.smartSearch).not.toHaveBeenCalled();
  });

  it('builds AI graph links when the organization has AI on', async () => {
    setOrganization('on');
    const res = await graph();
    expect(res.status).toBe(200);
    expect(aiFns.findRelatedPages).toHaveBeenCalled();
  });

  it('refuses AI graph links when the organization has AI off', async () => {
    setOrganization('off');
    const res = await graph();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ai_disabled');
    expect(aiFns.findRelatedPages).not.toHaveBeenCalled();
  });
});
