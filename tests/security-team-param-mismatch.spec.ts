/**
 * Team routes act on the team requireTeamMembership checked (issue #132), end to end against the
 * real server, authentication, team membership and PostgreSQL. Synthetic users and teams only.
 * The route-level rules for every route are in server/tests/team-source-mismatch.test.ts.
 *
 * A request may name its team in the path, the query and the body. The check used to read the
 * first one present, so a caller could have their own team checked in the query while the
 * handler wrote into another team named in the body; and a team named by its name became NaN in
 * the calendar, which then read the events of every team.
 *
 * Rules under test:
 * - markdown import, task and workflow creation refuse a query team and a body team that differ
 *   (400 `teamId mismatch`) and write nothing into the other team;
 * - markdown import into the caller's own team still works, the team named by id or by name;
 * - the calendar of a team named by its name holds that team's events only;
 * - a file upload naming another team in its multipart body is refused (the check used to run
 *   before the multipart body was read).
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

type Team = { id: number; name: string };
type Titled = { id: number; title?: string; name?: string; teamId?: number | string | null };

function listOf(body: unknown, key: string): Titled[] {
  if (Array.isArray(body)) return body;
  return ((body as Record<string, Titled[]> | null)?.[key] ?? []) as Titled[];
}

test.describe('Team routes act on the team that was checked', () => {
  const stamp = Date.now();
  let callerRequest: APIRequestContext;
  let otherRequest: APIRequestContext;
  let own: Team;
  let other: Team;
  const cleanup: Array<() => Promise<unknown>> = [];

  test.beforeAll(async ({ request }) => {
    const caller = await registerTestUser(request, 'mismatch-caller');
    const otherOwner = await registerTestUser(request, 'mismatch-other');
    callerRequest = await createAuthenticatedApiContext(caller.email, caller.password);
    otherRequest = await createAuthenticatedApiContext(otherOwner.email, otherOwner.password);

    const createTeam = async (ctx: APIRequestContext, name: string): Promise<Team> => {
      const response = await ctx.post('/api/teams', {
        data: { name: `${name}-${stamp}`, displayName: `${name} ${stamp}` },
      });
      expect(response.status(), `create team ${name}`).toBe(201);
      const team = (await response.json()) as Team;
      cleanup.push(() => ctx.delete(`/api/teams/${team.id}`));
      return team;
    };
    own = await createTeam(callerRequest, 'mismatch-own');
    other = await createTeam(otherRequest, 'mismatch-other');
  });

  test.afterAll(async () => {
    for (const step of cleanup.reverse()) await step().catch(() => {});
    await callerRequest?.dispose();
    await otherRequest?.dispose();
  });

  const otherTeamPageTitles = async () => {
    const listed = await otherRequest.get(`/api/pages?teamId=${other.id}&limit=100`);
    expect(listed.status()).toBe(200);
    return listOf(await listed.json(), 'pages').map((p) => p.title);
  };

  test('markdown import into another team named in the body is refused', async () => {
    const title = `Mismatch import ${stamp}`;
    const refused = await callerRequest.post(`/api/pages/import/markdown?teamId=${own.id}`, {
      data: { title, content: `# ${title}`, teamId: other.id },
    });
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toEqual({ message: 'teamId mismatch' });
    expect(await otherTeamPageTitles()).not.toContain(title);

    // Without the query, the body team is checked itself
    const direct = await callerRequest.post('/api/pages/import/markdown', {
      data: { title, content: `# ${title}`, teamId: other.id },
    });
    expect(direct.status()).toBe(403);
    expect(await otherTeamPageTitles()).not.toContain(title);
  });

  test('markdown import into the caller’s own team works by id and by name', async () => {
    for (const [label, query, teamId] of [
      ['id', `?teamId=${own.id}`, own.id],
      ['name', '', own.name],
    ] as const) {
      const response = await callerRequest.post(`/api/pages/import/markdown${query}`, {
        data: { title: `Own import by ${label} ${stamp}`, content: '# Notes', teamId },
      });
      expect(response.status(), label).toBe(201);
      const page = (await response.json()) as Titled;
      cleanup.push(() => callerRequest.delete(`/api/pages/${page.id}`));
      expect(page.teamId, label).toBe(own.id);
    }
  });

  test('tasks and workflows are not created in another team named in the body', async () => {
    const taskTitle = `Mismatch task ${stamp}`;
    const task = await callerRequest.post(`/api/tasks?teamId=${own.id}`, {
      data: { title: taskTitle, teamId: String(other.id) },
    });
    expect(task.status()).toBe(400);
    const otherTasks = await otherRequest.get(`/api/tasks?teamId=${other.id}`);
    expect(otherTasks.status()).toBe(200);
    expect(listOf(await otherTasks.json(), 'tasks').map((t) => t.title)).not.toContain(taskTitle);

    const workflowName = `Mismatch workflow ${stamp}`;
    const workflow = await callerRequest.post(`/api/workflows?teamId=${own.id}`, {
      data: {
        name: workflowName,
        createdBy: 'mismatch-caller',
        teamId: other.id,
        trigger: { type: 'page_created' },
        actions: [{ type: 'send_notification', config: { message: 'page created' } }],
      },
    });
    expect(workflow.status()).toBe(400);
    const otherWorkflows = await otherRequest.get(`/api/workflows?teamId=${other.id}`);
    expect(otherWorkflows.status()).toBe(200);
    expect(listOf(await otherWorkflows.json(), 'workflows').map((w) => w.name)).not.toContain(
      workflowName
    );
  });

  test('the calendar of a team named by its name holds only that team’s events', async () => {
    const createEvent = async (ctx: APIRequestContext, team: Team, title: string) => {
      const response = await ctx.post('/api/calendar', {
        data: { title, startDate: '2026-11-20T10:00:00.000Z', teamId: String(team.id) },
      });
      expect(response.status(), `create ${title}`).toBe(201);
      const event = (await response.json()) as Titled;
      cleanup.push(() => ctx.delete(`/api/calendar/event/${event.id}`));
      return event;
    };
    const ownEvent = await createEvent(callerRequest, own, `Own event ${stamp}`);
    const otherEvent = await createEvent(otherRequest, other, `Other event ${stamp}`);

    for (const path of [
      `/api/calendar/${encodeURIComponent(own.name)}`,
      `/api/calendar?teamId=${encodeURIComponent(own.name)}`,
      `/api/calendar/${own.id}`,
    ]) {
      const response = await callerRequest.get(path);
      expect(response.status(), path).toBe(200);
      const ids = listOf(await response.json(), 'events').map((e) => e.id);
      expect(ids, path).toContain(ownEvent.id);
      expect(ids, path).not.toContain(otherEvent.id);
    }

    // Another team's calendar stays closed, by id or by name
    for (const ref of [String(other.id), encodeURIComponent(other.name)]) {
      expect((await callerRequest.get(`/api/calendar/${ref}`)).status(), ref).toBe(403);
    }
  });

  test('a file upload naming another team in its multipart body is refused', async () => {
    for (const query of ['', `?teamId=${own.id}`]) {
      const response = await callerRequest.post(`/api/upload${query}`, {
        multipart: {
          teamId: String(other.id),
          files: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
        },
      });
      expect(response.status(), `upload${query}`).toBe(query ? 400 : 403);
    }
    const otherFiles = await otherRequest.get(`/api/uploads?teamId=${other.id}`);
    expect(otherFiles.status()).toBe(200);
    expect(await otherFiles.json()).toEqual({ images: [], files: [] });
  });
});
