/**
 * Workflow action validation tests — P5 closure proof
 *
 * Verifies:
 * 1. Schema actionTypes includes all required action kinds
 * 2. POST /api/workflows accepts slack_webhook actions with valid config
 * 3. POST /api/workflows accepts send_email actions with valid config
 * 4. POST /api/workflows rejects slack_webhook actions missing URL
 * 5. POST /api/workflows rejects send_email actions missing required fields
 * 6. POST /api/workflows accepts webhook actions with valid config
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'workflow-action-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'workflow-action-test-secret',
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
    FEATURE_TEAMS: true,
    FEATURE_NOTIFICATIONS: true,
    FEATURE_ADMIN: true,
    FEATURE_CALENDAR: true,
    FEATURE_AI_SEARCH: false,
    FEATURE_AUTOMATION: true,
    FEATURE_SSO: false,
    FEATURE_DATABASE_VIEWS: false,
  },
  isFeatureEnabled: (key: string) => key === 'FEATURE_AUTOMATION',
}));

vi.mock('../services/workflow', () => ({
  triggerWorkflows: vi.fn().mockResolvedValue(undefined),
  initWorkflowService: vi.fn(),
  executeWorkflow: vi.fn().mockResolvedValue({ success: true }),
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

import { storage } from '../storage';

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

afterAll(() => {
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// Schema-level tests (pure unit, no HTTP)
// ---------------------------------------------------------------------------
describe('TC-WF-SCHEMA: actionTypes schema', () => {
  it('includes webhook, slack_webhook, send_email, and run_ai_summary', async () => {
    const { actionTypes } = await import('../../shared/schema');
    const required = ['webhook', 'slack_webhook', 'send_email', 'run_ai_summary'] as const;
    for (const type of required) {
      expect(actionTypes).toContain(type);
    }
  });
});

// ---------------------------------------------------------------------------
// API-level tests
// ---------------------------------------------------------------------------
describe('TC-WF-API: POST /api/workflows action validation', () => {
  const token = jwt.sign({ id: 1, email: 'user@wf-test.com', role: 'user' }, TEST_SECRET);
  const authCookie = [`accessToken=${token}`];

  const baseWorkflow = {
    name: 'Test Workflow',
    description: '',
    trigger: { type: 'page_created' },
    conditions: [],
    isActive: false,
  };

  beforeEach(() => {
    // Storage stubs required by requireTeamMembership + workflow creation
    (storage.getUserTeamIds as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (storage.createWorkflow as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      ...baseWorkflow,
    });
  });

  it('TC-WF-001: accepts a webhook action with valid URL', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Cookie', authCookie)
      .send({
        ...baseWorkflow,
        actions: [{ type: 'webhook', config: { url: 'https://example.com/hook', method: 'POST' } }],
      });

    expect(res.status).toBe(201);
    expect(storage.createWorkflow).toHaveBeenCalledOnce();
  });

  it('TC-WF-002: accepts a slack_webhook action with valid URL', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Cookie', authCookie)
      .send({
        ...baseWorkflow,
        actions: [
          {
            type: 'slack_webhook',
            config: { url: 'https://hooks.slack.com/T0/B0/abc', method: 'POST' },
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(storage.createWorkflow).toHaveBeenCalledOnce();
  });

  it('TC-WF-003: accepts a send_email action with valid config', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Cookie', authCookie)
      .send({
        ...baseWorkflow,
        actions: [
          {
            type: 'send_email',
            config: {
              recipients: 'user@example.com',
              subject: 'Hello',
              message: 'World',
            },
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(storage.createWorkflow).toHaveBeenCalledOnce();
  });

  it('TC-WF-004: rejects a slack_webhook action missing URL', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Cookie', authCookie)
      .send({
        ...baseWorkflow,
        actions: [{ type: 'slack_webhook', config: {} }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/url/i);
    expect(storage.createWorkflow).not.toHaveBeenCalled();
  });

  it('TC-WF-005: rejects a send_email action missing subject', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Cookie', authCookie)
      .send({
        ...baseWorkflow,
        actions: [
          {
            type: 'send_email',
            config: { recipients: 'user@example.com', message: 'No subject' },
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subject/i);
    expect(storage.createWorkflow).not.toHaveBeenCalled();
  });

  it('TC-WF-006: rejects a send_email action missing recipients', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set('Cookie', authCookie)
      .send({
        ...baseWorkflow,
        actions: [
          {
            type: 'send_email',
            config: { subject: 'Hello', message: 'World' },
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/recipient/i);
    expect(storage.createWorkflow).not.toHaveBeenCalled();
  });
});
