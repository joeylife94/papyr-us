/**
 * Single-page access to team pages, end to end against the real server, authentication, team
 * membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Rules under test:
 * - current members of a page's team can read it, by id, slug and every listing; commenting,
 *   editing, deleting and managing permissions still need an explicit grant or authorship;
 * - on a team page, authorship and user-specific grants only count while the user is a member of
 *   that team: a removed member loses even the pages they wrote, and re-admission restores them;
 * - outsiders stay denied, including through a user grant on a team page;
 * - every page listed for a caller is directly readable by that caller.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

function pageIds(body: unknown): number[] {
  const list = Array.isArray(body) ? body : ((body as any)?.pages ?? []);
  return list.map((page: any) => Number(page.id));
}

function treeIds(nodes: any[]): number[] {
  return nodes.flatMap((node) => [Number(node.id), ...treeIds(node.children ?? [])]);
}

test.describe('Team page access follows current team membership', () => {
  test('teammates read team pages; removed members and outsiders cannot', async ({ request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const folder = `tpa-${stamp}`;
    const marker = { owner: `tpao${stamp}`, member: `tpam${stamp}` };

    const owner = await registerTestUser(request, 'tpa-owner');
    const member = await registerTestUser(request, 'tpa-member');
    const outsider = await registerTestUser(request, 'tpa-outsider');
    const ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    const memberRequest = await createAuthenticatedApiContext(member.email, member.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const teamIds: number[] = [];

    const createTeamPage = async (
      ctx: APIRequestContext,
      data: { title: string; slug: string; content: string; author: string; teamId: number }
    ) => {
      const response = await ctx.post('/api/pages', {
        data: { ...data, folder, tags: [`tag-${data.slug}`] },
      });
      expect(response.status(), `create ${data.slug}`).toBe(201);
      return (await response.json()) as { id: number; slug: string };
    };
    const reads = async (ctx: APIRequestContext, page: { id: number; slug: string }) => [
      (await ctx.get(`/api/pages/${page.id}`)).status(),
      (await ctx.get(`/api/pages/slug/${page.slug}`)).status(),
    ];
    // Every page a caller sees in any team or general listing must open for that caller.
    const expectListedPagesReadable = async (
      actor: string,
      ctx: APIRequestContext,
      teamId: number
    ) => {
      const listed = new Set<number>();
      for (const path of [
        `/api/pages?teamId=${teamId}&limit=100`,
        '/api/pages?limit=100',
        `/api/folders/${folder}/pages`,
      ]) {
        const response = await ctx.get(path);
        if (response.status() === 200)
          pageIds(await response.json()).forEach((id) => listed.add(id));
      }
      for (const path of [`/api/page-tree?teamId=${teamId}`, '/api/page-tree']) {
        const response = await ctx.get(path);
        if (response.status() === 200)
          treeIds(await response.json()).forEach((id) => listed.add(id));
      }
      for (const id of listed) {
        const direct = await ctx.get(`/api/pages/${id}`);
        expect(direct.status(), `${actor} lists page ${id} it cannot open`).toBe(200);
      }
      return listed;
    };

    try {
      // ── Arrange: one team with an admitted member, each writing a page; an outsider's team ──
      const teamResponse = await ownerRequest.post('/api/teams', {
        data: { name: `tpa-team-${stamp}`, displayName: `TPA Team ${stamp}` },
      });
      expect(teamResponse.status()).toBe(201);
      const team = await teamResponse.json();
      teamIds.push(team.id);

      const outsiderTeamResponse = await outsiderRequest.post('/api/teams', {
        data: { name: `tpa-other-${stamp}`, displayName: `TPA Other ${stamp}` },
      });
      expect(outsiderTeamResponse.status()).toBe(201);
      teamIds.push((await outsiderTeamResponse.json()).id);

      const admit = await ownerRequest.post(`/api/teams/${team.id}/memberships`, {
        data: { email: member.email },
      });
      expect(admit.status()).toBe(201);
      const memberUserId = Number((await admit.json()).userId);

      const ownerPage = await createTeamPage(ownerRequest, {
        title: `Owner plan ${marker.owner}`,
        slug: `tpa-owner-${stamp}`,
        content: `Owner content ${marker.owner}`,
        author: owner.email,
        teamId: team.id,
      });
      const memberPage = await createTeamPage(memberRequest, {
        title: `Member note ${marker.member}`,
        slug: `tpa-member-${stamp}`,
        content: `Member content ${marker.member}`,
        author: member.email,
        teamId: team.id,
      });

      // ── 1. Teammates read each other's pages, and only read them ──
      expect(await reads(memberRequest, ownerPage)).toEqual([200, 200]);
      expect(await reads(ownerRequest, memberPage)).toEqual([200, 200]);
      const memberEdit = await memberRequest.put(`/api/pages/${ownerPage.id}`, {
        data: { title: `Edited by teammate ${stamp}` },
      });
      expect(memberEdit.status()).toBe(403);
      expect((await memberRequest.delete(`/api/pages/${ownerPage.id}`)).status()).toBe(403);
      expect((await memberRequest.get(`/api/pages/${ownerPage.id}/permissions`)).status()).toBe(
        403
      );
      expect(await (await ownerRequest.get(`/api/pages/${ownerPage.id}`)).json()).toMatchObject({
        title: `Owner plan ${marker.owner}`,
      });

      // Authors keep full control of their own pages.
      const memberOwnEdit = await memberRequest.put(`/api/pages/${memberPage.id}`, {
        data: { title: `Member note edited ${marker.member}` },
      });
      expect(memberOwnEdit.status()).toBe(200);

      // The team list, folder and tree now agree with direct reads.
      const memberListed = await expectListedPagesReadable('member', memberRequest, team.id);
      expect([...memberListed]).toEqual(expect.arrayContaining([ownerPage.id, memberPage.id]));
      const ownerListed = await expectListedPagesReadable('owner', ownerRequest, team.id);
      expect([...ownerListed]).toEqual(expect.arrayContaining([ownerPage.id, memberPage.id]));

      // ── 2. Outsiders stay denied, even with a user grant on a team page ──
      for (const page of [ownerPage, memberPage]) {
        for (const status of await reads(outsiderRequest, page))
          expect([403, 404]).toContain(status);
      }
      const outsiderMe = await (await outsiderRequest.get('/api/auth/me')).json();
      const grant = await ownerRequest.post(`/api/pages/${ownerPage.id}/permissions`, {
        data: { entityType: 'user', entityId: outsiderMe.id, permission: 'editor' },
      });
      expect(grant.status()).toBe(201);
      for (const status of await reads(outsiderRequest, ownerPage))
        expect([403, 404]).toContain(status);
      const outsiderEdit = await outsiderRequest.put(`/api/pages/${ownerPage.id}`, {
        data: { title: `Edited by outsider ${stamp}` },
      });
      expect(outsiderEdit.status()).toBe(403);
      const outsiderFolder = await outsiderRequest.get(`/api/folders/${folder}/pages`);
      expect(outsiderFolder.status()).toBe(200);
      expect(await outsiderFolder.text()).not.toContain(marker.owner);
      expect(await outsiderFolder.text()).not.toContain(marker.member);

      // ── 3. A removed member loses every team page, including the one they wrote ──
      const revoke = await ownerRequest.delete(`/api/teams/${team.id}/memberships/${memberUserId}`);
      expect(revoke.status()).toBe(204);

      for (const page of [ownerPage, memberPage]) {
        for (const status of await reads(memberRequest, page)) expect([403, 404]).toContain(status);
      }
      const revokedEdit = await memberRequest.put(`/api/pages/${memberPage.id}`, {
        data: { title: `Edited after removal ${stamp}` },
      });
      expect(revokedEdit.status()).toBe(403);
      expect((await memberRequest.delete(`/api/pages/${memberPage.id}`)).status()).toBe(403);
      expect((await memberRequest.get(`/api/pages/${memberPage.id}/permissions`)).status()).toBe(
        403
      );
      const memberMe = await (await memberRequest.get('/api/auth/me')).json();
      const selfGrant = await memberRequest.post(`/api/pages/${memberPage.id}/permissions`, {
        data: { entityType: 'user', entityId: memberMe.id, permission: 'owner' },
      });
      expect(selfGrant.status()).toBe(403);
      const revokedFolder = await memberRequest.get(`/api/folders/${folder}/pages`);
      expect(revokedFolder.status()).toBe(200);
      expect(await revokedFolder.text()).not.toContain(marker.member);
      expect(await revokedFolder.text()).not.toContain(marker.owner);
      const revokedListed = await expectListedPagesReadable(
        'removed member',
        memberRequest,
        team.id
      );
      expect([...revokedListed]).not.toContain(memberPage.id);
      expect([...revokedListed]).not.toContain(ownerPage.id);

      // The page itself is untouched and still readable by the team.
      const afterRevoke = await ownerRequest.get(`/api/pages/${memberPage.id}`);
      expect(afterRevoke.status()).toBe(200);
      expect(await afterRevoke.json()).toMatchObject({
        title: `Member note edited ${marker.member}`,
      });

      // ── 4. Re-admission restores the member's own grants; nothing was deleted ──
      const readmit = await ownerRequest.post(`/api/teams/${team.id}/memberships`, {
        data: { email: member.email },
      });
      expect(readmit.status()).toBe(201);
      expect(await reads(memberRequest, memberPage)).toEqual([200, 200]);
      const readmittedEdit = await memberRequest.put(`/api/pages/${memberPage.id}`, {
        data: { title: `Member note restored ${marker.member}` },
      });
      expect(readmittedEdit.status()).toBe(200);
      expect((await memberRequest.get(`/api/pages/${memberPage.id}/permissions`)).status()).toBe(
        200
      );
    } finally {
      for (const teamId of teamIds) {
        await ownerRequest.delete(`/api/teams/${teamId}`).catch(() => {});
        await outsiderRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      }
      await ownerRequest.dispose();
      await memberRequest.dispose();
      await outsiderRequest.dispose();
    }
  });
});
