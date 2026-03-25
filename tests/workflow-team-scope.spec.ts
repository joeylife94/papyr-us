import { test, expect, type APIRequestContext } from '@playwright/test';
import { registerTestUser, createAuthenticatedApiContext } from './e2e-helpers';

/**
 * Workflow Team Scope E2E Tests
 *
 * Validates that:
 * - Workflows can be created with a team scope (string teamName resolved to numeric teamId)
 * - GET /api/workflows?teamId=<name> returns only that team's workflows
 * - Workflows scoped to team A don't appear in team B queries
 */

let authRequest: APIRequestContext;

test.beforeAll(async ({ request }) => {
  const result = await registerTestUser(request, 'wf-scope');
  authRequest = await createAuthenticatedApiContext(result.email, result.password);
});

test.afterAll(async () => {
  await authRequest?.dispose();
});

async function createTeam(
  request: APIRequestContext,
  name: string
) {
  const resp = await request.post('/api/teams', {
    data: { name, displayName: `Team ${name}`, description: `E2E workflow team ${name}` },
  });
  expect(resp.status()).toBe(201);
  return resp.json();
}

async function createWorkflow(
  request: APIRequestContext,
  name: string,
  teamId: number | string
) {
  const resp = await request.post('/api/workflows', {
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
  test('POST resolves string teamName to numeric teamId', async () => {
    const teamName = `wf-resolve-${Date.now()}`;
    const team = await createTeam(authRequest, teamName);

    // Create workflow using the team NAME (string) instead of numeric ID
    const wf = await createWorkflow(authRequest, `Resolve Test ${Date.now()}`, teamName);
    // The server should have resolved the string name to the numeric ID
    expect(wf.teamId).toBe(team.id);
  });

  test('GET filters workflows by teamId query', async () => {
    const teamA = await createTeam(authRequest, `wf-a-${Date.now()}`);
    const teamB = await createTeam(authRequest, `wf-b-${Date.now()}`);

    const wfA = await createWorkflow(authRequest, `WF-A ${Date.now()}`, teamA.id);
    await createWorkflow(authRequest, `WF-B ${Date.now()}`, teamB.id);

    // Query by team A's numeric ID (GET /api/workflows requires auth when ENFORCE_AUTH_WRITES=true)
    const respA = await authRequest.get(`/api/workflows?teamId=${teamA.id}`);
    expect(respA.status()).toBe(200);
    const workflowsA = await respA.json();
    expect(Array.isArray(workflowsA)).toBe(true);
    const foundA = workflowsA.find((w: any) => w.id === wfA.id);
    expect(foundA).toBeDefined();

    // Query by team B should NOT contain team A's workflow
    const respB = await authRequest.get(`/api/workflows?teamId=${teamB.id}`);
    expect(respB.status()).toBe(200);
    const workflowsB = await respB.json();
    const leakedA = workflowsB.find((w: any) => w.id === wfA.id);
    expect(leakedA).toBeUndefined();
  });

  test('GET resolves string teamName in query param', async () => {
    const teamName = `wf-qname-${Date.now()}`;
    const team = await createTeam(authRequest, teamName);
    const wf = await createWorkflow(authRequest, `QName Test ${Date.now()}`, team.id);

    // Query using team NAME string (the GET route should resolve it)
    const resp = await authRequest.get(`/api/workflows?teamId=${teamName}`);
    expect(resp.status()).toBe(200);
    const workflows = await resp.json();
    const found = workflows.find((w: any) => w.id === wf.id);
    expect(found).toBeDefined();
  });

  test('POST with unknown team name returns 400', async () => {
    const resp = await authRequest.post('/api/workflows', {
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
