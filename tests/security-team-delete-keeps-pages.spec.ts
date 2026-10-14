/**
 * Deleting a team must not change who can open its pages, end to end against the real server,
 * authentication, team membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Rule under test: a team cannot be deleted while pages still belong to it, trashed pages
 * included. The team owner moves or deletes them first; until then the pages, their team and
 * their access rules stay exactly as they were.
 */
import { test, expect } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

test.describe('Team deletion keeps team pages under team rules', () => {
  test('a team with pages cannot be deleted until its pages are gone', async ({ request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const owner = await registerTestUser(request, 'tdk-owner');
    const member = await registerTestUser(request, 'tdk-member');
    const ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    const memberRequest = await createAuthenticatedApiContext(member.email, member.password);
    let teamId: number | undefined;

    try {
      const teamResponse = await ownerRequest.post('/api/teams', {
        data: { name: `tdk-team-${stamp}`, displayName: `TDK Team ${stamp}` },
      });
      expect(teamResponse.status()).toBe(201);
      teamId = Number((await teamResponse.json()).id);
      const admit = await ownerRequest.post(`/api/teams/${teamId}/memberships`, {
        data: { email: member.email },
      });
      expect(admit.status()).toBe(201);
      const memberUserId = Number((await admit.json()).userId);

      const created = await memberRequest.post('/api/pages', {
        data: {
          title: `Member page ${stamp}`,
          slug: `tdk-member-${stamp}`,
          content: `Member content ${stamp}`,
          folder: 'docs',
          author: member.email,
          teamId,
        },
      });
      expect(created.status()).toBe(201);
      const page = (await created.json()) as { id: number };

      // The author leaves the team and loses the page.
      const revoke = await ownerRequest.delete(`/api/teams/${teamId}/memberships/${memberUserId}`);
      expect(revoke.status()).toBe(204);
      expect((await memberRequest.get(`/api/pages/${page.id}`)).status()).toBe(403);

      // ── 1. Deleting the team is refused while the page belongs to it ──
      const refused = await ownerRequest.delete(`/api/teams/${teamId}`);
      expect(refused.status()).toBe(409);
      expect((await refused.json()).error).toMatch(/still has pages/);

      // Nothing changed: the page keeps its team and the removed author stays locked out.
      const afterRefusal = await ownerRequest.get(`/api/pages/${page.id}`);
      expect(afterRefusal.status()).toBe(200);
      expect(Number((await afterRefusal.json()).teamId)).toBe(teamId);
      expect((await memberRequest.get(`/api/pages/${page.id}`)).status()).toBe(403);
      const memberEdit = await memberRequest.put(`/api/pages/${page.id}`, {
        data: { title: `Edited by former member ${stamp}` },
      });
      expect(memberEdit.status()).toBe(403);

      // ── 2. A page in the trash still belongs to the team ──
      expect((await ownerRequest.delete(`/api/pages/${page.id}`)).status()).toBe(200);
      expect((await ownerRequest.delete(`/api/teams/${teamId}`)).status()).toBe(409);

      // ── 3. Once the team has no pages left, it can be deleted ──
      expect((await ownerRequest.delete(`/api/trash/${page.id}`)).status()).toBe(200);
      expect((await ownerRequest.delete(`/api/teams/${teamId}`)).status()).toBe(204);
      teamId = undefined;
    } finally {
      if (teamId) await ownerRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      await ownerRequest.dispose();
      await memberRequest.dispose();
    }
  });
});
