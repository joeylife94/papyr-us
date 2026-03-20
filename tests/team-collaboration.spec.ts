import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Team Collaboration E2E Tests
 *
 * Tests team-based features via API:
 * - Team CRUD (create, read, update, delete)
 * - Team A/B member separation with distinct roles
 * - Role/permission enforcement on members
 * - Team settings update and verification
 * - Team-scoped page isolation (pages created under team A don't leak to team B)
 */

/** Register a user and return the auth token */
async function getAuthToken(request: APIRequestContext): Promise<string> {
  const email = `team-collab-${Date.now()}@example.com`;
  const resp = await request.post('/api/auth/register', {
    data: { name: 'Team Collab Tester', email, password: 'password123' },
  });
  expect(resp.status()).toBe(201);
  return (await resp.json()).token;
}

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

async function createMember(
  request: APIRequestContext,
  name: string,
  email: string,
  role: string,
  teamId: number
) {
  const resp = await request.post('/api/members', {
    data: { name, email, role, teamId, skills: [] },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  expect(body.teamId).toBe(teamId);
  expect(body.role).toBe(role);
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

test.describe('Team Member Separation & Roles', () => {
  test('members assigned to team A do not appear in team B listing', async ({ request }) => {
    const ts = Date.now();
    const teamA = await createTeam(request, `mem-a-${ts}`, 'Member Team A');
    const teamB = await createTeam(request, `mem-b-${ts}`, 'Member Team B');

    // Create members with distinct roles for each team
    const leaderA = await createMember(
      request,
      'Leader A',
      `leader-a-${ts}@example.com`,
      '팀장',
      teamA.id
    );
    const devA = await createMember(
      request,
      'Dev A',
      `dev-a-${ts}@example.com`,
      '개발자',
      teamA.id
    );
    const pmB = await createMember(request, 'PM B', `pm-b-${ts}@example.com`, 'PM', teamB.id);

    // Verify team A members
    const respA = await request.get(`/api/members?teamId=${teamA.id}`);
    expect(respA.status()).toBe(200);
    const membersA = await respA.json();
    expect(membersA.some((m: any) => m.id === leaderA.id)).toBe(true);
    expect(membersA.some((m: any) => m.id === devA.id)).toBe(true);
    expect(membersA.some((m: any) => m.id === pmB.id)).toBe(false);

    // Verify team B members
    const respB = await request.get(`/api/members?teamId=${teamB.id}`);
    expect(respB.status()).toBe(200);
    const membersB = await respB.json();
    expect(membersB.some((m: any) => m.id === pmB.id)).toBe(true);
    expect(membersB.some((m: any) => m.id === leaderA.id)).toBe(false);
    expect(membersB.some((m: any) => m.id === devA.id)).toBe(false);
  });

  test('member role is preserved and updatable', async ({ request }) => {
    const ts = Date.now();
    const team = await createTeam(request, `role-${ts}`, 'Role Team');
    const member = await createMember(
      request,
      'Role Test',
      `role-test-${ts}@example.com`,
      '개발자',
      team.id
    );
    expect(member.role).toBe('개발자');

    // Update role
    const putResp = await request.put(`/api/members/${member.id}`, {
      data: { role: '팀장' },
    });
    expect(putResp.status()).toBe(200);
    const updated = await putResp.json();
    expect(updated.role).toBe('팀장');

    // Read back to confirm
    const getResp = await request.get(`/api/members/${member.id}`);
    expect(getResp.status()).toBe(200);
    const fetched = await getResp.json();
    expect(fetched.role).toBe('팀장');
  });

  test('deleting a member returns 204 and subsequent GET returns 404', async ({ request }) => {
    const ts = Date.now();
    const team = await createTeam(request, `mem-del-${ts}`, 'Del Member Team');
    const member = await createMember(
      request,
      'Del Me',
      `del-me-${ts}@example.com`,
      '디자이너',
      team.id
    );

    const delResp = await request.delete(`/api/members/${member.id}`);
    expect(delResp.status()).toBe(204);

    const getResp = await request.get(`/api/members/${member.id}`);
    expect(getResp.status()).toBe(404);
  });
});

test.describe('Team Settings Verification', () => {
  test('update team displayName and description and verify', async ({ request }) => {
    const ts = Date.now();
    const team = await createTeam(request, `settings-${ts}`, 'Original Display');

    // Update displayName
    const put1 = await request.put(`/api/teams/${team.id}`, {
      data: { displayName: 'New Display Name' },
    });
    expect(put1.status()).toBe(200);
    expect((await put1.json()).displayName).toBe('New Display Name');

    // Update description
    const put2 = await request.put(`/api/teams/${team.id}`, {
      data: { description: 'Updated description for testing' },
    });
    expect(put2.status()).toBe(200);
    expect((await put2.json()).description).toBe('Updated description for testing');

    // Read back to verify both
    const getResp = await request.get(`/api/teams/${team.id}`);
    expect(getResp.status()).toBe(200);
    const fetched = await getResp.json();
    expect(fetched.displayName).toBe('New Display Name');
    expect(fetched.description).toBe('Updated description for testing');
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
