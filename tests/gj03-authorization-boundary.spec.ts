import { test, expect, type APIRequestContext } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

async function createTeam(request: APIRequestContext, name: string, displayName: string) {
  const response = await request.post('/api/teams', {
    data: { name, displayName, description: `GJ-03 authorization proof ${displayName}` },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

function resultPages(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.pages)) return body.pages;
  return [];
}

test('GJ-03: authorized page/search succeeds and cross-team access fails closed', async ({ request }) => {
  const stamp = Date.now();
  const uniqueToken = `gj03boundary${stamp}`;
  const title = `GJ03 Protected ${stamp}`;
  const updatedTitle = `${title} Updated`;

  const userA = await registerTestUser(request, `gj03-a-${stamp}`);
  const userB = await registerTestUser(request, `gj03-b-${stamp}`);
  const requestA = await createAuthenticatedApiContext(userA.email, userA.password);
  const requestB = await createAuthenticatedApiContext(userB.email, userB.password);

  try {
    const teamA = await createTeam(requestA, `gj03-team-a-${stamp}`, `GJ03 Team A ${stamp}`);
    const teamB = await createTeam(requestB, `gj03-team-b-${stamp}`, `GJ03 Team B ${stamp}`);
    expect(String(teamA.id)).not.toBe(String(teamB.id));

    const createPage = await requestA.post('/api/pages', {
      data: {
        title,
        content: `Protected authorization proof token ${uniqueToken}`,
        slug: `gj03-protected-${stamp}`,
        folder: 'docs',
        author: userA.name,
        tags: ['gj03'],
        teamId: teamA.id,
      },
    });
    expect(createPage.status()).toBe(201);
    const protectedPage = await createPage.json();
    const pageId = String(protectedPage.id);

    // Authorized same-team read succeeds.
    const ownerRead = await requestA.get(`/api/pages/${pageId}`);
    expect(ownerRead.status()).toBe(200);
    expect((await ownerRead.json()).title).toBe(title);

    // Authorized same-team mutation succeeds and persists.
    const ownerUpdate = await requestA.put(`/api/pages/${pageId}`, {
      data: { title: updatedTitle },
    });
    expect(ownerUpdate.status()).toBe(200);
    const persistedAfterOwnerUpdate = await requestA.get(`/api/pages/${pageId}`);
    expect(persistedAfterOwnerUpdate.status()).toBe(200);
    expect((await persistedAfterOwnerUpdate.json()).title).toBe(updatedTitle);

    // Authorized secure search returns the protected Team A document.
    const ownerSearch = await requestA.post('/api/ai/search', {
      data: { query: uniqueToken, teamId: teamA.id, limit: 10 },
    });
    expect(ownerSearch.status()).toBe(200);
    const ownerSearchBody = await ownerSearch.json();
    expect(
      resultPages(ownerSearchBody).some(
        (candidate: any) => String(candidate.pageId ?? candidate.id) === pageId
      )
    ).toBe(true);

    // Authenticated User B is cross-team: direct read must fail closed.
    const crossTeamRead = await requestB.get(`/api/pages/${pageId}`);
    expect([403, 404]).toContain(crossTeamRead.status());

    // Cross-team mutation must fail closed and must not alter persisted state.
    const crossTeamUpdate = await requestB.put(`/api/pages/${pageId}`, {
      data: { title: 'CROSS TEAM MUTATION MUST NOT PERSIST' },
    });
    expect([403, 404]).toContain(crossTeamUpdate.status());

    const persistedAfterAttack = await requestA.get(`/api/pages/${pageId}`);
    expect(persistedAfterAttack.status()).toBe(200);
    expect((await persistedAfterAttack.json()).title).toBe(updatedTitle);

    // Explicitly asking for Team A search as User B must be rejected.
    const crossTeamExplicitSearch = await requestB.post('/api/ai/search', {
      data: { query: uniqueToken, teamId: teamA.id, limit: 10 },
    });
    expect(crossTeamExplicitSearch.status()).toBe(403);

    // Default secure search for User B's own scope must not leak Team A data or token.
    const crossTeamDefaultSearch = await requestB.post('/api/ai/search', {
      data: { query: uniqueToken, limit: 10 },
    });
    expect(crossTeamDefaultSearch.status()).toBe(200);
    const crossTeamSearchBody = await crossTeamDefaultSearch.json();
    expect(
      resultPages(crossTeamSearchBody).some(
        (candidate: any) => String(candidate.pageId ?? candidate.id) === pageId
      )
    ).toBe(false);
    expect(JSON.stringify(crossTeamSearchBody)).not.toContain(uniqueToken);

    await requestA.delete(`/api/pages/${pageId}`).catch(() => {});
    await requestA.delete(`/api/teams/${teamA.id}`).catch(() => {});
    await requestB.delete(`/api/teams/${teamB.id}`).catch(() => {});
  } finally {
    await requestA.dispose();
    await requestB.dispose();
  }
});
