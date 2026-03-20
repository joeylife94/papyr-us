import { test, expect, type APIRequestContext } from '@playwright/test';
import { registerTestUser, authHeader } from './e2e-helpers';

/**
 * Workflow Team Scope E2E Tests
 *
 * Validates that:
 * - Workflows can be created with a team scope (string teamName resolved to numeric teamId)
 * - GET /api/workflows?teamId=<name> returns only that team's workflows
 * - Workflows scoped to team A don't appear in team B queries
 */

let token: string;

test.beforeAll(async ({ request }) => {
  const result = await registerTestUser(request, 'wf-scope');
  token = result.token;
});

async function createTeam(
  request: APIRequestContext,
  name: string,
  headers: Record<string, string>
) {
  const resp = await request.post('/api/teams', {
    headers,
    data: { name, displayName: `Team ${name}`, description: `E2E workflow team ${name}` },
  });
  expect(resp.status()).toBe(201);
  return resp.json();
}

async function createWorkflow(
  request: APIRequestContext,
  name: string,
  teamId: number | string,
  headers: Record<string, string>
) {
  const resp = await request.post('/api/workflows', {
    headers,
    data: {
      name,
      description: `E2E workflow ${name}`,
      teamId,
      isActive: true,
      trigger: { type: 'page_created', config: {} },
      actions: [{ type: 'add_label', config: { label: 'auto' } }],
      conditions: [],
      createdBy: 'e2e-test',
    },
  });
  expect(resp.status()).toBe(201);
  return resp.json();
}

test.describe('Workflow Team Scope', () => {
  test('POST resolves string teamName to numeric teamId', async ({ request }) => {
    const headers = authHeader(token);
    const teamName = `wf-resolve-${Date.now()}`;
    const team = await createTeam(request, teamName, headers);

    // Create workflow using the team NAME (string) instead of numeric ID
    const wf = await createWorkflow(request, `Resolve Test ${Date.now()}`, teamName, headers);
    // The server should have resolved the string name to the numeric ID
    expect(wf.teamId).toBe(team.id);
  });

  test('GET filters workflows by teamId query', async ({ request }) => {
    const headers = authHeader(token);
    const teamA = await createTeam(request, `wf-a-${Date.now()}`, headers);
    const teamB = await createTeam(request, `wf-b-${Date.now()}`, headers);

    const wfA = await createWorkflow(request, `WF-A ${Date.now()}`, teamA.id, headers);
    await createWorkflow(request, `WF-B ${Date.now()}`, teamB.id, headers);

    // Query by team A's numeric ID (GET /api/workflows requires auth when ENFORCE_AUTH_WRITES=true)
    const respA = await request.get(`/api/workflows?teamId=${teamA.id}`, { headers });
    expect(respA.status()).toBe(200);
    const workflowsA = await respA.json();
    expect(Array.isArray(workflowsA)).toBe(true);
    const foundA = workflowsA.find((w: any) => w.id === wfA.id);
    expect(foundA).toBeDefined();

    // Query by team B should NOT contain team A's workflow
    const respB = await request.get(`/api/workflows?teamId=${teamB.id}`, { headers });
    expect(respB.status()).toBe(200);
    const workflowsB = await respB.json();
    const leakedA = workflowsB.find((w: any) => w.id === wfA.id);
    expect(leakedA).toBeUndefined();
  });

  test('GET resolves string teamName in query param', async ({ request }) => {
    const headers = authHeader(token);
    const teamName = `wf-qname-${Date.now()}`;
    const team = await createTeam(request, teamName, headers);
    const wf = await createWorkflow(request, `QName Test ${Date.now()}`, team.id, headers);

    // Query using team NAME string (the GET route should resolve it)
    const resp = await request.get(`/api/workflows?teamId=${teamName}`, { headers });
    expect(resp.status()).toBe(200);
    const workflows = await resp.json();
    const found = workflows.find((w: any) => w.id === wf.id);
    expect(found).toBeDefined();
  });

  test('POST with unknown team name returns 400', async ({ request }) => {
    const resp = await request.post('/api/workflows', {
      headers: authHeader(token),
      data: {
        name: `Bad Team Workflow ${Date.now()}`,
        teamId: 'nonexistent-team-name',
        isActive: true,
        trigger: { type: 'page_created', config: {} },
        actions: [{ type: 'add_label', config: { label: 'x' } }],
        conditions: [],
        createdBy: 'e2e-test',
      },
    });
    expect(resp.status()).toBe(400);
  });
});
