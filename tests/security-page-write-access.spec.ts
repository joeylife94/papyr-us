/**
 * Page write routes authorize like their single-page counterparts, end to end against the real
 * server, authentication, team membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Rules under test (one test each):
 * - bulk move/tags need editor and bulk delete needs owner on every listed page; one page
 *   falling short rejects the whole call and nothing changes;
 * - removing a page permission only removes a permission of the page named in the path;
 * - PUT /api/pages/:id: changing author, team or trash state needs owner, and a page can only
 *   move into a team the caller belongs to; editors keep saving content as before;
 * - restoring and permanently deleting a trashed page need owner, and only trashed pages can
 *   be permanently deleted; the trash list shows a trashed page only to callers who can read
 *   it, and never its content;
 * - markdown import needs membership of the target team, like POST /api/pages.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

type Page = { id: number; folder: string; tags: string[]; teamId: number | null; author: string };
type User = { email: string; password: string };

test.describe('Page write routes enforce page permissions', () => {
  const stamp = Date.now();
  const folder = `pwa-${stamp}`;
  let owner: User;
  let editor: User;
  let outsider: User;
  let ownerRequest: APIRequestContext;
  let editorRequest: APIRequestContext;
  let outsiderRequest: APIRequestContext;
  let editorUserId: number;
  // The owner's team (the editor is a member), a second team of the owner's, the outsider's team
  let team: number;
  let secondTeam: number;
  let outsiderTeam: number;
  const teamIds: number[] = [];
  let pageCount = 0;

  const createTeam = async (ctx: APIRequestContext, name: string) => {
    const response = await ctx.post('/api/teams', {
      data: { name: `${name}-${stamp}`, displayName: `${name} ${stamp}` },
    });
    expect(response.status(), `create team ${name}`).toBe(201);
    const { id } = (await response.json()) as { id: number };
    teamIds.push(id);
    return id;
  };
  const createPage = async (ctx: APIRequestContext, author: string, teamId: number) => {
    pageCount += 1;
    const response = await ctx.post('/api/pages', {
      data: {
        title: `Page ${pageCount} ${stamp}`,
        slug: `pwa-${pageCount}-${stamp}`,
        content: `content ${pageCount}`,
        folder,
        tags: ['t0'],
        author,
        teamId,
      },
    });
    expect(response.status(), `create page ${pageCount}`).toBe(201);
    return (await response.json()) as Page;
  };
  /** A page of the owner's team that the editor may edit (user grant). */
  const createSharedPage = async () => {
    const page = await createPage(ownerRequest, owner.email, team);
    const response = await ownerRequest.post(`/api/pages/${page.id}/permissions`, {
      data: { entityType: 'user', entityId: editorUserId, permission: 'editor' },
    });
    expect(response.status()).toBe(201);
    return { page, grantId: Number((await response.json()).id) };
  };
  const ownerView = async (page: Page) => {
    const response = await ownerRequest.get(`/api/pages/${page.id}`);
    return { status: response.status(), page: (await response.json()) as Page };
  };

  test.beforeAll(async ({ request }) => {
    owner = await registerTestUser(request, 'pwa-owner');
    editor = await registerTestUser(request, 'pwa-editor');
    outsider = await registerTestUser(request, 'pwa-outsider');
    ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    editorRequest = await createAuthenticatedApiContext(editor.email, editor.password);
    outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);

    team = await createTeam(ownerRequest, 'pwa-team');
    secondTeam = await createTeam(ownerRequest, 'pwa-second');
    outsiderTeam = await createTeam(outsiderRequest, 'pwa-outside');
    const admit = await ownerRequest.post(`/api/teams/${team}/memberships`, {
      data: { email: editor.email },
    });
    expect(admit.status()).toBe(201);
    editorUserId = Number((await admit.json()).userId);
  });

  test.afterAll(async () => {
    for (const teamId of teamIds) {
      await ownerRequest?.delete(`/api/teams/${teamId}`).catch(() => {});
      await outsiderRequest?.delete(`/api/teams/${teamId}`).catch(() => {});
    }
    await ownerRequest?.dispose();
    await editorRequest?.dispose();
    await outsiderRequest?.dispose();
  });

  test('bulk operations need the single-page level on every listed page', async () => {
    const { page: shared } = await createSharedPage();
    const { page: shared2 } = await createSharedPage();
    const ownerOnly = await createPage(ownerRequest, owner.email, team);
    const moved = `${folder}-moved`;

    for (const [path, data] of [
      ['/api/pages/bulk/move', { pageIds: [shared.id], folder: moved }],
      ['/api/pages/bulk/tags', { pageIds: [shared.id], addTags: ['tx'] }],
      ['/api/pages/bulk/delete', { pageIds: [shared.id] }],
    ] as const) {
      expect((await outsiderRequest.post(path, { data })).status(), `outsider ${path}`).toBe(403);
    }
    // One page the editor may not edit rejects the whole call; delete needs owner.
    for (const [path, data] of [
      ['/api/pages/bulk/move', { pageIds: [shared.id, ownerOnly.id], folder: moved }],
      ['/api/pages/bulk/tags', { pageIds: [shared.id, ownerOnly.id], addTags: ['tx'] }],
      ['/api/pages/bulk/delete', { pageIds: [shared.id] }],
    ] as const) {
      expect((await editorRequest.post(path, { data })).status(), `editor ${path}`).toBe(403);
    }
    for (const page of [shared, ownerOnly]) {
      const view = await ownerView(page);
      expect(view.status).toBe(200);
      expect(view.page).toMatchObject({ folder, tags: ['t0'] });
    }

    const editorMove = await editorRequest.post('/api/pages/bulk/move', {
      data: { pageIds: [shared.id, shared2.id], folder: moved },
    });
    expect(editorMove.status()).toBe(200);
    expect(await editorMove.json()).toEqual({ updated: 2 });
    const editorTags = await editorRequest.post('/api/pages/bulk/tags', {
      data: { pageIds: [shared.id], addTags: ['t1'] },
    });
    expect(editorTags.status()).toBe(200);
    expect((await ownerView(shared)).page).toMatchObject({ folder: moved, tags: ['t0', 't1'] });

    const ownerDelete = await ownerRequest.post('/api/pages/bulk/delete', {
      data: { pageIds: [shared2.id] },
    });
    expect(ownerDelete.status()).toBe(200);
    expect(await ownerDelete.json()).toEqual({ deleted: 1 });
    expect((await ownerRequest.get(`/api/pages/${shared2.id}`)).status()).toBe(404);
  });

  test('removing a permission only touches the page named in the path', async () => {
    const { page: shared, grantId } = await createSharedPage();
    const outsiderPage = await createPage(outsiderRequest, outsider.email, outsiderTeam);

    const foreign = await outsiderRequest.delete(
      `/api/pages/${outsiderPage.id}/permissions/${grantId}`
    );
    expect(foreign.status()).toBe(404);
    const permissions = await (
      await ownerRequest.get(`/api/pages/${shared.id}/permissions`)
    ).json();
    expect(permissions.map((p: { id: number }) => p.id)).toContain(grantId);

    const own = await ownerRequest.delete(`/api/pages/${shared.id}/permissions/${grantId}`);
    expect(own.status()).toBe(200);
  });

  test('changing author, team or trash state through PUT needs owner', async () => {
    const { page: shared } = await createSharedPage();

    // The editor UI re-sends the current author with every save.
    const editorSave = await editorRequest.put(`/api/pages/${shared.id}`, {
      data: { title: `Shared edited ${stamp}`, author: owner.email },
    });
    expect(editorSave.status()).toBe(200);
    for (const data of [
      { author: editor.email },
      { teamId: secondTeam },
      { teamId: outsiderTeam },
      { teamId: null },
      { deletedAt: null },
    ]) {
      const response = await editorRequest.put(`/api/pages/${shared.id}`, { data });
      expect(response.status(), `editor PUT ${JSON.stringify(data)}`).toBe(403);
    }
    expect((await editorRequest.get(`/api/pages/${shared.id}/permissions`)).status()).toBe(403);
    expect((await ownerView(shared)).page).toMatchObject({ teamId: team, author: owner.email });

    // Owners may change both, but only into a team they belong to.
    const toForeignTeam = await ownerRequest.put(`/api/pages/${shared.id}`, {
      data: { teamId: outsiderTeam },
    });
    expect(toForeignTeam.status()).toBe(403);
    const toOwnTeam = await ownerRequest.put(`/api/pages/${shared.id}`, {
      data: { teamId: secondTeam, author: `Owner ${stamp}` },
    });
    expect(toOwnTeam.status()).toBe(200);
    expect((await ownerView(shared)).page).toMatchObject({
      teamId: secondTeam,
      author: `Owner ${stamp}`,
    });
    expect((await outsiderRequest.get(`/api/pages/${shared.id}`)).status()).toBe(403);
  });

  test('restoring and permanently deleting trashed pages need owner', async () => {
    const { page: trashed } = await createSharedPage();
    const { page: live } = await createSharedPage();
    expect((await ownerRequest.delete(`/api/pages/${trashed.id}`)).status()).toBe(200);

    const trashOf = async (ctx: APIRequestContext) => {
      const response = await ctx.get('/api/trash');
      expect(response.status()).toBe(200);
      return (await response.json()) as Array<Record<string, unknown>>;
    };
    const listed = (await trashOf(ownerRequest)).find((item) => item.id === trashed.id);
    expect(listed).toMatchObject({ id: trashed.id, teamId: team });
    expect(listed).not.toHaveProperty('content');
    expect(listed).not.toHaveProperty('blocks');
    expect((await trashOf(editorRequest)).some((item) => item.id === trashed.id)).toBe(true);
    expect((await trashOf(outsiderRequest)).some((item) => item.id === trashed.id)).toBe(false);

    for (const ctx of [editorRequest, outsiderRequest]) {
      expect((await ctx.post(`/api/trash/${trashed.id}/restore`)).status()).toBe(403);
      expect((await ctx.delete(`/api/trash/${trashed.id}`)).status()).toBe(403);
    }
    expect((await ownerRequest.get(`/api/pages/${trashed.id}`)).status()).toBe(404);

    // A page that is not in the trash is never permanently deleted, even by its owner.
    expect((await ownerRequest.delete(`/api/trash/${live.id}`)).status()).toBe(404);
    expect((await ownerView(live)).status).toBe(200);

    expect((await ownerRequest.post(`/api/trash/${trashed.id}/restore`)).status()).toBe(200);
    expect((await ownerRequest.get(`/api/pages/${trashed.id}`)).status()).toBe(200);
    expect((await ownerRequest.delete(`/api/pages/${trashed.id}`)).status()).toBe(200);
    expect((await ownerRequest.delete(`/api/trash/${trashed.id}`)).status()).toBe(200);
    expect((await ownerRequest.post(`/api/trash/${trashed.id}/restore`)).status()).toBe(404);
  });

  test('markdown import needs membership of the target team', async () => {
    const outsiderImport = await outsiderRequest.post('/api/pages/import/markdown', {
      data: { content: `# Import ${stamp}`, folder, teamId: team },
    });
    expect(outsiderImport.status()).toBe(403);
    const editorImport = await editorRequest.post('/api/pages/import/markdown', {
      data: { content: `# Import ${stamp}`, folder, teamId: team },
    });
    expect(editorImport.status()).toBe(201);
    expect(await editorImport.json()).toMatchObject({ teamId: team });
  });
});
