import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// The sidebar's trash, favourites and recent pages, against the real server and database.
//
// Rules under test:
// - the trash screen lists the trashed pages the caller may list; "복원" and "영구 삭제" appear only
//   on rows the caller owns (GET /api/trash `canRestore`); a restore says how many pages came back
//   and links to the page; delete forever names the page and removes it for good;
// - favourites persist across a reload and leave the sidebar when the page is trashed, without a
//   reload; trashing also removes the page from "최근 문서"; restoring brings the favourite back;
// - "최근 문서" lists the pages this account opened, newest first, never another account's, and
//   drops a page the account can no longer read;
// - "휴지통 비우기" is shown only to a platform admin on a team's trash screen, sends nothing until
//   confirmed, and then deletes that team's trashed pages only (DELETE /api/trash?teamId=<id>).

const ADMIN_EMAIL = 'e2e-platform-admin@example.com';
const ADMIN_PASSWORD = 'Password123!';

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function createPage(api: APIRequestContext, title: string, extra: object = {}) {
  const slug = `${title.toLowerCase().replace(/\W+/g, '-')}-${stamp()}`;
  const res = await api.post('/api/pages', {
    data: { title, slug, content: 'body', folder: 'docs', author: 'u', tags: [], ...extra },
  });
  expect(res.status(), `create ${title}`).toBe(201);
  return (await res.json()) as { id: number; slug: string; title: string };
}

const favorites = (page: Page) => page.getByRole('navigation', { name: '즐겨찾기' });
const recent = (page: Page) => page.getByRole('navigation', { name: '최근 문서' });

const isTrashList = (r: { url(): string; request(): { method(): string } }) =>
  new URL(r.url()).pathname === '/api/trash' && r.request().method() === 'GET';

/** Trash the open page with its own delete button and wait for the server's answer. */
async function trashOpenPage(page: Page) {
  page.once('dialog', (dialog) => void dialog.accept());
  const trashed = page.waitForResponse(
    (r) =>
      /^\/api\/pages\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() === 'DELETE'
  );
  await page.getByRole('button', { name: '문서 삭제' }).click();
  expect((await trashed).status()).toBe(200);
}

