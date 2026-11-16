/**
 * AI access per organization member (#124 X1c P5a), on the real routes with a mocked storage and
 * spies in place of the AI provider functions.
 *
 * Rules under test: content reaches a provider function only when the caller's organization has
 * AI on and the caller has been granted AI. decideAiAccess answers in a fixed order (no
 * organization, switch off, not granted, allowed); a member without the grant gets 403
 * `ai_not_granted` from every AI route before the body is looked at; the search route keeps
 * answering in full-text order and the knowledge graph refuses AI links; without a session the
 * answer is 401 whatever ENFORCE_AUTH_WRITES says.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const SECRET = 'ai-access-secret';

const cfg = vi.hoisted(() => ({ enforce: true }));

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'ai-access-secret',
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
import { decideAiAccess } from '../organization-guards';

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

type AccessState =
  | 'granted'
  | 'not-granted'
  | 'grant-missing'
  | 'off'
  | 'off-not-granted'
  | 'none'
  | 'lookup-fails';

// The membership as getOrganizationMembership answers it, and the organization switch.
function setAccess(state: AccessState) {
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
  const membership: Record<string, unknown> = { organizationId: ORG, role: 'member' };
  if (state === 'granted' || state === 'off') membership.aiAllowed = true;
  if (state === 'not-granted' || state === 'off-not-granted') membership.aiAllowed = false;
  s.getOrganizationMembership.mockResolvedValue(membership);
  s.isOrganizationAiEnabled.mockResolvedValue(!state.startsWith('off'));
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
  s.searchWikiPages.mockResolvedValue({
    pages: [{ id: 1, title: 'Other', content: 'c', tags: [] }],
  });
  s.getKnowledgeGraphSource.mockResolvedValue({
    pages: [{ id: 1, title: 'A', slug: 'a', icon: null, tags: [], content: 'body' }],
    links: [],
  });
  setAccess('granted');
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

describe('decideAiAccess', () => {
  const org = { organizationId: ORG };
  const grants: Array<[string, unknown]> = [
    ['true', true],
    ['false', false],
    ['missing', undefined],
    ["the string 'true'", 'true'],
    ['the number 1', 1],
  ];

  it('is no_organization without a membership, whatever the switch says', () => {
    expect(decideAiAccess(null, true)).toBe('no_organization');
    expect(decideAiAccess(null, false)).toBe('no_organization');
  });

  for (const [label, value] of grants) {
    it(`switch off is ai_disabled with the grant ${label}`, () => {
      expect(decideAiAccess({ ...org, aiAllowed: value }, false)).toBe('ai_disabled');
    });
    it(`switch on with the grant ${label} is ${value === true ? 'allowed' : 'ai_not_granted'}`, () => {
      expect(decideAiAccess({ ...org, aiAllowed: value }, true)).toBe(
        value === true ? 'allowed' : 'ai_not_granted'
      );
    });
  }

  it('treats a membership without the field as not granted', () => {
    expect(decideAiAccess({ ...org }, true)).toBe('ai_not_granted');
  });
});

describe.each(routes)('POST $path', ({ path, body, spy, invalid }) => {
  const post = (b: Record<string, unknown> = body) =>
    request(app).post(path).set('Cookie', cookie).send(b);

  it.each(['not-granted', 'grant-missing'] as const)(
    'a member without AI access (%s) gets 403 ai_not_granted with a valid and an invalid body, and no provider function runs',
    async (state) => {
      setAccess(state);
      for (const b of [body, invalid]) {
        const res = await post(b);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          code: 'ai_not_granted',
          message: 'AI has not been granted to your account',
        });
      }
      for (const fn of providerSpies()) expect(fn).not.toHaveBeenCalled();
    }
  );

  it.each(['off', 'off-not-granted'] as const)(
    'the organization switch off answers ai_disabled (%s)',
    async (state) => {
      setAccess(state);
      const res = await post();
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ai_disabled');
      for (const fn of providerSpies()) expect(fn).not.toHaveBeenCalled();
    }
  );

  it('calls the provider function for a granted member of an organization with AI on', async () => {
    setAccess('granted');
    const res = await post();
    expect(res.status).toBe(200);
    expect(spy()).toHaveBeenCalledTimes(1);
  });

  it('a failing membership lookup refuses with 500 and no provider function runs', async () => {
    setAccess('lookup-fails');
    const res = await post();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Organization check failed' });
    for (const fn of providerSpies()) expect(fn).not.toHaveBeenCalled();
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
    setAccess('not-granted');
    const refused = await post();
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('ai_not_granted');
    setAccess('granted');
    expect((await post()).status).toBe(200);
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

  it.each(['not-granted', 'grant-missing', 'off', 'none', 'lookup-fails'] as const)(
    'answers 200 in full-text order and does not call smartSearch when the state is %s',
    async (state) => {
      // 'off' here is a granted member of an organization with the switch off
      setAccess(state);
      const res = await search();
      expect(res.status).toBe(200);
      expect(res.body.rankingSource).toBe('fts');
      expect(aiFns.smartSearch).not.toHaveBeenCalled();
    }
  );

  it('calls smartSearch for a granted member', async () => {
    setAccess('granted');
    expect((await search()).status).toBe(200);
    expect(aiFns.smartSearch).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/knowledge-graph', () => {
  const graph = (query = '') =>
    request(app).get(`/api/knowledge-graph${query}`).set('Cookie', cookie);

  it('includeAI=true without AI access is 403 ai_not_granted before any page is read', async () => {
    setAccess('not-granted');
    const res = await graph('?includeAI=true');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      code: 'ai_not_granted',
      message: 'AI has not been granted to your account',
    });
    expect(s.getKnowledgeGraphSource).not.toHaveBeenCalled();
    expect(aiFns.findRelatedPages).not.toHaveBeenCalled();
  });

  it('includeAI=true with the switch off is 403 ai_disabled', async () => {
    setAccess('off-not-granted');
    const res = await graph('?includeAI=true');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ai_disabled');
  });

  it('includeAI=true without an organization is 403, and a failing lookup is 500', async () => {
    setAccess('none');
    const none = await graph('?includeAI=true');
    expect(none.status).toBe(403);
    expect(none.body).toEqual({ message: 'Your account does not belong to an organization' });
    setAccess('lookup-fails');
    const failed = await graph('?includeAI=true');
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ message: 'Organization check failed' });
    expect(s.getKnowledgeGraphSource).not.toHaveBeenCalled();
    expect(aiFns.findRelatedPages).not.toHaveBeenCalled();
  });

  it('answers 401 for includeAI=true without a session in both modes', async () => {
    for (const enforce of [true, false]) {
      cfg.enforce = enforce;
      expect((await request(app).get('/api/knowledge-graph?includeAI=true')).status).toBe(401);
    }
  });

  it('answers 200 without includeAI for a member without AI access', async () => {
    setAccess('not-granted');
    expect((await graph()).status).toBe(200);
    expect(aiFns.findRelatedPages).not.toHaveBeenCalled();
  });

  it('builds AI links for a granted member', async () => {
    s.getKnowledgeGraphSource.mockResolvedValue({
      pages: [
        { id: 1, title: 'A', slug: 'a', icon: null, tags: [], content: 'x'.repeat(150) },
        { id: 2, title: 'B', slug: 'b', icon: null, tags: [], content: 'y'.repeat(150) },
      ],
      links: [],
    });
    setAccess('granted');
    expect((await graph('?includeAI=true')).status).toBe(200);
    expect(aiFns.findRelatedPages).toHaveBeenCalled();
  });
});
