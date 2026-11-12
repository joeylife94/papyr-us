/**
 * Workflow fan-out and action confinement (#124 X1b, decision D4), on server/services/workflow.ts
 * with a mocked storage.
 *
 * Rules under test:
 * - an event with no team (a personal page, a daily note) fires no workflow and asks storage
 *   for none; an event of a team asks for that team's workflows only (a string id from a task
 *   event is normalised; anything that is not a positive integer counts as no team);
 * - a workflow that has no team does not run its actions;
 * - every action acts only inside the workflow's own team, whatever the trigger data names:
 *   pages and tasks of another team are not found, created objects land in the workflow's team,
 *   and notifications go only to members of the workflow team's organization.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { executeWorkflow, initWorkflowService, triggerWorkflows } from '../services/workflow';
import { storage as mockedStorage } from '../storage';

const storage: any = mockedStorage;

const TEAM = 5;
const OTHER_TEAM = 9;

const workflowWith = (action: { type: string; config: Record<string, unknown> }, teamId = TEAM) =>
  ({
    id: 1,
    name: 'W',
    description: '',
    trigger: { type: 'page_created', config: {} },
    conditions: [],
    actions: [action],
    isActive: true,
    teamId,
  }) as any;

const page = (id: number, teamId: number | null, tags: string[] = []) => ({
  id,
  teamId,
  tags,
  title: `Page ${id}`,
});

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
  storage.createComment.mockResolvedValue({ id: 1 });
  storage.updateWikiPage.mockResolvedValue({});
  storage.createWikiPage.mockImplementation(async (data: any) => ({ id: 100, ...data }));
  storage.createTask.mockImplementation(async (data: any) => ({ id: 200, ...data }));
  storage.updateTask.mockResolvedValue({});
  storage.createNotification.mockImplementation(async (data: any) => ({ id: 300, ...data }));
  storage.getActiveWorkflowsByTrigger.mockResolvedValue([]);
});

const noWrites = () => {
  expect(storage.createComment).not.toHaveBeenCalled();
  expect(storage.updateWikiPage).not.toHaveBeenCalled();
  expect(storage.createWikiPage).not.toHaveBeenCalled();
  expect(storage.createTask).not.toHaveBeenCalled();
  expect(storage.updateTask).not.toHaveBeenCalled();
  expect(storage.createNotification).not.toHaveBeenCalled();
};

describe('fan-out of an event', () => {
  it.each([null, undefined, '', 0, 'team1', NaN, -3, 2.5, {}])(
    'asks storage for nothing and runs nothing when the event team is %j',
    async (teamId) => {
      await triggerWorkflows('page_created', { id: 1, title: 'Personal', teamId });
      expect(storage.getActiveWorkflowsByTrigger).not.toHaveBeenCalled();
      expect(storage.createWorkflowRun).not.toHaveBeenCalled();
    }
  );

  it('does not run workflows storage returns for a team-less event', async () => {
    storage.getActiveWorkflowsByTrigger.mockResolvedValue([
      workflowWith({ type: 'add_tag', config: { tags: ['x'] } }),
    ]);
    await triggerWorkflows('page_created', { id: 1, teamId: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(storage.createWorkflowRun).not.toHaveBeenCalled();
  });

  it('asks storage for the event team, from a number or a numeric string', async () => {
    await triggerWorkflows('page_created', { id: 1, teamId: TEAM });
    expect(storage.getActiveWorkflowsByTrigger).toHaveBeenLastCalledWith('page_created', TEAM);

    await triggerWorkflows('task_created', { id: 1, teamId: String(TEAM) });
    expect(storage.getActiveWorkflowsByTrigger).toHaveBeenLastCalledWith('task_created', TEAM);
  });

  it("runs the matching workflows of the event's team", async () => {
    storage.getActiveWorkflowsByTrigger.mockResolvedValue([
      workflowWith({ type: 'add_comment', config: { message: 'hi' } }),
    ]);
    storage.getWikiPage.mockResolvedValue(page(1, TEAM));
    await triggerWorkflows('page_created', { id: 1, teamId: TEAM });
    await vi.waitFor(() => expect(storage.createComment).toHaveBeenCalledTimes(1));
  });
});

describe('a workflow without a team', () => {
  it('does not run its actions; the run is recorded as failed', async () => {
    const run = await executeWorkflow(
      workflowWith({ type: 'add_comment', config: { message: 'x' } }, null as any),
      { id: 1 }
    );
    expect(run.status).toBe('failed');
    noWrites();
  });
});

describe.each(['add_comment', 'add_tag', 'move_page'])('%s', (type) => {
  const config = { message: 'm', tags: ['x'], folder: 'moved' };

  it('fails on a page of another team and writes nothing', async () => {
    storage.getWikiPage.mockResolvedValue(page(40, OTHER_TEAM));
    const run = await executeWorkflow(workflowWith({ type, config }), {
      id: 40,
      teamId: OTHER_TEAM,
    });
    expect(run.status).toBe('failed');
    expect(run.error).toBe('Page not found');
    noWrites();
  });

  it('fails on a team-less page and writes nothing', async () => {
    storage.getWikiPage.mockResolvedValue(page(41, null));
    const run = await executeWorkflow(workflowWith({ type, config }), { id: 41, teamId: TEAM });
    expect(run.status).toBe('failed');
    expect(run.error).toBe('Page not found');
    noWrites();
  });

  it('fails on a page that is not live and writes nothing', async () => {
    storage.getWikiPage.mockResolvedValue(undefined);
    const run = await executeWorkflow(workflowWith({ type, config }), { id: 42, teamId: TEAM });
    expect(run.status).toBe('failed');
    noWrites();
  });

  it('acts on a page of the workflow team, whatever teamId the trigger data claims', async () => {
    storage.getWikiPage.mockResolvedValue(page(43, TEAM, ['old']));
    const run = await executeWorkflow(workflowWith({ type, config }), {
      id: 43,
      teamId: OTHER_TEAM,
    });
    expect(run.status).toBe('success');
    expect(storage.getWikiPage).toHaveBeenCalledWith(43);
    if (type === 'add_comment') {
      expect(storage.createComment).toHaveBeenCalledWith(expect.objectContaining({ pageId: 43 }));
    } else if (type === 'add_tag') {
      expect(storage.updateWikiPage).toHaveBeenCalledWith(43, { tags: ['old', 'x'] });
    } else {
      expect(storage.updateWikiPage).toHaveBeenCalledWith(43, { folder: 'moved' });
    }
  });
});

describe('add_tag', () => {
  it('reads the page with getWikiPage, not an instance-wide search', async () => {
    storage.getWikiPage.mockResolvedValue(page(43, TEAM));
    await executeWorkflow(workflowWith({ type: 'add_tag', config: { tags: ['x'] } }), { id: 43 });
    expect(storage.searchWikiPages).not.toHaveBeenCalled();
  });
});

describe.each(['update_task', 'assign_task'])('%s', (type) => {
  const config = { status: 'done', assignedTo: 'someone' };

  it('fails on a task of another team and writes nothing', async () => {
    storage.getTask.mockResolvedValue({ id: 60, teamId: String(OTHER_TEAM) });
    const run = await executeWorkflow(workflowWith({ type, config }), { id: 60, teamId: TEAM });
    expect(run.status).toBe('failed');
    expect(run.error).toBe('Task not found');
    noWrites();
  });

  it('fails on a missing task and writes nothing', async () => {
    storage.getTask.mockResolvedValue(undefined);
    const run = await executeWorkflow(workflowWith({ type, config }), { id: 61, teamId: TEAM });
    expect(run.status).toBe('failed');
    noWrites();
  });

  it('acts on a task of the workflow team (team id stored as text)', async () => {
    storage.getTask.mockResolvedValue({ id: 62, teamId: String(TEAM) });
    const run = await executeWorkflow(workflowWith({ type, config }), {
      id: 62,
      teamId: OTHER_TEAM,
    });
    expect(run.status).toBe('success');
    expect(storage.updateTask).toHaveBeenCalledWith(62, expect.any(Object));
  });
});

describe('create_page and create_task', () => {
  it("create_page puts the page in the workflow's team, not the trigger's", async () => {
    const run = await executeWorkflow(
      workflowWith({ type: 'create_page', config: { title: 'Made' } }),
      { teamId: OTHER_TEAM, author: 'a@example.com' }
    );
    expect(run.status).toBe('success');
    expect(storage.createWikiPage).toHaveBeenCalledWith(expect.objectContaining({ teamId: TEAM }));
  });

  it('create_page has a team even when the trigger carries none', async () => {
    await executeWorkflow(workflowWith({ type: 'create_page', config: { title: 'Made' } }), {});
    expect(storage.createWikiPage).toHaveBeenCalledWith(expect.objectContaining({ teamId: TEAM }));
  });

  it("create_task puts the task in the workflow's team, not the trigger's", async () => {
    await executeWorkflow(workflowWith({ type: 'create_task', config: { title: 'T' } }), {
      teamId: OTHER_TEAM,
    });
    expect(storage.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: String(TEAM) })
    );
  });
});

describe('send_notification', () => {
  const run = (recipients: unknown[]) =>
    executeWorkflow(
      workflowWith({ type: 'send_notification', config: { message: 'hello', recipients } }),
      { id: 1 }
    );

  beforeEach(() => {
    storage.getTeamOrganizationId.mockResolvedValue(1);
    storage.getMemberOrganizationId.mockImplementation(async (id: number) =>
      id === 11 ? 1 : id === 12 ? 2 : null
    );
  });

  it("notifies members of the workflow team's organization only", async () => {
    const result = await run([11, 12, 13]);
    expect(storage.getTeamOrganizationId).toHaveBeenCalledWith(TEAM);
    expect(storage.createNotification).toHaveBeenCalledTimes(1);
    expect(storage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 11 })
    );
    expect(result.status).toBe('success');
  });

  it('fails the action when no recipient is in the organization', async () => {
    const result = await run([12, 13]);
    expect(storage.createNotification).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });

  it('sends nothing when the workflow team has no organization', async () => {
    storage.getTeamOrganizationId.mockResolvedValue(null);
    const result = await run([11]);
    expect(storage.createNotification).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });

  it('skips a recipient whose organization lookup fails', async () => {
    storage.getMemberOrganizationId.mockImplementation(async (id: number) => {
      if (id === 11) throw new Error('boom');
      return 1;
    });
    await run([11, 14]);
    expect(storage.createNotification).toHaveBeenCalledTimes(1);
    expect(storage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 14 })
    );
  });
});

describe('writes use the id of the row that was loaded and checked', () => {
  it.each(['add_comment', 'add_tag', 'move_page'])(
    '%s with a string trigger id writes with the page row id',
    async (type) => {
      storage.getWikiPage.mockResolvedValue(page(12, TEAM));
      const run = await executeWorkflow(
        workflowWith({ type, config: { message: 'm', tags: ['x'], folder: 'f' } }),
        { id: '12' }
      );
      expect(run.status).toBe('success');
      expect(storage.getWikiPage).toHaveBeenCalledWith(12);
      if (type === 'add_comment') {
        expect(storage.createComment).toHaveBeenCalledWith(expect.objectContaining({ pageId: 12 }));
      } else {
        expect(storage.updateWikiPage).toHaveBeenCalledWith(12, expect.any(Object));
      }
    }
  );

  it.each(['update_task', 'assign_task'])(
    '%s with a string trigger id writes with the task row id',
    async (type) => {
      storage.getTask.mockResolvedValue({ id: 12, teamId: String(TEAM) });
      const run = await executeWorkflow(workflowWith({ type, config: { status: 'done' } }), {
        id: '12',
      });
      expect(run.status).toBe('success');
      expect(storage.updateTask).toHaveBeenCalledWith(12, expect.any(Object));
    }
  );
});