test('trash: a page goes to the trash, comes back, goes again and is deleted for good', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'trash-owner');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const title = `Trash Flow ${stamp()}`;
  const created = await createPage(api, title);

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${created.slug}`);
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toHaveCount(0);

    // Favourite it, so the sidebar lists it under both sections
    const added = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/favorites/${created.id}` &&
        r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: '즐겨찾기에 추가' }).click();
    expect((await added).status()).toBe(201);
    await expect(page.getByRole('button', { name: '즐겨찾기에서 제거' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(favorites(page).getByRole('link', { name: title })).toBeVisible();
    await expect(recent(page).getByRole('link', { name: title })).toBeVisible();

    // Trash it from the page: it leaves both sections without a reload
    await trashOpenPage(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(favorites(page).getByRole('link', { name: title })).toHaveCount(0);
    await expect(favorites(page).getByTestId('favorites-empty')).toBeVisible();
    await expect(recent(page).getByRole('link', { name: title })).toHaveCount(0);
    expect((await api.get(`/api/pages/${created.id}`)).status()).toBe(404);

    // The trash entry in the sidebar lists it, with its owner actions
    const listed = page.waitForResponse(isTrashList);
    await page.getByRole('link', { name: '휴지통' }).click();
    expect((await listed).status()).toBe(200);
    await expect(page).toHaveURL(/\/trash$/);
    const row = page.getByTestId('trash-row').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('trash-row-team')).toHaveText('내 문서');
    await expect(row.getByRole('button', { name: `${title} 복원` })).toBeVisible();
    await expect(row.getByRole('button', { name: `${title} 영구 삭제` })).toBeVisible();

    // Restore: the notice says what came back and links to the page, which opens
    const restored = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/trash/${created.id}/restore` &&
        r.request().method() === 'POST'
    );
    await row.getByRole('button', { name: `${title} 복원` }).click();
    const restoredBody = await (await restored).json();
    expect(restoredBody.restoredCount).toBe(1);
    await expect(page.getByTestId('trash-notice')).toContainText(`"${title}" 문서를 복원했습니다.`);
    await expect(page.getByTestId('trash-row').filter({ hasText: title })).toHaveCount(0);
    // The favourite comes back with the page, still without a reload
    await expect(favorites(page).getByRole('link', { name: title })).toBeVisible();
    await page.getByTestId('trash-notice').getByRole('link', { name: '복원한 문서 열기' }).click();
    await expect(page).toHaveURL(new RegExp(`/page/${created.slug}$`));
    await expect(
      page.getByRole('tree', { name: '페이지 트리' }).getByRole('treeitem', { name: title })
    ).toBeVisible();
    await expect(recent(page).getByRole('link', { name: title })).toBeVisible();

    // Trash again and delete forever: the dialog names the page and says it cannot be undone
    await trashOpenPage(page);
    const listedAgain = page.waitForResponse(isTrashList);
    await page.getByRole('link', { name: '휴지통' }).click();
    await listedAgain;
    const again = page.getByTestId('trash-row').filter({ hasText: title });
    await again.getByRole('button', { name: `${title} 영구 삭제` }).click();
    const dialog = page.getByTestId('trash-delete-dialog');
    await expect(dialog).toContainText(`"${title}" 문서를 영구 삭제할까요?`);
    await expect(dialog).toContainText('되돌릴 수 없습니다');

    // Cancel keeps it
    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(again).toHaveCount(1);

    await again.getByRole('button', { name: `${title} 영구 삭제` }).click();
    const deleted = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/trash/${created.id}` &&
        r.request().method() === 'DELETE'
    );
    await page.getByTestId('trash-delete-confirm').click();
    expect((await deleted).status()).toBe(200);
    await expect(page.getByTestId('trash-row').filter({ hasText: title })).toHaveCount(0);
    await expect(page.getByTestId('trash-empty')).toBeVisible();
    expect((await api.get(`/api/pages/${created.id}`)).status()).toBe(404);
    expect((await api.post(`/api/trash/${created.id}/restore`)).status()).toBe(404);
  } finally {
    await api.dispose();
  }
});

test('trash: a restore counts the pages that came back with it', async ({ page, request }) => {
  const user = await registerTestUser(request, 'trash-subtree');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const parent = await createPage(api, `Subtree Parent ${stamp()}`);
  const child = await createPage(api, `Subtree Child ${stamp()}`, { parentId: parent.id });

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${parent.slug}`);
    await trashOpenPage(page);
    const listed = page.waitForResponse(isTrashList);
    await page.goto('/trash');
    await listed;
    await expect(page.getByTestId('trash-row').filter({ hasText: child.title })).toHaveCount(1);
    const restored = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/trash/${parent.id}/restore` &&
        r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: `${parent.title} 복원` }).click();
    expect((await restored).status()).toBe(200);
    await expect(page.getByTestId('trash-notice')).toContainText(
      `"${parent.title}" 문서와 하위 문서 1개를 포함해 2개를 복원했습니다.`
    );
    await expect(page.getByTestId('trash-row')).toHaveCount(0);
  } finally {
    await api.dispose();
  }
});

