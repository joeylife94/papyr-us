import { test, expect, request as playwrightRequest } from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const PASSWORD = 'Password123!';

function syntheticEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

test.describe('Issue #72 D2-01 invitation onboarding lifecycle', () => {
  test('owner invites an unregistered recipient, acceptance grants one membership, and revocation removes access', async ({ request }) => {
    const owner = await registerTestUser(request, 'd2-owner');
    const outsider = await registerTestUser(request, 'd2-outsider');
    const invitedEmail = syntheticEmail('d2-recipient');
    const ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const anonymousRequest = await playwrightRequest.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:5003' });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const stamp = Date.now();
    let teamId: number | undefined;
    let recipientRequest: Awaited<ReturnType<typeof createAuthenticatedApiContext>> | undefined;

    try {
      const createTeam = await ownerRequest.post('/api/teams', {
        data: {
          name: `d2-onboarding-${stamp}`,
          displayName: `D2 Onboarding ${stamp}`,
          description: 'Issue #72 executable acceptance proof',
        },
      });
      expect(createTeam.status()).toBe(201);
      const team = await createTeam.json();
      teamId = team.id;

      const createInvite = await ownerRequest.post(`/api/teams/${team.id}/invitations`, {
        data: { email: invitedEmail },
      });
      expect(createInvite.status()).toBe(201);
      const invitation = await createInvite.json();
      expect(invitation).toMatchObject({ teamId: team.id, email: invitedEmail, status: 'pending' });
      expect(typeof invitation.token).toBe('string');
      expect(invitation.token.length).toBeGreaterThanOrEqual(24);

      // The invite may be inspected without authentication so a recipient can open a copied link,
      // but the response must not expose a reusable stored digest or other credential material.
      const inviteSurface = await anonymousRequest.get(`/api/invitations/${invitation.token}`);
      expect(inviteSurface.status()).toBe(200);
      const inviteView = await inviteSurface.json();
      expect(inviteView).toMatchObject({ teamId: team.id, email: invitedEmail, status: 'pending' });
      expect(inviteView.tokenDigest).toBeUndefined();

      const beforeMembership = await pool.query(
        `SELECT tm.role
           FROM team_members tm
           JOIN users u ON u.id = tm.user_id
          WHERE tm.team_id = $1 AND u.email = $2`,
        [team.id, invitedEmail]
      );
      expect(beforeMembership.rowCount).toBe(0);

      const wrongIdentity = await outsiderRequest.post(`/api/invitations/${invitation.token}/accept`);
      expect(wrongIdentity.status()).toBe(403);

      const registerRecipient = await request.post('/api/auth/register', {
        data: { name: 'D2 Recipient', email: invitedEmail, password: PASSWORD },
      });
      expect(registerRecipient.status()).toBe(201);
      recipientRequest = await createAuthenticatedApiContext(invitedEmail, PASSWORD);

      const accept = await recipientRequest.post(`/api/invitations/${invitation.token}/accept`);
      expect([200, 201]).toContain(accept.status());
      const accepted = await accept.json();
      expect(accepted).toMatchObject({ teamId: team.id, role: 'member' });
      expect(Number.isInteger(Number(accepted.userId))).toBe(true);
      const recipientUserId = Number(accepted.userId);

      const membershipRows = await pool.query(
        'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
        [team.id, recipientUserId]
      );
      expect(membershipRows.rowCount).toBe(1);
      expect(membershipRows.rows[0]?.role).toBe('member');

      const replay = await recipientRequest.post(`/api/invitations/${invitation.token}/accept`);
      expect([200, 409]).toContain(replay.status());
      const membershipRowsAfterReplay = await pool.query(
        'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
        [team.id, recipientUserId]
      );
      expect(membershipRowsAfterReplay.rowCount).toBe(1);

      const recipientTeams = await recipientRequest.get('/api/teams');
      expect(recipientTeams.status()).toBe(200);
      const visibleTeams = await recipientTeams.json();
      expect(visibleTeams.some((candidate: any) => candidate.id === team.id)).toBe(true);

      const memberWrite = await recipientRequest.post('/api/pages', {
        data: {
          title: `D2 Shared Page ${stamp}`,
          slug: `d2-shared-page-${stamp}`,
          content: 'Invite-driven shared workspace acceptance',
          author: invitedEmail,
          teamId: team.id,
          folder: 'D2',
          tags: ['d2'],
        },
      });
      expect(memberWrite.status()).toBe(201);

      const invalidInvite = await recipientRequest.post('/api/invitations/not-a-real-invite-token/accept');
      expect([400, 404]).toContain(invalidInvite.status());

      const cancelEmail = syntheticEmail('d2-cancelled');
      const cancelInviteResponse = await ownerRequest.post(`/api/teams/${team.id}/invitations`, {
        data: { email: cancelEmail },
      });
      expect(cancelInviteResponse.status()).toBe(201);
      const cancelInvite = await cancelInviteResponse.json();
      const cancel = await ownerRequest.delete(`/api/teams/${team.id}/invitations/${cancelInvite.id}`);
      expect(cancel.status()).toBe(204);
      const cancelledSurface = await anonymousRequest.get(`/api/invitations/${cancelInvite.token}`);
      expect([404, 410]).toContain(cancelledSurface.status());

      // Expiry is bounded by the product contract; the API accepts a short test-only TTL only in test mode.
      const expiredEmail = syntheticEmail('d2-expired');
      const expiredInviteResponse = await ownerRequest.post(`/api/teams/${team.id}/invitations`, {
        data: { email: expiredEmail, expiresInSeconds: 0 },
      });
      expect(expiredInviteResponse.status()).toBe(201);
      const expiredInvite = await expiredInviteResponse.json();
      const expiredSurface = await anonymousRequest.get(`/api/invitations/${expiredInvite.token}`);
      expect([404, 410]).toContain(expiredSurface.status());

      const revoke = await ownerRequest.delete(`/api/teams/${team.id}/memberships/${recipientUserId}`);
      expect(revoke.status()).toBe(204);

      const teamsAfterRevoke = await recipientRequest.get('/api/teams');
      expect(teamsAfterRevoke.status()).toBe(200);
      const visibleAfter = await teamsAfterRevoke.json();
      expect(visibleAfter.some((candidate: any) => candidate.id === team.id)).toBe(false);

      const writeAfterRevoke = await recipientRequest.put(`/api/teams/${team.id}`, {
        data: { displayName: `Should Not Work ${stamp}` },
      });
      expect(writeAfterRevoke.status()).toBe(403);
    } finally {
      if (teamId) await ownerRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      await pool.end();
      await recipientRequest?.dispose();
      await anonymousRequest.dispose();
      await ownerRequest.dispose();
      await outsiderRequest.dispose();
    }
  });
});
