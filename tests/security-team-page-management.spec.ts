/**
 * Who can change a team page, end to end against the real server, authentication, team
 * membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Rules under test:
 * - team pages without explicit permissions give members viewer, like every other team page;
 * - the team owner manages every page of the team (edit, permissions, delete), including a page
 *   whose author has left the team, while the removed author still gets nothing;
 * - every page listed for a caller is directly readable by that caller.
 *
 * Team admins share the owner rule; no API assigns the admin role yet, so that case is covered by
 * server/tests/team-page-access.test.ts.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

function pageIds(body: unknown): number[] {
  const list = Array.isArray(body) ? body : ((body as any)?.pages ?? []);
  return list.map((page: any) => Number(page.id));
}

/** One team with an owner and an admitted member, plus page and access helpers. */
async function setUpTeam(request: APIRequestContext, prefix: string) {
  const stamp = Date.now();
  const folder = `${prefix}-${stamp}`;
  const owner = await registerTestUser(request, `${prefix}-owner`);
  const member = await registerTestUser(request, `${prefix}-member`);
  const ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
  const memberRequest = await createAuthenticatedApiContext(member.email, member.password);

  const teamResponse = await ownerRequest.post('/api/teams', {
    data: { name: `${prefix}-team-${stamp}`, displayName: `${prefix} team ${stamp}` },
  });
  expect(teamResponse.status()).toBe(201);
  const teamId = Number((await teamResponse.json()).id);
  const admit = await ownerRequest.post(`/api/teams/${teamId}/memberships`, {
    data: { email: member.email },
  });
  expect(admit.status()).toBe(201);
  const memberUserId = Number((await admit.json()).userId);

  const createTeamPage = async (ctx: APIRequestContext, slug: string, author: string) => {
    const response = await ctx.post('/api/pages', {
      data: { title: `Page ${slug}`, slug, content: `Content ${slug}`, folder, author, teamId },
    });
    expect(response.status(), `create ${slug}`).toBe(201);
    return (await response.json()) as { id: number; slug: string };
  };
  const access = async (ctx: APIRequestContext, pageId: number) => ({
    read: (await ctx.get(`/api/pages/${pageId}`)).status(),
    edit: (await ctx.put(`/api/pages/${pageId}`, { data: { title: `Edit ${stamp}` } })).status(),
    permissions: (await ctx.get(`/api/pages/${pageId}/permissions`)).status(),
  });
  // Every page a caller sees in the team list or the folder must open for that caller.
  const expectListedPagesReadable = async (actor: string, ctx: APIRequestContext) => {
    for (const path of [`/api/pages?teamId=${teamId}&limit=100`, `/api/folders/${folder}/pages`]) {
      const response = await ctx.get(path);
      if (response.status() !== 200) continue;
      for (const id of pageIds(await response.json())) {
        const direct = await ctx.get(`/api/pages/${id}`);
        expect(direct.status(), `${actor} lists page ${id} it cannot open`).toBe(200);
      }
    }
  };
  const dispose = async () => {
    await ownerRequest.delete(`/api/teams/${teamId}`).catch(() => {});
    await ownerRequest.dispose();
    await memberRequest.dispose();
  };

  return {
    stamp,
    owner,
    member,
    ownerRequest,
    memberRequest,
    teamId,
    memberUserId,
    createTeamPage,
    access,
    expectListedPagesReadable,
    dispose,
  };
}

test.describe('Team pages stay manageable by the team', () => {
  test('a team page without explicit permissions gives members viewer only', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const team = await setUpTeam(request, 'tpm-open');
    try {
      const openPage = await team.createTeamPage(
        team.ownerRequest,
        `tpm-open-${team.stamp}`,
        team.owner.email
      );
      const grants = (await (
        await team.ownerRequest.get(`/api/pages/${openPage.id}/permissions`)
      ).json()) as Array<{ id: number }>;
      expect(grants.length).toBeGreaterThan(0);
      for (const grant of grants) {
        const removed = await team.ownerRequest.delete(
          `/api/pages/${openPage.id}/permissions/${grant.id}`
        );
        expect(removed.status()).toBe(200);
      }
      const remaining = await team.ownerRequest.get(`/api/pages/${openPage.id}/permissions`);
      expect(await remaining.json()).toEqual([]);

      expect(await team.access(team.memberRequest, openPage.id)).toEqual({
        read: 200,
        edit: 403,
        permissions: 403,
      });
      expect((await team.memberRequest.delete(`/api/pages/${openPage.id}`)).status()).toBe(403);
      const selfGrant = await team.memberRequest.post(`/api/pages/${openPage.id}/permissions`, {
        data: { entityType: 'user', entityId: team.memberUserId, permission: 'owner' },
      });
      expect(selfGrant.status()).toBe(403);
      await team.expectListedPagesReadable('member', team.memberRequest);

      // The team owner still manages it.
      expect(await team.access(team.ownerRequest, openPage.id)).toEqual({
        read: 200,
        edit: 200,
        permissions: 200,
      });
      expect((await team.ownerRequest.delete(`/api/pages/${openPage.id}`)).status()).toBe(200);
    } finally {
      await team.dispose();
    }
  });

  test('the team owner manages a member page, also after its author leaves the team', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const team = await setUpTeam(request, 'tpm-orphan');
    try {
      const memberPage = await team.createTeamPage(
        team.memberRequest,
        `tpm-member-${team.stamp}`,
        team.member.email
      );
      expect(await team.access(team.ownerRequest, memberPage.id)).toEqual({
        read: 200,
        edit: 200,
        permissions: 200,
      });

      const revoke = await team.ownerRequest.delete(
        `/api/teams/${team.teamId}/memberships/${team.memberUserId}`
      );
      expect(revoke.status()).toBe(204);

      // The removed author gets nothing; the team owner keeps managing the page.
      expect(await team.access(team.memberRequest, memberPage.id)).toEqual({
        read: 403,
        edit: 403,
        permissions: 403,
      });
      expect(await team.access(team.ownerRequest, memberPage.id)).toEqual({
        read: 200,
        edit: 200,
        permissions: 200,
      });
      const ownerMe = await (await team.ownerRequest.get('/api/auth/me')).json();
      const handover = await team.ownerRequest.post(`/api/pages/${memberPage.id}/permissions`, {
        data: { entityType: 'user', entityId: ownerMe.id, permission: 'owner' },
      });
      expect([200, 201]).toContain(handover.status());
      await team.expectListedPagesReadable('removed member', team.memberRequest);
      await team.expectListedPagesReadable('owner', team.ownerRequest);

      expect((await team.ownerRequest.delete(`/api/pages/${memberPage.id}`)).status()).toBe(200);
    } finally {
      await team.dispose();
    }
  });
});