test('trash: a viewer who can list a trashed team page gets no restore or delete, and a team screen lists only that team', async ({
  page,
  request,
}) => {
  const owner = await registerTestUser(request, 'trash-team-owner');
  const member = await registerTestUser(request, 'trash-team-member');
  const ownerApi = await createAuthenticatedApiContext(owner.email, owner.password);
  const memberApi = await createAuthenticatedApiContext(member.email, member.password);
  const key = stamp();
  const team = await ownerApi.post('/api/teams', {
    data: { name: `trash-team-${key}`, displayName: `Trash Team ${key}` },
  });
  expect(team.status()).toBe(201);
  const teamId = Number((await team.json()).id);
  const teamName = `trash-team-${key}`;

  try {
    expect(
      (await ownerApi.put(`/api/teams/${teamId}`, { data: { membersCanEdit: false } })).status()
    ).toBe(200);
    const admit = await ownerApi.post(`/api/teams/${teamId}/memberships`, {
      data: { email: member.email },
    });
    expect(admit.status()).toBe(201);
    const teamPage = await createPage(ownerApi, `Team Trashed ${key}`, { teamId });
    const personalPage = await createPage(ownerApi, `Personal Trashed ${key}`);
    for (const created of [teamPage, personalPage]) {
      expect((await ownerApi.delete(`/api/pages/${created.id}`)).status()).toBe(200);
    }

    // API: the member lists the team page but does not own it; the owner can act on both
    const memberList = await (await memberApi.get(`/api/trash?teamId=${teamId}`)).json();
    expect(memberList.map((row: any) => [row.id, row.canRestore])).toEqual([[teamPage.id, false]]);
    const ownerList = await (await ownerApi.get('/api/trash')).json();
    const ownedRows = ownerList.filter((row: any) =>
      [teamPage.id, personalPage.id].includes(row.id)
    );
    expect(ownedRows.map((row: any) => row.canRestore)).toEqual([true, true]);

    // The member's team trash screen: the row, no actions, and only that team's page was asked for
    await loginPageWithCookies(page, member.email, member.password);
    const asked = page.waitForResponse(isTrashList);
    await page.goto(`/teams/${teamName}/trash`);
    expect(new URL((await asked).url()).searchParams.get('teamId')).toBe(String(teamId));
    const row = page.getByTestId('trash-row').filter({ hasText: teamPage.title });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('trash-row-team')).toHaveText(`Trash Team ${key}`);
    await expect(row.getByTestId('trash-row-readonly')).toBeVisible();
    await expect(page.getByRole('button', { name: /복원|영구 삭제/ })).toHaveCount(0);
    await expect(page.getByTestId('trash-row').filter({ hasText: personalPage.title })).toHaveCount(
      0
    );

    // The server refuses the same actions
    expect((await memberApi.post(`/api/trash/${teamPage.id}/restore`)).status()).toBe(403);
    expect((await memberApi.delete(`/api/trash/${teamPage.id}`)).status()).toBe(403);

    // The owner's team screen has the actions
    await loginPageWithCookies(page, owner.email, owner.password);
    const ownerAsked = page.waitForResponse(isTrashList);
    await page.goto(`/teams/${teamName}/trash`);
    await ownerAsked;
    await expect(page.getByRole('button', { name: `${teamPage.title} 복원` })).toBeVisible();
    await expect(page.getByTestId('trash-row').filter({ hasText: personalPage.title })).toHaveCount(
      0
    );
  } finally {
    await ownerApi.delete(`/api/teams/${teamId}`).catch(() => {});
    await ownerApi.dispose();
    await memberApi.dispose();
  }
});

test('trash: a team route the caller is not in asks for nothing', async ({ page, request }) => {
  const user = await registerTestUser(request, 'trash-outsider');
  await loginPageWithCookies(page, user.email, user.password);
  let trashRequests = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/trash') trashRequests += 1;
  });
  const teams = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/teams' && r.request().method() === 'GET'
  );
  await page.goto('/teams/not-my-team-0/trash');
  await teams;
  await expect(
    page.getByRole('alert').filter({ hasText: '휴지통을 볼 수 없습니다' })
  ).toBeVisible();
  expect(trashRequests).toBe(0);
});

