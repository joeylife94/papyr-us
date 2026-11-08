/**
 * Team directory rows (`members`) are not self-service, end to end against the real server,
 * authentication, team membership and PostgreSQL. Synthetic users, teams and pages only. The
 * route-level rules are in server/tests/team-auth.test.ts.
 *
 * A `members` row on a team counts as team membership for its email (DBStorage.getUserTeamIds),
 * so writing one into a team needs the same role as admitting someone through
 * POST /api/teams/:teamId/memberships: a current owner or admin of that team.
 *
 * Rules under test:
 * - someone outside a team cannot add a row to it, even while the team has no rows yet, and
 *   still cannot read its pages afterwards;
 * - a plain member of a team cannot add a row to it;
 * - a row cannot be moved into a team where the caller is only a plain member;
 * - the team's owner can still add rows.
 */
import { test, expect } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

test.describe('Team directory rows need a team owner or admin', () => {
  test('POST and PUT /api/members cannot add the caller to a team', async ({ request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();

    const ownerA = await registerTestUser(request, 'secm-owner-a');
    const memberA = await registerTestUser(request, 'secm-member-a');
    const ownerB = await registerTestUser(request, 'secm-owner-b');
    const outsider = await registerTestUser(request, 'secm-outsider');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const teamIds: number[] = [];

    const directoryRow = (email: string, teamId: number) => ({
      name: `Row ${email}`,
      email,
      role: '개발자',
      teamId,
      skills: [],
    });

    try {
      // ── Arrange: Team A (owner A, plain member A, plain member owner B) with a page, Team B ──
      const teamAResponse = await ownerARequest.post('/api/teams', {
        data: { name: `secm-team-a-${stamp}`, displayName: `Secm Team A ${stamp}` },
      });
      expect(teamAResponse.status()).toBe(201);
      const teamA = await teamAResponse.json();
      teamIds.push(teamA.id);
      const teamBResponse = await ownerBRequest.post('/api/teams', {
        data: { name: `secm-team-b-${stamp}`, displayName: `Secm Team B ${stamp}` },
      });
      expect(teamBResponse.status()).toBe(201);
      const teamB = await teamBResponse.json();
      teamIds.push(teamB.id);
      for (const email of [memberA.email, ownerB.email]) {
        const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
          data: { email },
        });
        expect(admit.status(), `admit ${email}`).toBe(201);
      }

      const pageResponse = await ownerARequest.post('/api/pages', {
        data: {
          title: `Team A page ${stamp}`,
          slug: `secm-a-page-${stamp}`,
          content: 'Team A only',
          folder: 'docs',
          tags: [],
          author: ownerA.email,
          teamId: teamA.id,
        },
      });
      expect(pageResponse.status()).toBe(201);
      const teamAPage = await pageResponse.json();
      expect((await outsiderRequest.get(`/api/pages/${teamAPage.id}`)).status()).toBe(403);

      // Team A has a team_members owner but no directory rows yet.
      const rowsBefore = await ownerARequest.get(`/api/members?teamId=${teamA.id}`);
      expect(rowsBefore.status()).toBe(200);
      expect(await rowsBefore.json()).toEqual([]);

      // ── 1. An outsider cannot add themselves to Team A, even with no rows there ──
      const selfAdd = await outsiderRequest.post('/api/members', {
        data: directoryRow(outsider.email, teamA.id),
      });
      expect(selfAdd.status(), 'outsider adds self').toBe(403);
      expect((await outsiderRequest.get(`/api/pages/${teamAPage.id}`)).status()).toBe(403);
      expect((await outsiderRequest.get(`/api/members?teamId=${teamA.id}`)).status()).toBe(403);

      // ── 2. A plain member cannot add rows to their team ──
      const memberAdd = await memberARequest.post('/api/members', {
        data: directoryRow(outsider.email, teamA.id),
      });
      expect(memberAdd.status(), 'plain member adds a row').toBe(403);
      expect((await outsiderRequest.get(`/api/pages/${teamAPage.id}`)).status()).toBe(403);

      // ── 3. A row cannot be moved into a team where the caller is only a plain member ──
      const rowInB = await ownerBRequest.post('/api/members', {
        data: directoryRow(outsider.email, teamB.id),
      });
      expect(rowInB.status(), 'Team B owner adds a row to Team B').toBe(201);
      const row = await rowInB.json();
      const move = await ownerBRequest.put(`/api/members/${row.id}`, {
        data: { teamId: teamA.id },
      });
      expect(move.status(), 'move a row into Team A').toBe(403);
      const rowAfter = await ownerBRequest.get(`/api/members/${row.id}`);
      expect(rowAfter.status()).toBe(200);
      expect((await rowAfter.json()).teamId).toBe(teamB.id);
      expect((await outsiderRequest.get(`/api/pages/${teamAPage.id}`)).status()).toBe(403);

      // ── 4. The team's owner can still add rows ──
      const ownerAdd = await ownerARequest.post('/api/members', {
        data: directoryRow(`secm-listed-${stamp}@example.com`, teamA.id),
      });
      expect(ownerAdd.status(), 'Team A owner adds a row').toBe(201);
      expect((await ownerAdd.json()).teamId).toBe(teamA.id);
    } finally {
      for (const teamId of teamIds) {
        await ownerARequest.delete(`/api/teams/${teamId}`).catch(() => {});
        await ownerBRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      }
      await ownerARequest.dispose();
      await memberARequest.dispose();
      await ownerBRequest.dispose();
      await outsiderRequest.dispose();
    }
  });
});
