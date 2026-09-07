import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

test.describe('Issue #69 D1-02 team admission and revocation', () => {
  test('owner admits an existing user, shared access works, and revocation removes access', async ({ request }) => {
    const owner = await registerTestUser(request, 'd1-owner');
    const member = await registerTestUser(request, 'd1-member');
    const outsider = await registerTestUser(request, 'd1-outsider');
    const ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    const memberRequest = await createAuthenticatedApiContext(member.email, member.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const stamp = Date.now();
    let teamId: number | undefined;

    try {
      const createTeam = await ownerRequest.post('/api/teams', {
        data: {
          name: `d1-handoff-${stamp}`,
          displayName: `D1 Handoff ${stamp}`,
          description: 'Issue #69 executable acceptance proof',
        },
      });
      expect(createTeam.status()).toBe(201);
      const team = await createTeam.json();
      teamId = team.id;

      const targetUser = await pool.query('SELECT id FROM users WHERE email = $1', [member.email]);
      const outsiderUser = await pool.query('SELECT id FROM users WHERE email = $1', [outsider.email]);
      expect(targetUser.rowCount).toBe(1);
      expect(outsiderUser.rowCount).toBe(1);
      const targetUserId = Number(targetUser.rows[0].id);

      const admit = await ownerRequest.post(`/api/teams/${team.id}/memberships`, {
        data: { email: member.email },
      });
      expect(admit.status()).toBe(201);
      const admitted = await admit.json();
      expect(admitted).toMatchObject({ teamId: team.id, userId: targetUserId, role: 'member' });

      const duplicate = await ownerRequest.post(`/api/teams/${team.id}/memberships`, {
        data: { email: member.email },
      });
      expect([200, 409]).toContain(duplicate.status());

      const membershipRows = await pool.query(
        'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
        [team.id, targetUserId]
      );
      expect(membershipRows.rowCount).toBe(1);
      expect(membershipRows.rows[0]?.role).toBe('member');

      const memberTeams = await memberRequest.get('/api/teams');
      expect(memberTeams.status()).toBe(200);
      const visibleTeams = await memberTeams.json();
      expect(visibleTeams.some((candidate: any) => candidate.id === team.id)).toBe(true);

      const memberPageCreate = await memberRequest.post('/api/pages', {
        data: {
          title: `D1 Shared Page ${stamp}`,
          slug: `d1-shared-page-${stamp}`,
          content: 'Shared team use through supported membership',
          author: member.email,
          teamId: team.id,
          folder: 'D1',
          tags: ['d1'],
        },
      });
      expect(memberPageCreate.status()).toBe(201);

      const outsiderAdmit = await outsiderRequest.post(`/api/teams/${team.id}/memberships`, {
        data: { email: outsider.email },
      });
      expect(outsiderAdmit.status()).toBe(403);

      const memberAdmit = await memberRequest.post(`/api/teams/${team.id}/memberships`, {
        data: { email: outsider.email },
      });
      expect(memberAdmit.status()).toBe(403);

      const ownerRemoval = await ownerRequest.delete(`/api/teams/${team.id}/memberships/me`);
      expect([400, 409]).toContain(ownerRemoval.status());

      const revoke = await ownerRequest.delete(`/api/teams/${team.id}/memberships/${targetUserId}`);
      expect(revoke.status()).toBe(204);

      const memberTeamsAfter = await memberRequest.get('/api/teams');
      expect(memberTeamsAfter.status()).toBe(200);
      const visibleAfter = await memberTeamsAfter.json();
      expect(visibleAfter.some((candidate: any) => candidate.id === team.id)).toBe(false);

      const memberWriteAfter = await memberRequest.put(`/api/teams/${team.id}`, {
        data: { displayName: `Should Not Work ${stamp}` },
      });
      expect(memberWriteAfter.status()).toBe(403);
    } finally {
      if (teamId) {
        await ownerRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      }
      await pool.end();
      await ownerRequest.dispose();
      await memberRequest.dispose();
      await outsiderRequest.dispose();
    }
  });
});
