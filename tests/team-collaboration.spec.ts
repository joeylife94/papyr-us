import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Team Collaboration E2E Tests
 *
 * Tests team-based features via API:
 * - Team CRUD (create, read, update, delete)
 * - Team-scoped page isolation (pages created under team A don't leak to team B)
 */

async function createTeam(request: APIRequestContext, name: string, displayName: string) {
  const resp = await request.post('/api/teams', {
    data: { name, displayName, description: `E2E team ${name}` },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  expect(body).toHaveProperty('id');
  expect(body.name).toBe(name);
  return body;
}

test.describe('Team CRUD', () => {
  test('create a team and read it back', async ({ request }) => {
    const name = `e2e-team-${Date.now()}`;
    const team = await createTeam(request, name, 'E2E Test Team');

    const getResp = await request.get(`/api/teams/${team.id}`);
    expect(getResp.status()).toBe(200);
    const fetched = await getResp.json();
    expect(fetched.name).toBe(name);
    expect(fetched.displayName).toBe('E2E Test Team');
  });

  test('list teams includes the created team', async ({ request }) => {
    const name = `e2e-list-${Date.now()}`;
    const team = await createTeam(request, name, 'List Team');

    const listResp = await request.get('/api/teams');
    expect(listResp.status()).toBe(200);
    const teams = await listResp.json();
    expect(Array.isArray(teams)).toBe(true);
    const found = teams.find((t: any) => t.id === team.id);
    expect(found).toBeDefined();
  });

  test('update a team', async ({ request }) => {
    const team = await createTeam(request, `e2e-upd-${Date.now()}`, 'Old Name');

    const putResp = await request.put(`/api/teams/${team.id}`, {
      data: { displayName: 'Updated Name' },
    });
    expect(putResp.status()).toBe(200);
    const updated = await putResp.json();
    expect(updated.displayName).toBe('Updated Name');
  });

  test('delete a team and verify 404', async ({ request }) => {
    const team = await createTeam(request, `e2e-del-${Date.now()}`, 'Delete Me');

    const delResp = await request.delete(`/api/teams/${team.id}`);
    expect(delResp.status()).toBe(204);

    const getResp = await request.get(`/api/teams/${team.id}`);
    expect(getResp.status()).toBe(404);
  });
});

test.describe('Team Page Isolation', () => {
  test('pages created under team A do not appear in team B listing', async ({ request }) => {
    // Create two teams
    const teamA = await createTeam(request, `iso-a-${Date.now()}`, 'Team A');
    const teamB = await createTeam(request, `iso-b-${Date.now()}`, 'Team B');

    // Create a page scoped to team A
    const pageTitle = `Team A Page ${Date.now()}`;
    const slug = `team-a-page-${Date.now()}`;
    const createResp = await request.post('/api/pages', {
      data: {
        title: pageTitle,
        content: 'Team A exclusive content',
        slug,
        folder: 'docs',
        author: 'E2E',
        tags: [],
        teamId: teamA.id,
      },
    });
    expect(createResp.status()).toBe(201);
    const createdPage = await createResp.json();

    // Query pages for team A — should include the page
    const teamAPages = await request.get(`/api/pages?teamId=${teamA.id}`);
    expect(teamAPages.status()).toBe(200);
    const teamABody = await teamAPages.json();
    const foundInA = teamABody.pages.find((p: any) => p.id === createdPage.id);
    expect(foundInA).toBeDefined();

    // Query pages for team B — should NOT include the page
    const teamBPages = await request.get(`/api/pages?teamId=${teamB.id}`);
    expect(teamBPages.status()).toBe(200);
    const teamBBody = await teamBPages.json();
    const foundInB = teamBBody.pages.find((p: any) => p.id === createdPage.id);
    expect(foundInB).toBeUndefined();
  });
});
