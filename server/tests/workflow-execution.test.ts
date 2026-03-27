/**
 * Workflow execution service tests — P5 closure proof
 *
 * Unit-tests the executeAction logic inside workflow.ts for the three outbound
 * action types whose implementation truth was under scrutiny:
 *   - webhook       (generic HTTP outbound)
 *   - slack_webhook (Slack incoming-webhook format)
 *   - send_email    (SMTP path + in-app fallback path)
 *
 * These tests verify structural correctness of the execution path:
 * - The correct transport is invoked with the expected payload
 * - Fallback behaviour is precisely what the code and docs claim
 *
 * Runtime delivery to real endpoints or real SMTP servers is not performed
 * here — that requires a live integration environment with credentials.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports of the mocked modules
// ---------------------------------------------------------------------------

// Replace global fetch with a vi.fn() so we can inspect webhook/Slack calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock nodemailer so we never open a real SMTP connection
const mockSendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

// Mock the logger to suppress console output in tests
vi.mock('../services/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock storage — all methods become vi.fn()
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
import nodemailer from 'nodemailer';
import { initWorkflowService, executeWorkflow } from '../services/workflow';
import { storage } from '../storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Workflow object for test execution */
function makeWorkflow(actionType: string, config: Record<string, unknown>) {
  return {
    id: 1,
    name: 'Test Workflow',
    description: '',
    trigger: { type: 'page_created' },
    conditions: [],
    actions: [{ type: actionType, config }],
    isActive: true,
    teamId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastRunAt: null,
    runCount: 0,
    version: 1,
  } as any;
}

const TRIGGER_CONTEXT = {
  id: 42,
  title: 'Test Page',
  teamId: 1,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSendMail.mockReset();
  initWorkflowService(storage as any);

  // Default stubs for WorkflowRun lifecycle methods
  (storage.createWorkflowRun as ReturnType<typeof vi.fn>).mockResolvedValue(1);
  (storage.updateWorkflowRun as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (storage.getWorkflowRun as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 1,
    workflowId: 1,
    status: 'success',
  });
});

afterEach(() => {
  // Remove SMTP env vars to prevent test bleed-through
  delete process.env.EMAIL_HOST;
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
});

// ---------------------------------------------------------------------------
// webhook tests
// ---------------------------------------------------------------------------
describe('TC-WFE-WEBHOOK: webhook action execution', () => {
  it('TC-WFE-001: sends an outbound fetch with the configured URL and method', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ received: true }),
    });

    const workflow = makeWorkflow('webhook', {
      url: 'https://example.com/hook',
      method: 'POST',
    });

    await executeWorkflow(workflow, TRIGGER_CONTEXT);

    // fetch must have been called exactly once for the webhook action
    const webhookCalls = mockFetch.mock.calls.filter(
      (args: any[]) => args[0] === 'https://example.com/hook'
    );
    expect(webhookCalls.length).toBe(1);

    const [url, options] = webhookCalls[0];
    expect(url).toBe('https://example.com/hook');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('TC-WFE-002: records the run when the endpoint returns a non-OK status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    const workflow = makeWorkflow('webhook', {
      url: 'https://example.com/failing-hook',
      method: 'POST',
    });

    // executeWorkflow resolves even on action failure — it records the failure
    await expect(executeWorkflow(workflow, TRIGGER_CONTEXT)).resolves.not.toThrow();
    expect(storage.updateWorkflowRun).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// slack_webhook tests
// ---------------------------------------------------------------------------
describe('TC-WFE-SLACK: slack_webhook action execution', () => {
  it('TC-WFE-003: sends Slack payload with text and optional fields', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const slackUrl = 'https://hooks.slack.com/services/T00/B00/abc123';
    const workflow = makeWorkflow('slack_webhook', {
      url: slackUrl,
      text: 'Deployment complete',
      channel: '#deploys',
      username: 'DeployBot',
      icon_emoji: ':rocket:',
    });

    await executeWorkflow(workflow, TRIGGER_CONTEXT);

    const slackCalls = mockFetch.mock.calls.filter((args: any[]) => args[0] === slackUrl);
    expect(slackCalls.length).toBe(1);

    const [, options] = slackCalls[0];
    const payload = JSON.parse(options.body);
    expect(payload.text).toBe('Deployment complete');
    expect(payload.channel).toBe('#deploys');
    expect(payload.username).toBe('DeployBot');
    expect(payload.icon_emoji).toBe(':rocket:');
  });

  it('TC-WFE-004: does not call fetch when slack_webhook URL is missing', async () => {
    const workflow = makeWorkflow('slack_webhook', {}); // no url

    await expect(executeWorkflow(workflow, TRIGGER_CONTEXT)).resolves.not.toThrow();

    // fetch should NOT have been called for a missing-URL slack_webhook
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// send_email tests
// ---------------------------------------------------------------------------
describe('TC-WFE-EMAIL: send_email action execution', () => {
  it('TC-WFE-005: calls nodemailer sendMail when SMTP is configured', async () => {
    // Simulate SMTP credentials being present
    process.env.EMAIL_HOST = 'smtp.test.local';
    process.env.EMAIL_USER = 'user@test.local';
    process.env.EMAIL_PASS = 'secret';

    mockSendMail.mockResolvedValue({ messageId: 'msg-001' });

    const workflow = makeWorkflow('send_email', {
      to: 'recipient@example.com',
      subject: 'Workflow Alert',
      message: 'A page was created.',
    });

    await executeWorkflow(workflow, TRIGGER_CONTEXT);

    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledOnce();

    const mailOpts = mockSendMail.mock.calls[0][0];
    expect(mailOpts.to).toBe('recipient@example.com');
    expect(mailOpts.subject).toBe('Workflow Alert');
    expect(mailOpts.text).toBe('A page was created.');
  });

  it('TC-WFE-006: falls back to in-app notification for numeric user ID when SMTP is absent', async () => {
    // No SMTP credentials set (afterEach clears them)
    const mockNotification = { id: 99, recipientId: 5, title: 'Alert', content: 'msg' };
    (storage.createNotification as ReturnType<typeof vi.fn>).mockResolvedValue(mockNotification);

    const workflow = makeWorkflow('send_email', {
      to: '5', // numeric user ID as string — valid fallback target
      subject: 'Alert',
      message: 'A page was created.',
    });

    await executeWorkflow(workflow, TRIGGER_CONTEXT);

    // In-app notification must have been created for user ID 5
    expect(storage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 5 })
    );
  });

  it('TC-WFE-007: does not create in-app notification when recipient is an email address string and SMTP is absent', async () => {
    // No SMTP credentials (afterEach clears; beforeEach does not set them)
    // email strings are NOT resolved to user IDs by the fallback

    const workflow = makeWorkflow('send_email', {
      to: 'user@example.com', // email string — fallback cannot handle this
      subject: 'Alert',
      message: 'A page was created.',
    });

    await executeWorkflow(workflow, TRIGGER_CONTEXT);

    // createNotification should NOT have been called — email string is skipped
    expect(storage.createNotification).not.toHaveBeenCalled();

    // The run lifecycle must still be recorded (success=false with note)
    expect(storage.updateWorkflowRun).toHaveBeenCalled();
  });
});