test('favourites: add and remove with the star, persist across a reload, and hide a page the account lost access to', async ({
  page,
  request,
}) => {
  const owner = await registerTestUser(request, 'fav-owner');
  const member = await registerTestUser(request, 'fav-member');
  const ownerApi = await createAuthenticatedApiContext(owner.email, owner.password);
  const memberApi = await createAuthenticatedApiContext(member.email, member.password);
  const key = stamp();
  const team = await ownerApi.post('/api/teams', {
    data: { name: `fav-team-${key}`, displayName: `Fav Team ${key}` },
  });
  expect(team.status()).toBe(201);
  const teamId = Number((await team.json()).id);

  try {
    const admit = await ownerApi.post(`/api/teams/${teamId}/memberships`, {
      data: { email: member.email },
    });
    expect(admit.status()).toBe(201);
    const memberUserId = Number((await admit.json()).userId);
    const teamPage = await createPage(ownerApi, `Fav Team Page ${key}`, { teamId });
    const ownPage = await createPage(memberApi, `Fav Own Page ${key}`);

    await loginPageWithCookies(page, member.email, member.password);
    await page.goto(`/page/${ownPage.slug}`);
    const star = page.getByTestId('favorite-toggle');
    await expect(star).toHaveAttribute('aria-pressed', 'false');
    await expect(favorites(page).getByTestId('favorites-empty')).toBeVisible();

    const added = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/favorites/${ownPage.id}` &&
        r.request().method() === 'POST'
    );
    await star.click();
    expect((await added).status()).toBe(201);
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await expect(favorites(page).getByRole('link', { name: ownPage.title })).toBeVisible();

    // Persists across a reload, and the link opens the page
    await page.reload();
    await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(favorites(page).getByRole('link', { name: ownPage.title })).toBeVisible();

    // A second favourite, newest first; then the member loses the team and its page leaves the list
    await page.goto(`/page/${teamPage.slug}`);
    const addedTeamPage = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/favorites/${teamPage.id}` &&
        r.request().method() === 'POST'
    );
    await page.getByTestId('favorite-toggle').click();
    expect((await addedTeamPage).status()).toBe(201);
    await expect(favorites(page).getByRole('link')).toHaveText([teamPage.title, ownPage.title]);

    expect(
      (await ownerApi.delete(`/api/teams/${teamId}/memberships/${memberUserId}`)).status()
    ).toBeLessThan(300);
    expect((await memberApi.get(`/api/pages/${teamPage.id}`)).status()).toBe(403);
    await page.goto('/');
    await expect(favorites(page).getByRole('link')).toHaveText([ownPage.title]);
    const rows = await (await memberApi.get('/api/favorites')).json();
    expect(rows.map((row: any) => row.pageId)).toEqual([ownPage.id]);

    // Remove with the star
    await page.goto(`/page/${ownPage.slug}`);
    const removed = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/favorites/${ownPage.id}` &&
        r.request().method() === 'DELETE'
    );
    await page.getByTestId('favorite-toggle').click();
    expect((await removed).status()).toBe(204);
    await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(favorites(page).getByTestId('favorites-empty')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(favorites(page).getByTestId('favorites-empty')).toBeVisible();
  } finally {
    await ownerApi.delete(`/api/teams/${teamId}`).catch(() => {});
    await ownerApi.dispose();
    await memberApi.dispose();
  }
});

test('recent: lists the pages this account opened, newest first, never another account’s, and drops a page it lost access to', async ({
  page,
  request,
}) => {
  const owner = await registerTestUser(request, 'recent-owner');
  const member = await registerTestUser(request, 'recent-member');
  const ownerApi = await createAuthenticatedApiContext(owner.email, owner.password);
  const memberApi = await createAuthenticatedApiContext(member.email, member.password);
  const key = stamp();
  const team = await ownerApi.post('/api/teams', {
    data: { name: `recent-team-${key}`, displayName: `Recent Team ${key}` },
  });
  expect(team.status()).toBe(201);
  const teamId = Number((await team.json()).id);

  try {
    const admit = await ownerApi.post(`/api/teams/${teamId}/memberships`, {
      data: { email: member.email },
    });
    expect(admit.status()).toBe(201);
    const memberUserId = Number((await admit.json()).userId);
    const first = await createPage(memberApi, `Recent First ${key}`);
    const second = await createPage(memberApi, `Recent Second ${key}`);
    const shared = await createPage(ownerApi, `Recent Team Page ${key}`, { teamId });
    const ownerOnly = await createPage(ownerApi, `Recent Owner Only ${key}`);

    await loginPageWithCookies(page, member.email, member.password);
    await page.goto('/');
    await expect(recent(page).getByTestId('recent-empty')).toBeVisible();
    for (const opened of [first, shared, second]) {
      await page.goto(`/page/${opened.slug}`);
      await expect(page.getByTestId('favorite-toggle')).toBeEnabled();
    }
    await expect(recent(page).getByRole('link')).toHaveText([
      second.title,
      shared.title,
      first.title,
    ]);
    // Stored: id and title only, under a key naming the account and the organization
    const stored = await page.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage)
          .filter((name) => name.startsWith('papyrus.recent:'))
          .map((name) => [name, JSON.parse(localStorage.getItem(name) ?? 'null')])
      )
    );
    const names = Object.keys(stored);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^papyrus\.recent:\d+:\d+$/);
    expect(Object.keys(stored[names[0]][0]).sort()).toEqual(['id', 'title']);

    // Another account in the same browser (cookies swapped, no sign out) sees none of it
    await loginPageWithCookies(page, owner.email, owner.password);
    await page.goto('/');
    await expect(recent(page).getByTestId('recent-empty')).toBeVisible();
    await page.goto(`/page/${ownerOnly.slug}`);
    await expect(recent(page).getByRole('link')).toHaveText([ownerOnly.title]);

    // Back as the member: the member's list is intact, and the owner's page is not in it
    await loginPageWithCookies(page, member.email, member.password);
    await page.goto('/');
    await expect(recent(page).getByRole('link')).toHaveText([
      second.title,
      shared.title,
      first.title,
    ]);

    // Losing the team drops its page from the list, and from storage
    expect(
      (await ownerApi.delete(`/api/teams/${teamId}/memberships/${memberUserId}`)).status()
    ).toBeLessThan(300);
    await page.reload();
    await expect(recent(page).getByRole('link')).toHaveText([second.title, first.title]);
    const memberKey = names[0];
    await expect
      .poll(() =>
        page.evaluate(
          (name) => JSON.parse(localStorage.getItem(name) ?? '[]').map((e: any) => e.id),
          memberKey
        )
      )
      .toEqual([second.id, first.id]);

    // Signing out clears the lists of this browser
    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(
      await page.evaluate(
        () => Object.keys(localStorage).filter((name) => name.startsWith('papyrus.recent:')).length
      )
    ).toBe(0);
  } finally {
    await ownerApi.delete(`/api/teams/${teamId}`).catch(() => {});
    await ownerApi.dispose();
    await memberApi.dispose();
  }
});

test('trash: "휴지통 비우기" is shown only to a platform admin on a team screen and deletes that team only', async ({
  browser,
  request,
}) => {
  const adminAccount = await request.post('/api/auth/register', {
    data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect([201, 409]).toContain(adminAccount.status());
  const owner = await registerTestUser(request, 'empty-owner');
  const member = await registerTestUser(request, 'empty-member');
  const ownerApi = await createAuthenticatedApiContext(owner.email, owner.password);
  const key = stamp();
  const makeTeam = async (suffix: string) => {
    const created = await ownerApi.post('/api/teams', {
      data: { name: `empty-${suffix}-${key}`, displayName: `Empty ${suffix} ${key}` },
    });
    expect(created.status()).toBe(201);
    const id = Number((await created.json()).id);
    for (const email of [ADMIN_EMAIL, member.email]) {
      const admit = await ownerApi.post(`/api/teams/${id}/memberships`, { data: { email } });
      expect(admit.status()).toBe(201);
    }
    return { id, name: `empty-${suffix}-${key}` };
  };
  const teamA = await makeTeam('a');
  const teamB = await makeTeam('b');

  try {
    const pageA1 = await createPage(ownerApi, `Empty A1 ${key}`, { teamId: teamA.id });
    const pageA2 = await createPage(ownerApi, `Empty A2 ${key}`, { teamId: teamA.id });
    const pageB = await createPage(ownerApi, `Empty B ${key}`, { teamId: teamB.id });
    for (const created of [pageA1, pageA2, pageB]) {
      expect((await ownerApi.delete(`/api/pages/${created.id}`)).status()).toBe(200);
    }

    // An ordinary member of the team: the screen loads, the button is absent
    const memberPage = await (await browser.newContext()).newPage();
    try {
      await loginPageWithCookies(memberPage, member.email, member.password);
      const session = memberPage.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/admin/session'
      );
      const listed = memberPage.waitForResponse(isTrashList);
      await memberPage.goto(`/teams/${teamA.name}/trash`);
      await listed;
      expect((await session).status()).toBe(403);
      await expect(memberPage.getByTestId('trash-row')).toHaveCount(2);
      await expect(memberPage.getByTestId('empty-trash')).toHaveCount(0);
    } finally {
      await memberPage.context().close();
    }

    const adminPage = await (await browser.newContext()).newPage();
    try {
      await loginPageWithCookies(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
      const deletes: string[] = [];
      adminPage.on('request', (r) => {
        if (new URL(r.url()).pathname === '/api/trash' && r.method() === 'DELETE') {
          deletes.push(r.url());
        }
      });

      // No team selected: even a platform admin gets no button
      const allSession = adminPage.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/admin/session'
      );
      const allListed = adminPage.waitForResponse(isTrashList);
      await adminPage.goto('/trash');
      await allListed;
      expect((await allSession).status()).toBe(200);
      await expect(adminPage.getByTestId('trash-screen')).toBeVisible();
      await expect(adminPage.getByTestId('empty-trash')).toHaveCount(0);

      // A team screen: the button asks first; Cancel sends nothing
      const teamListed = adminPage.waitForResponse(isTrashList);
      await adminPage.goto(`/teams/${teamA.name}/trash`);
      await teamListed;
      await expect(adminPage.getByTestId('trash-row')).toHaveCount(2);
      await adminPage.getByTestId('empty-trash').click();
      const dialog = adminPage.getByTestId('trash-empty-dialog');
      await expect(dialog).toContainText(`"Empty a ${key}" 팀`);
      await expect(dialog).toContainText('2개를 영구 삭제합니다');
      await expect(dialog).toContainText('되돌릴 수 없습니다');
      await dialog.getByRole('button', { name: '취소' }).click();
      await expect(dialog).toHaveCount(0);
      expect(deletes).toEqual([]);

      // Confirm: one DELETE naming this team only; its rows go, the other team's page stays
      await adminPage.getByTestId('empty-trash').click();
      const emptied = adminPage.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/trash' && r.request().method() === 'DELETE'
      );
      await adminPage.getByTestId('trash-empty-confirm').click();
      expect((await emptied).status()).toBe(200);
      expect(deletes).toHaveLength(1);
      expect(new URL(deletes[0]).search).toBe(`?teamId=${teamA.id}`);
      await expect(adminPage.getByTestId('trash-empty')).toBeVisible();
      const remaining = (await (await ownerApi.get('/api/trash')).json()).map((row: any) => row.id);
      expect(remaining).toContain(pageB.id);
      expect(remaining).not.toContain(pageA1.id);
      expect(remaining).not.toContain(pageA2.id);
    } finally {
      await adminPage.context().close();
    }
  } finally {
    await ownerApi.delete(`/api/teams/${teamA.id}`).catch(() => {});
    await ownerApi.delete(`/api/teams/${teamB.id}`).catch(() => {});
    await ownerApi.dispose();
  }
});

test('mobile: the trash screen and the sidebar sections fit a 390 px screen', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'trash-mobile');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const longTitle = `Mobile ${stamp()} ${'long title '.repeat(8)}`.trim();
  const created = await createPage(api, longTitle);
  try {
    expect((await api.post(`/api/favorites/${created.id}`)).status()).toBe(201);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${created.slug}`);
    await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect((await api.delete(`/api/pages/${created.id}`)).status()).toBe(200);

    const listed = page.waitForResponse(isTrashList);
    await page.goto('/trash');
    await listed;
    await expect(page.getByTestId('trash-row')).toHaveCount(1);
    await expect(page.getByRole('button', { name: `${longTitle} 복원` })).toBeVisible();
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    expect(await overflow()).toBeLessThanOrEqual(0);

    // The drawer lists the sections
    await page.getByRole('button', { name: /메뉴 열기/ }).click();
    await expect(page.getByRole('navigation', { name: '즐겨찾기' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '최근 문서' })).toBeVisible();
    await expect(page.getByRole('link', { name: '휴지통' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  } finally {
    await api.dispose();
  }
});
