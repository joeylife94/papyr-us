import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

test.describe('Issue #65 team creator owner membership', () => {
  test('team creator is owner immediately and another user remains denied', async ({ request }) => {
    const creator = await registerTestUser(request, 'team-owner-creator');
    const outsider = await registerTestUser(request, 'team-owner-outsider');
    const creatorRequest = await createAuthenticatedApiContext(creator.email, creator.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const stamp = Date.now();

    const createResponse = await creatorRequest.post('/api/teams', {
      data: {
        name: `creator-owner-${stamp}`,
        displayName: `Creator Owner ${stamp}`,
        description: 'Issue #65 executable acceptance proof',
      },
    });
    expect(createResponse.status()).toBe(201);
    const team = await createResponse.json();

    const listResponse = await creatorRequest.get('/api/teams');
    expect(listResponse.status()).toBe(200);
    const visibleTeams = await listResponse.json();
    expect(visibleTeams.some((candidate: any) => candidate.id === team.id)).toBe(true);

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const membershipResult = await pool.query(
        `SELECT tm.role
           FROM team_members tm
           JOIN users u ON u.id = tm.user_id
          WHERE tm.team_id = $1 AND u.email = $2`,
        [team.id, creator.email]
      );
      expect(membershipResult.rowCount).toBe(1);
      expect(membershipResult.rows[0]?.role).toBe('owner');

      const creatorWrite = await creatorRequest.put(`/api/teams/${team.id}`, {
        data: { displayName: `Creator Owner Updated ${stamp}` },
      });
      expect(creatorWrite.status()).toBe(200);

      const outsiderWrite = await outsiderRequest.put(`/api/teams/${team.id}`, {
        data: { displayName: `Unauthorized ${stamp}` },
      });
      expect(outsiderWrite.status()).toBe(403);
    } finally {
      await creatorRequest.delete(`/api/teams/${team.id}`).catch(() => {});
      await pool.end();
      await creatorRequest.dispose();
      await outsiderRequest.dispose();
    }
  });
});
