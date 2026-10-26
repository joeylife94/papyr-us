/**
 * Page tree rules (#103 E5, decisions D4/D5) end to end against the real server, authentication,
 * team membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Invariants under test:
 * - GET /api/pages/tree returns only pages the caller can read, from one scope it may use;
 * - a readable page whose parent is unreadable or trashed is a root page, and nothing in the
 *   response (or its breadcrumb) hints at that parent (D4);
 * - moves need editor on the page and the new parent, never cross teams (403) and never build
 *   a loop (400); an unreadable parent answers like a missing one (404);
 * - POST /api/pages and PUT /api/pages/:id cannot place a page around those rules;
 * - deleting a page trashes its live subtree only if the caller may delete every page in it,
 *   otherwise nothing changes and the refusal names no page; restoring brings the subtree back.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';

interface TreeNode {
  id: number;
  title: string;
  parentId: number | null;
  position: number;
}

test.describe('Page tree access control', () => {
  test('tree, move, create, update and subtree delete follow the tree rules', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const marker = `sectree${stamp}`;

    const ownerA = await registerTestUser(request, 'tree-owner-a');
    const memberA = await registerTestUser(request, 'tree-member-a');
    const ownerB = await registerTestUser(request, 'tree-owner-b');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const created: Array<{ ctx: APIRequestContext; id: number }> = [];
    const teamIds: number[] = [];

    const createPage = async (
      ctx: APIRequestContext,
      title: string,
      extra: { teamId?: number; parentId?: number; position?: number } = {}
    ) =>
      ctx.post('/api/pages', {
        data: {
          title,
          slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`,
          content: `${title} content`,
          folder: 'docs',
          tags: [],
          author: 'ignored',
          ...extra,
        },
      });
    const mustCreate = async (
      ctx: APIRequestContext,
      title: string,
      extra: { teamId?: number; parentId?: number } = {}
    ) => {
      const response = await createPage(ctx, title, extra);
      expect(response.status(), `create ${title}`).toBe(201);
      const page = (await response.json()) as { id: number; slug: string };
      created.push({ ctx, id: page.id });
      return page;
    };
    const treeOf = async (ctx: APIRequestContext, teamId?: number) => {
      const response = await ctx.get(`/api/pages/tree${teamId ? `?teamId=${teamId}` : ''}`);
      expect(response.status()).toBe(200);
      const text = await response.text();
      return { pages: JSON.parse(text).pages as TreeNode[], text };
    };
    const move = (ctx: APIRequestContext, id: number, parentId: number | null, index = 0) =>
      ctx.post(`/api/pages/${id}/move`, { data: { parentId, index } });
    const makeTeam = async (ctx: APIRequestContext, name: string) => {
      const response = await ctx.post('/api/teams', {
        data: { name: `${name}-${stamp}`, displayName: `${name} ${stamp}` },
      });
      expect(response.status()).toBe(201);
      const team = await response.json();
      teamIds.push(team.id);
      return team as { id: number; name: string };
    };

    try {
      // ── Arrange: team A (ownerA + memberA), team C (ownerA), team B (ownerB) ──
      const teamA = await makeTeam(ownerARequest, 'tree-a');
      const teamC = await makeTeam(ownerARequest, 'tree-c');
      const teamB = await makeTeam(ownerBRequest, 'tree-b');
      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);
      const memberAUserId = Number((await admit.json()).userId);

      const a1 = await mustCreate(ownerARequest, `A1 ${marker}`, { teamId: teamA.id });
      const a2 = await mustCreate(ownerARequest, `A2 ${marker}`, { teamId: teamA.id });
      const a1c = await mustCreate(ownerARequest, `A1 child ${marker}`, {
        teamId: teamA.id,
        parentId: a1.id,
      });
      const c1 = await mustCreate(ownerARequest, `C1 ${marker}`, { teamId: teamC.id });
      const b1 = await mustCreate(ownerBRequest, `B1 ${marker}`, { teamId: teamB.id });

      // ── 1. The tree is scoped and readable-only ──
      expect((await anonymous.get(`/api/pages/tree?teamId=${teamA.id}`)).status()).toBe(401);
      for (const teamId of [teamA.id, teamC.id]) {
        const response = await ownerBRequest.get(`/api/pages/tree?teamId=${teamId}`);
        expect(response.status()).toBe(403);
        expect(await response.text()).not.toContain(marker);
      }
      const ownerBTree = await treeOf(ownerBRequest, teamB.id);
      expect(ownerBTree.pages.map((page) => page.id)).toEqual([b1.id]);
      const memberTree = await treeOf(memberARequest, teamA.id);
      expect(memberTree.pages.map((page) => [page.id, page.parentId, page.position])).toEqual([
        [a1.id, null, 0],
        [a1c.id, a1.id, 0],
        [a2.id, null, 1],
      ]);
      expect(memberTree.text).not.toContain(`C1 ${marker}`);
      expect(memberTree.text).not.toContain(`B1 ${marker}`);
      // The personal tree never carries team pages.
      expect((await treeOf(ownerARequest)).text).not.toContain(marker);

      // ── 2. Moves: permission, team and loop rules ──
      expect((await move(ownerARequest, a1.id, c1.id)).status(), 'cross-team move').toBe(403);
      expect((await move(ownerARequest, a1.id, a1c.id)).status(), 'into own child').toBe(400);
      expect((await move(ownerARequest, a1.id, a1.id)).status(), 'under itself').toBe(400);
      expect((await move(memberARequest, a2.id, a1.id)).status(), 'viewer moves').toBe(403);
      expect((await move(ownerBRequest, a2.id, null)).status(), 'outsider moves').toBe(404);
      const unreadableParent = await move(ownerBRequest, b1.id, a1.id);
      const missingParent = await move(ownerBRequest, b1.id, 2_000_000_000);
      expect(unreadableParent.status()).toBe(404);
      expect(await unreadableParent.json()).toEqual(await missingParent.json());

      const m1 = await mustCreate(memberARequest, `M1 ${marker}`, { teamId: teamA.id });
      expect((await move(memberARequest, m1.id, a1.id)).status(), 'parent not editable').toBe(403);
      expect((await move(memberARequest, m1.id, null, 0)).status()).toBe(200);
      expect((await move(ownerARequest, a2.id, a1.id, 0)).status()).toBe(200);
      const afterMoves = await treeOf(ownerARequest, teamA.id);
      expect(afterMoves.pages.map((page) => [page.id, page.parentId, page.position])).toEqual([
        [m1.id, null, 0],
        [a1.id, null, 1],
        [a2.id, a1.id, 0],
        [a1c.id, a1.id, 1],
      ]);
      expect((await move(ownerARequest, a2.id, null, 5)).status()).toBe(200);

      // ── 3. Create and update cannot bypass the rules ──
      expect(
        (await createPage(ownerARequest, 'X1', { teamId: teamA.id, parentId: c1.id })).status()
      ).toBe(403);
      expect(
        (await createPage(memberARequest, 'X2', { teamId: teamA.id, parentId: a1.id })).status()
      ).toBe(403);
      const unreadableCreate = await createPage(ownerBRequest, 'X3', {
        teamId: teamB.id,
        parentId: a1.id,
      });
      const missingCreate = await createPage(ownerBRequest, 'X4', {
        teamId: teamB.id,
        parentId: 2_000_000_000,
      });
      expect(unreadableCreate.status()).toBe(404);
      expect(await unreadableCreate.json()).toEqual(await missingCreate.json());
      expect(
        (await createPage(ownerARequest, 'X5', { teamId: teamA.id, position: 0 })).status()
      ).toBe(400);
      for (const data of [{ parentId: a1.id }, { position: 7 }]) {
        const put = await ownerARequest.put(`/api/pages/${a2.id}`, { data });
        expect(put.status(), `PUT ${JSON.stringify(data)}`).toBe(400);
        const autosave = await ownerARequest.put(`/api/pages/${a2.id}/autosave`, { data });
        expect(autosave.status(), `autosave ${JSON.stringify(data)}`).toBe(400);
      }
      const teamChange = await ownerARequest.put(`/api/pages/${a1.id}`, {
        data: { teamId: teamC.id },
      });
      expect(teamChange.status(), 'a page with sub-pages keeps its team').toBe(409);
      const unchanged = (await treeOf(ownerARequest, teamA.id)).pages;
      expect(unchanged.find((page) => page.id === a2.id)?.parentId).toBeNull();
      expect(unchanged.find((page) => page.id === a1c.id)?.parentId).toBe(a1.id);

      // ── 4. D4: a readable page under an unreadable parent is a root page, without a trace ──
      const ownerBMe = await (await ownerBRequest.get('/api/auth/me')).json();
      const secret = await mustCreate(ownerARequest, `Secret parent ${marker}`);
      const grant = await ownerARequest.post(`/api/pages/${secret.id}/permissions`, {
        data: { entityType: 'user', entityId: ownerBMe.id, permission: 'editor' },
      });
      expect(grant.status()).toBe(201);
      const grantId = (await grant.json()).id;
      const visibleChild = await mustCreate(ownerBRequest, `Visible child ${marker}`, {
        parentId: secret.id,
      });
      const revoke = await ownerARequest.delete(`/api/pages/${secret.id}/permissions/${grantId}`);
      expect(revoke.status()).toBe(200);
      expect((await ownerBRequest.get(`/api/pages/${secret.id}`)).status()).toBe(403);

      const ownerBPersonal = await treeOf(ownerBRequest);
      const asRoot = ownerBPersonal.pages.find((page) => page.id === visibleChild.id);
      expect(asRoot?.parentId).toBeNull();
      expect(ownerBPersonal.pages.some((page) => page.id === secret.id)).toBe(false);
      expect(ownerBPersonal.text).not.toContain('Secret parent');
      expect(ownerBPersonal.text).not.toContain(`"parentId":${secret.id}`);
      const crumbs = await ownerBRequest.get(`/api/pages/${visibleChild.id}/ancestors`);
      expect(crumbs.status()).toBe(200);
      expect(await crumbs.json()).toEqual({ ancestors: [] });
      // The parent's owner does not see the child either.
      const ownerAPersonal = await treeOf(ownerARequest);
      expect(ownerAPersonal.pages.some((page) => page.id === secret.id)).toBe(true);
      expect(ownerAPersonal.text).not.toContain('Visible child');

      // ── 5. D5: the subtree goes only when every page in it may be deleted ──
      const refused = await ownerARequest.delete(`/api/pages/${secret.id}`);
      expect(refused.status()).toBe(403);
      const refusedText = await refused.text();
      expect(JSON.parse(refusedText).code).toBe('SUBTREE_NOT_DELETABLE');
      expect(refusedText).not.toContain('Visible child');
      expect(refusedText).not.toContain(String(visibleChild.id));
      const bulkRefused = await ownerARequest.post('/api/pages/bulk/delete', {
        data: { pageIds: [secret.id] },
      });
      expect(bulkRefused.status()).toBe(403);
      expect((await ownerARequest.get(`/api/pages/${secret.id}`)).status()).toBe(200);
      expect((await ownerBRequest.get(`/api/pages/${visibleChild.id}`)).status()).toBe(200);

      const deleted = await ownerARequest.delete(`/api/pages/${a1.id}`);
      expect(deleted.status()).toBe(200);
      expect((await deleted.json()).subPages).toBe(1);
      expect((await ownerARequest.get(`/api/pages/${a1c.id}`)).status()).toBe(404);
      expect((await treeOf(memberARequest, teamA.id)).text).not.toContain(`A1 ${marker}`);

      // Restoring only the child: it is live under a trashed parent, so it is a root page (D4).
      expect((await ownerARequest.post(`/api/trash/${a1c.id}/restore`)).status()).toBe(200);
      const childAlone = (await treeOf(memberARequest, teamA.id)).pages;
      expect(childAlone.find((page) => page.id === a1c.id)?.parentId).toBeNull();
      expect(childAlone.some((page) => page.id === a1.id)).toBe(false);

      // Restoring the parent brings back what was trashed with it.
      expect((await ownerARequest.delete(`/api/pages/${a1c.id}`)).status()).toBe(200);
      expect((await ownerARequest.post(`/api/trash/${a1.id}/restore`)).status()).toBe(200);
      const restored = (await treeOf(memberARequest, teamA.id)).pages;
      expect(restored.find((page) => page.id === a1.id)?.parentId).toBeNull();
      expect(restored.some((page) => page.id === a1c.id)).toBe(false);
      expect((await ownerARequest.post(`/api/trash/${a1c.id}/restore`)).status()).toBe(200);
      expect((await ownerARequest.delete(`/api/pages/${a1.id}`)).status()).toBe(200);
      expect((await ownerARequest.post(`/api/trash/${a1.id}/restore`)).status()).toBe(200);
      const subtreeBack = (await treeOf(memberARequest, teamA.id)).pages;
      expect(subtreeBack.find((page) => page.id === a1c.id)?.parentId).toBe(a1.id);

      // ── 6. A revoked member loses the team tree immediately ──
      const removed = await ownerARequest.delete(
        `/api/teams/${teamA.id}/memberships/${memberAUserId}`
      );
      expect(removed.status()).toBe(204);
      const revokedTree = await memberARequest.get(`/api/pages/tree?teamId=${teamA.id}`);
      expect(revokedTree.status()).toBe(403);
      expect(await revokedTree.text()).not.toContain(marker);
    } finally {
      for (const { ctx, id } of created.reverse()) {
        await ctx.delete(`/api/pages/${id}`).catch(() => {});
        await ctx.delete(`/api/trash/${id}`).catch(() => {});
      }
      for (const teamId of teamIds) {
        await ownerARequest.delete(`/api/teams/${teamId}`).catch(() => {});
        await ownerBRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      }
      await anonymous.dispose();
      await ownerARequest.dispose();
      await memberARequest.dispose();
      await ownerBRequest.dispose();
    }
  });
});
