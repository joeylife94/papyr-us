import { test, expect, type APIRequestContext } from '@playwright/test';
import { registerTestUser, createAuthenticatedApiContext } from './e2e-helpers';

/**
 * Team Collaboration E2E Tests
 *
 * Tests team-based features via API:
 * - Team CRUD (create, read, update, delete)
 * - Team A/B member separation with distinct roles
 * - Member role field persistence and update
 * - Team settings update and verification
 * - Team-scoped page isolation (pages created under team A don't leak to team B)
 *
 * NOTE: These tests verify data isolation and field persistence only.
 * For server-side cross-team authorization enforcement tests (401/403
 * rejection of unauthorized access), see server/tests/team-auth.test.ts.
 */

let authRequest: APIRequestContext;

test.beforeAll(async ({ request }) => {
  const result = await registerTestUser(request, 'team-collab');
  authRequest = await createAuthenticatedApiContext(result.email, result.password);
});

test.afterAll(async () => {
  await authRequest?.dispose();
});

async function createTeam(
  request: APIRequestContext,
  name: string,
  displayName: string
) {
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
  test('create a team and read it back', async () => {
    const name = `e2e-team-${Date.now()}`;
    const team = await createTeam(authRequest, name, 'E2E Test Team');

    const getResp = await authRequest.get(`/api/teams/${team.id}`);
    expect(getResp.status()).toBe(200);
    const fetched = await getResp.json();
    expect(fetched.name).toBe(name);
    expect(fetched.displayName).toBe('E2E Test Team');
  });

  test('list teams includes the created team', async () => {
    const name = `e2e-list-${Date.now()}`;
    const team = await createTeam(authRequest, name, 'List Team');

    const listResp = await authRequest.get('/api/teams');
    expect(listResp.status()).toBe(200);
    const teams = await listResp.json();
    expect(Array.isArray(teams)).toBe(true);
    const found = teams.find((t: any) => t.id === team.id);
    expect(found).toBeDefined();
  });

  test('update a team', async () => {
    const team = await createTeam(authRequest, `e2e-upd-${Date.now()}`, 'Old Name');

    const putResp = await authRequest.put(`/api/teams/${team.id}`, {
      data: { displayName: 'Updated Name' },
    });
    expect(putResp.status()).toBe(200);
    const updated = await putResp.json();
    expect(updated.displayName).toBe('Updated Name');
  });

  test('delete a team and verify 404', async () => {
    const team = await createTeam(authRequest, `e2e-del-${Date.now()}`, 'Delete Me');

    const delResp = await authRequest.delete(`/api/teams/${team.id}`);
    expect(delResp.status()).toBe(204);

    const getResp = await authRequest.get(`/api/teams/${team.id}`);
    expect(getResp.status()).toBe(404);
  });
});

