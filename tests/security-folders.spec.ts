/**
 * GET /api/folders follows the page read boundary (#130), end to end against the real server,
 * authentication, team membership and PostgreSQL. Synthetic users, teams and pages only. The
 * route-level rules are in server/tests/folder-pages-access.test.ts and the SQL rule in
 * tests/integration-layer4/folder-listing.test.ts.
 *
 * Rules under test:
 * - without a valid session the route answers 401 and names no folder;
 * - a caller sees a folder only while it holds a live page they may list: their teams' pages
 *   and team-less pages they can read; never a folder holding only another team's pages, a
 *   private page of someone else, or trashed pages;
 * - every listed folder has pages in GET /api/folders/:folder/pages for that caller;
 * - leaving a team removes its folders at once;
 * - the folder pickers of the new-page and page editors still load the caller's folders, and
 *   only those.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';

test.describe('Folder names follow the page read boundary', () => {
  test('GET /api/folders names only folders the caller can list', async ({ request, page }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const folder = {
      shared: `secf-shared-${stamp}`,
      aOnly: `secf-a-only-${stamp}`,
      bOnly: `secf-b-only-${stamp}`,
      bPrivate: `secf-b-private-${stamp}`,
      aTrashed: `secf-a-trashed-${stamp}`,
    };
    const allFolders = Object.values(folder);

    const ownerA = await registerTestUser(request, 'secf-owner-a');
    const memberA = await registerTestUser(request, 'secf-member-a');
    const ownerB = await registerTestUser(request, 'secf-owner-b');
    const solo = await registerTestUser(request, 'secf-solo');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const soloRequest = await createAuthenticatedApiContext(solo.email, solo.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const teamIds: number[] = [];

    const createPage = async (
      ctx: APIRequestContext,
      data: { slug: string; folder: string; author: string; teamId?: number }
    ) => {
      const response = await ctx.post('/api/pages', {
        data: {
          title: `Folder check ${data.slug}`,
          content: `content of ${data.slug}`,
          tags: [],
          ...data,
        },
      });
      expect(response.status(), `create ${data.slug}`).toBe(201);
      return (await response.json()) as { id: number; slug: string };
    };
    /** The caller's folder names among this test's folders. */
    const foldersOf = async (ctx: APIRequestContext) => {
      const response = await ctx.get('/api/folders');
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      for (const name of body) expect(typeof name).toBe('string');
      return (body as string[]).filter((name) => allFolders.includes(name)).sort();
    };
    const expectFolders = async (actor: string, ctx: APIRequestContext, expected: string[]) => {
      expect(await foldersOf(ctx), actor).toEqual([...expected].sort());
    };

    try {
      // ── Arrange: two teams, an admitted member, team pages, a private page, a trashed page ──
      const teamAResponse = await ownerARequest.post('/api/teams', {
        data: { name: `secf-team-a-${stamp}`, displayName: `Secf Team A ${stamp}` },
      });
      expect(teamAResponse.status()).toBe(201);
      const teamA = await teamAResponse.json();
      teamIds.push(teamA.id);
      const teamBResponse = await ownerBRequest.post('/api/teams', {
        data: { name: `secf-team-b-${stamp}`, displayName: `Secf Team B ${stamp}` },
      });
      expect(teamBResponse.status()).toBe(201);
      const teamB = await teamBResponse.json();
      teamIds.push(teamB.id);
      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);
      const memberAUserId = Number((await admit.json()).userId);

      const pageA = await createPage(ownerARequest, {
        slug: `secf-a-shared-${stamp}`,
        folder: folder.shared,
        author: ownerA.email,
        teamId: teamA.id,
      });
      await createPage(ownerBRequest, {
        slug: `secf-b-shared-${stamp}`,
        folder: folder.shared,
        author: ownerB.email,
        teamId: teamB.id,
      });
      await createPage(ownerARequest, {
        slug: `secf-a-only-${stamp}`,
        folder: folder.aOnly,
        author: ownerA.email,
        teamId: teamA.id,
      });
      await createPage(ownerBRequest, {
        slug: `secf-b-only-${stamp}`,
        folder: folder.bOnly,
        author: ownerB.email,
        teamId: teamB.id,
      });
      // A personal page whose explicit permissions deny everyone but its owner.
      const privateB = await createPage(ownerBRequest, {
        slug: `secf-b-private-${stamp}`,
        folder: folder.bPrivate,
        author: ownerB.email,
      });
      const ownerBMe = await (await ownerBRequest.get('/api/auth/me')).json();
      const restrict = await ownerBRequest.post(`/api/pages/${privateB.id}/permissions`, {
        data: { entityType: 'user', entityId: ownerBMe.id, permission: 'owner' },
      });
      expect(restrict.status()).toBe(201);
      // A Team A page in the trash: its folder is listed for nobody, not even Team A.
      const trashedA = await createPage(ownerARequest, {
        slug: `secf-a-trashed-${stamp}`,
        folder: folder.aTrashed,
        author: ownerA.email,
        teamId: teamA.id,
      });
      expect(await foldersOf(ownerARequest)).toContain(folder.aTrashed);
      expect((await ownerARequest.delete(`/api/pages/${trashedA.id}`)).status()).toBe(200);

      // ── 1. No session, no folder names ──
      const anonymousResponse = await anonymous.get('/api/folders');
      expect(anonymousResponse.status(), 'anonymous').toBe(401);
      const anonymousText = await anonymousResponse.text();
      for (const name of allFolders) expect(anonymousText).not.toContain(name);
      const forged = await anonymous.get('/api/folders', {
        headers: { Cookie: 'accessToken=not-a-valid-token' },
      });
      expect(forged.status(), 'invalid token').toBe(401);
      expect(await forged.text()).not.toContain(folder.shared);

      // ── 2. Each caller sees exactly the folders holding a page they may list ──
      await expectFolders('ownerA', ownerARequest, [folder.shared, folder.aOnly]);
      await expectFolders('memberA', memberARequest, [folder.shared, folder.aOnly]);
      await expectFolders('ownerB', ownerBRequest, [folder.shared, folder.bOnly, folder.bPrivate]);
      await expectFolders('solo', soloRequest, []);

      // ── 3. Invariant: every listed folder has pages the caller can list ──
      for (const [actor, ctx] of [
        ['ownerA', ownerARequest],
        ['memberA', memberARequest],
        ['ownerB', ownerBRequest],
        ['solo', soloRequest],
      ] as const) {
        const listed = await foldersOf(ctx);
        for (const name of allFolders) {
          const pages = await ctx.get(`/api/folders/${name}/pages`);
          expect(pages.status()).toBe(200);
          const count = ((await pages.json()) as unknown[]).length;
          expect(count > 0, `${actor} folder ${name}`).toBe(listed.includes(name));
        }
      }

      // ── 4. Restoring the trashed page brings its folder back for its team only ──
      const restore = await ownerARequest.post(`/api/trash/${trashedA.id}/restore`);
      expect(restore.status()).toBe(200);
      expect(await foldersOf(ownerARequest)).toContain(folder.aTrashed);
      expect(await foldersOf(ownerBRequest)).not.toContain(folder.aTrashed);
      expect((await ownerARequest.delete(`/api/pages/${trashedA.id}`)).status()).toBe(200);

      // ── 5. The folder pickers load the caller's folders, and only those ──
      await loginPageWithCookies(page, ownerA.email, ownerA.password);
      const pickerOptions = async () =>
        (await page.getByLabel('폴더').locator('option').allTextContents()).filter((name) =>
          allFolders.includes(name)
        );
      await page.goto('/create');
      await expect(page.getByTestId('page-title')).toBeVisible();
      await expect
        .poll(pickerOptions)
        .toEqual(expect.arrayContaining([folder.shared, folder.aOnly]));
      for (const hidden of [folder.bOnly, folder.bPrivate, folder.aTrashed]) {
        expect(await pickerOptions()).not.toContain(hidden);
      }
      await page.goto(`/page/${pageA.slug}`);
      await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
      await expect
        .poll(pickerOptions)
        .toEqual(expect.arrayContaining([folder.shared, folder.aOnly]));
      for (const hidden of [folder.bOnly, folder.bPrivate, folder.aTrashed]) {
        expect(await pickerOptions()).not.toContain(hidden);
      }

      // ── 6. A member who leaves the team loses its folders at once ──
      const revoke = await ownerARequest.delete(
        `/api/teams/${teamA.id}/memberships/${memberAUserId}`
      );
      expect(revoke.status()).toBe(204);
      await expectFolders('revoked memberA', memberARequest, []);
    } finally {
      for (const teamId of teamIds) {
        await ownerARequest.delete(`/api/teams/${teamId}`).catch(() => {});
        await ownerBRequest.delete(`/api/teams/${teamId}`).catch(() => {});
      }
      await anonymous.dispose();
      await ownerARequest.dispose();
      await memberARequest.dispose();
      await ownerBRequest.dispose();
      await soloRequest.dispose();
    }
  });
});
