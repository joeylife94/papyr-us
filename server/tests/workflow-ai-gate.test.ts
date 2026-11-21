/**
 * The automated `run_ai_summary` action obeys the AI setting of the organization of the team the
 * workflow runs for (#124 X1c P3), on server/services/workflow.ts with a mocked storage and a spy
 * in place of the provider function. The organization never comes from the trigger data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../services/ai', () => ({
  isAIAvailable: vi.fn(() => true),
  summarizeContent: vi.fn(),
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { executeWorkflow, initWorkflowService, triggerWorkflows } from '../services/workflow';
import * as ai from '../services/ai';
import { storage as mockedStorage } from '../storage';

const storage: any = mockedStorage;
const summarize = (ai as any).summarizeContent as ReturnType<typeof vi.fn>;

const TEAM = 5;
const OTHER_TEAM = 9;
const ORG = 2;
const OTHER_ORG = 3;
const OFF_MESSAGE = 'AI is turned off for this organization';

const workflow = (teamId: unknown = TEAM) =>
  ({
    id: 1,
    name: 'Summarize',
    description: '',
    trigger: { type: 'page_created', config: {} },
    conditions: [],
    actions: [{ type: 'run_ai_summary', config: {} }],
    isActive: true,
    teamId,
  }) as any;

let lastRun: any;

beforeEach(() => {
  vi.clearAllMocks();
  initWorkflowService(storage);
  lastRun = undefined;
  storage.createWorkflowRun.mockResolvedValue(77);
  storage.updateWorkflowRun.mockImplementation(async (_id: number, update: any) => {
    lastRun = { id: 77, ...update };
  });
  storage.getWorkflowRun.mockImplementation(async () => lastRun);
  storage.getActiveWorkflowsByTrigger.mockResolvedValue([]);
  storage.getTeamOrganizationId.mockImplementation(async (teamId: number) =>
    teamId === TEAM ? ORG : teamId === OTHER_TEAM ? OTHER_ORG : null
  );
  storage.isOrganizationAiEnabled.mockImplementation(async (id: number | null) => id === ORG);
  summarize.mockResolvedValue({ summary: 'short', keyPoints: [], suggestedTags: [] });
});

describe('run_ai_summary through executeWorkflow', () => {
  it('calls the provider function when the workflow team organization has AI on', async () => {
    const run = await executeWorkflow(workflow(), { id: 1, content: 'page body', teamId: TEAM });
    expect(summarize).toHaveBeenCalledWith('page body');
    expect(run.status).toBe('success');
  });

  it('does not call the provider function when the organization has AI off', async () => {
    storage.isOrganizationAiEnabled.mockResolvedValue(false);
    const run = await executeWorkflow(workflow(), { id: 1, content: 'page body', teamId: TEAM });
    expect(summarize).not.toHaveBeenCalled();
    expect(run.status).toBe('failed');
    expect(run.error).toBe(OFF_MESSAGE);
    expect(run.results).toEqual([{ action: 'run_ai_summary', success: false, error: OFF_MESSAGE }]);
  });

  it('follows the workflow team, not a team named in the trigger data', async () => {
    // the workflow belongs to the team whose organization has AI off; the trigger names one with it on
    const run = await executeWorkflow(workflow(OTHER_TEAM), {
      id: 1,
      content: 'page body',
      teamId: TEAM,
      organizationId: ORG,
      workflow: { teamId: TEAM },
    });
    expect(storage.getTeamOrganizationId).toHaveBeenCalledWith(OTHER_TEAM);
    expect(summarize).not.toHaveBeenCalled();
    expect(run.error).toBe(OFF_MESSAGE);
  });

  it.each([
    ['the team has no organization', () => storage.getTeamOrganizationId.mockResolvedValue(null)],
    [
      'the team lookup fails',
      () => storage.getTeamOrganizationId.mockRejectedValue(new Error('db down')),
    ],
    [
      'the setting lookup fails',
      () => storage.isOrganizationAiEnabled.mockRejectedValue(new Error('db down')),
    ],
  ])('does not call the provider function when %s', async (_label, arrange) => {
    arrange();
    const run = await executeWorkflow(workflow(), { id: 1, content: 'page body', teamId: TEAM });
    expect(summarize).not.toHaveBeenCalled();
    expect(run.status).toBe('failed');
    expect(run.error).toBe(OFF_MESSAGE);
  });

  it('keeps refusing a workflow without a team before any lookup', async () => {
    const run = await executeWorkflow(workflow(null), { id: 1, content: 'page body' });
    expect(summarize).not.toHaveBeenCalled();
    expect(storage.getTeamOrganizationId).not.toHaveBeenCalled();
    expect(run.status).toBe('failed');
  });
});

describe('run_ai_summary through triggerWorkflows', () => {
  const runTriggered = async (data: Record<string, any>, teamId: number = TEAM) => {
    storage.getActiveWorkflowsByTrigger.mockResolvedValue([workflow(teamId)]);
    await triggerWorkflows('page_created', data);
    await vi.waitFor(() => expect(storage.updateWorkflowRun).toHaveBeenCalled());
  };

  it('does not call the provider function when the organization of the event team has AI off', async () => {
    storage.isOrganizationAiEnabled.mockResolvedValue(false);
    await runTriggered({ id: 1, content: 'page body', teamId: TEAM });
    expect(summarize).not.toHaveBeenCalled();
    expect(lastRun.status).toBe('failed');
    expect(lastRun.error).toBe(OFF_MESSAGE);
  });

  it('calls the provider function when the organization has AI on', async () => {
    await runTriggered({ id: 1, content: 'page body', teamId: TEAM });
    expect(summarize).toHaveBeenCalledWith('page body');
    expect(lastRun.status).toBe('success');
  });
});