test.describe('Team Member Separation & Role Field Persistence', () => {
  test('members assigned to team A do not appear in team B listing', async () => {
    const ts = Date.now();
    const teamA = await createTeam(authRequest, `mem-a-${ts}`, 'Member Team A');
    const teamB = await createTeam(authRequest, `mem-b-${ts}`, 'Member Team B');

    // Create members with distinct roles for each team
    const leaderA = await createMember(
      authRequest,
      'Leader A',
      `leader-a-${ts}@example.com`,
      '팀장',
      teamA.id
    );
    const devA = await createMember(
      authRequest,
      'Dev A',
      `dev-a-${ts}@example.com`,
      '개발자',
      teamA.id
    );
    const pmB = await createMember(
      authRequest,
      'PM B',
      `pm-b-${ts}@example.com`,
      'PM',
      teamB.id
    );

    // Verify team A members
    const respA = await authRequest.get(`/api/members?teamId=${teamA.id}`);
    expect(respA.status()).toBe(200);
    const membersA = await respA.json();
    expect(membersA.some((m: any) => m.id === leaderA.id)).toBe(true);
    expect(membersA.some((m: any) => m.id === devA.id)).toBe(true);
    expect(membersA.some((m: any) => m.id === pmB.id)).toBe(false);

    // Verify team B members
    const respB = await authRequest.get(`/api/members?teamId=${teamB.id}`);
    expect(respB.status()).toBe(200);
    const membersB = await respB.json();
    expect(membersB.some((m: any) => m.id === pmB.id)).toBe(true);
    expect(membersB.some((m: any) => m.id === leaderA.id)).toBe(false);
    expect(membersB.some((m: any) => m.id === devA.id)).toBe(false);
  });

  test('member role field is preserved and updatable', async () => {
    const ts = Date.now();
    const team = await createTeam(authRequest, `role-${ts}`, 'Role Team');
    const member = await createMember(
      authRequest,
      'Role Test',
      `role-test-${ts}@example.com`,
      '개발자',
      team.id
    );
    expect(member.role).toBe('개발자');

    // Update role
    const putResp = await authRequest.put(`/api/members/${member.id}`, {
      data: { role: '팀장' },
    });
    expect(putResp.status()).toBe(200);
    const updated = await putResp.json();
    expect(updated.role).toBe('팀장');

    // Read back to confirm
    const getResp = await authRequest.get(`/api/members/${member.id}`);
    expect(getResp.status()).toBe(200);
    const fetched = await getResp.json();
    expect(fetched.role).toBe('팀장');
  });

  test('deleting a member returns 204 and subsequent GET returns 404', async () => {
    const ts = Date.now();
    const team = await createTeam(authRequest, `mem-del-${ts}`, 'Del Member Team');
    const member = await createMember(
      authRequest,
      'Del Me',
      `del-me-${ts}@example.com`,
      '디자이너',
      team.id
    );

    const delResp = await authRequest.delete(`/api/members/${member.id}`);
    expect(delResp.status()).toBe(204);

    const getResp = await authRequest.get(`/api/members/${member.id}`);
    expect(getResp.status()).toBe(404);
  });
});

test.describe('Team Settings Verification', () => {
  test('update team displayName and description and verify', async () => {
    const ts = Date.now();
    const team = await createTeam(authRequest, `settings-${ts}`, 'Original Display');

    // Update displayName
    const put1 = await authRequest.put(`/api/teams/${team.id}`, {
      data: { displayName: 'New Display Name' },
    });
    expect(put1.status()).toBe(200);
    expect((await put1.json()).displayName).toBe('New Display Name');

    // Update description
    const put2 = await authRequest.put(`/api/teams/${team.id}`, {
      data: { description: 'Updated description for testing' },
    });
    expect(put2.status()).toBe(200);
    expect((await put2.json()).description).toBe('Updated description for testing');

    // Read back to verify both
    const getResp = await authRequest.get(`/api/teams/${team.id}`);
    expect(getResp.status()).toBe(200);
    const fetched = await getResp.json();
    expect(fetched.displayName).toBe('New Display Name');
    expect(fetched.description).toBe('Updated description for testing');
  });
});

test.describe('Team Page Isolation', () => {
  test('pages created under team A do not appear in team B listing', async () => {
    // Create two teams
    const teamA = await createTeam(authRequest, `iso-a-${Date.now()}`, 'Team A');
    const teamB = await createTeam(authRequest, `iso-b-${Date.now()}`, 'Team B');

    // Create a page scoped to team A
    const pageTitle = `Team A Page ${Date.now()}`;
    const slug = `team-a-page-${Date.now()}`;
    const createResp = await authRequest.post('/api/pages', {
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
    const teamAPages = await authRequest.get(`/api/pages?teamId=${teamA.id}`);
    expect(teamAPages.status()).toBe(200);
    const teamABody = await teamAPages.json();
    const foundInA = teamABody.pages.find((p: any) => p.id === createdPage.id);
    expect(foundInA).toBeDefined();

    // Query pages for team B — should NOT include the page
    const teamBPages = await authRequest.get(`/api/pages?teamId=${teamB.id}`);
    expect(teamBPages.status()).toBe(200);
    const teamBBody = await teamBPages.json();
    const foundInB = teamBBody.pages.find((p: any) => p.id === createdPage.id);
    expect(foundInB).toBeUndefined();
  });
});
