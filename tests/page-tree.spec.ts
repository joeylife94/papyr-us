import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #103 E5: the sidebar page tree. A sub-page is created with the row's "+" (nothing is
// stored until the first input), pages move by mouse drag and by keyboard (Alt+Shift+arrows),
// deleting a parent trashes its subtree, and undoing the delete brings the subtree back.

interface TreeNode {
  id: number;
  title: string;
  parentId: number | null;
  position: number;
}

async function treeOf(api: APIRequestContext, teamId: number): Promise<TreeNode[]> {
  const response = await api.get(`/api/pages/tree?teamId=${teamId}`);
  expect(response.status()).toBe(200);
  return (await response.json()).pages;
}

/** [title, parent title] pairs in tree order, for the pages of this test. */
async function shapeOf(api: APIRequestContext, teamId: number) {
  const pages = await treeOf(api, teamId);
  const titleOf = new Map(pages.map((page) => [page.id, page.title]));
  return pages.map((page) => [
    page.title,
    page.parentId === null ? null : (titleOf.get(page.parentId) ?? '?'),
  ]);
}

const tree = (page: Page) => page.getByRole('tree', { name: '페이지 트리' });
const row = (page: Page, title: string) =>
  tree(page).getByRole('treeitem', { name: title, exact: true });

async function dragRow(page: Page, source: Locator, to: { x: number; y: number }) {
  await source.hover();
  const box = await source.boundingBox();
  if (!box) throw new Error('tree row is not laid out');
  const x = box.x + box.width / 3;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Past the drag threshold first, then to the target.
  await page.mouse.move(x, y + 8, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.waitForTimeout(250);
  await page.mouse.up();
}

/** Drag `source` down onto `target` and drop when the tree shows it will nest there. */
async function dragOnto(page: Page, source: Locator, target: Locator) {
  await source.hover();
  const box = await source.boundingBox();
  const goal = await target.boundingBox();
  if (!box || !goal) throw new Error('tree rows are not laid out');
  const x = box.x + box.width / 3;
  let y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 8, { steps: 4 });
  y += 8;
  while (y < goal.y + goal.height && (await target.getAttribute('data-drop-into')) !== 'true') {
    y += 2;
    await page.mouse.move(x, y);
  }
  await expect(target).toHaveAttribute('data-drop-into', 'true');
  await page.mouse.up();
}

const waitForMove = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/pages/${pageId}/move` &&
      response.request().method() === 'POST'
  );

test('page tree: add a sub-page, move by drag and keyboard, delete and restore a subtree', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const user = await registerTestUser(request, 'tree');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const teamName = `tree-${stamp}`;
  const team = await (
    await api.post('/api/teams', { data: { name: teamName, displayName: `Tree ${stamp}` } })
  ).json();

  const create = async (title: string, extra: object = {}) => {
    const response = await api.post('/api/pages', {
      data: {
        title,
        slug: `tree-${title.toLowerCase().replace(/\s+/g, '-')}-${stamp}`,
        content: `${title} body`,
        folder: 'docs',
        author: user.email,
        tags: [],
        teamId: team.id,
        ...extra,
      },
    });
    expect(response.status(), `create ${title}`).toBe(201);
    return (await response.json()) as { id: number; slug: string };
  };

  const parent = await create('Alpha');
  const sibling = await create('Beta');
  const child = await create('Alpha child', { parentId: parent.id });

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/teams/${teamName}/pages`);
    await expect(row(page, 'Alpha')).toBeVisible();
    await expect(row(page, 'Beta')).toBeVisible();
    // Collapsed by default: the child is not shown until Alpha is expanded.
    await expect(row(page, 'Alpha child')).toHaveCount(0);
    await expect(row(page, 'Alpha')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'Alpha')).toHaveAttribute('aria-level', '1');
    await expect(row(page, 'Alpha')).toHaveAttribute('aria-posinset', '1');
    await expect(row(page, 'Alpha')).toHaveAttribute('aria-setsize', '2');

    // ── Keyboard navigation: one tab stop, arrows move focus, → expands, Enter opens ──
    await row(page, 'Alpha').focus();
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Alpha')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'Alpha child')).toHaveAttribute('aria-level', '2');
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Alpha child')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'Alpha')).toBeFocused();
    await page.keyboard.press('End');
    await expect(row(page, 'Beta')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(row(page, 'Alpha')).toBeFocused();
    await expect(row(page, 'Alpha')).toHaveAttribute('tabindex', '0');
    await expect(row(page, 'Beta')).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/page/${child.slug}`);
    await expect(row(page, 'Alpha child')).toHaveAttribute('aria-current', 'page');

    // ── "+" then leaving creates nothing ──
    const before = (await treeOf(api, team.id)).length;
    await row(page, 'Beta').hover();
    await row(page, 'Beta').getByRole('button', { name: 'Beta 하위 문서 추가' }).click();
    await expect(page).toHaveURL(`/teams/${teamName}/create?parent=${sibling.id}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await page.goBack();
    await expect(page).toHaveURL(`/page/${child.slug}`);
    expect((await treeOf(api, team.id)).length).toBe(before);

    // ── "+" on Alpha creates a sub-page on the first input ──
    await row(page, 'Alpha').hover();
    await row(page, 'Alpha').getByRole('button', { name: 'Alpha 하위 문서 추가' }).click();
    await expect(page).toHaveURL(`/teams/${teamName}/create?parent=${parent.id}`);
    await expect(page.getByRole('navigation', { name: '문서 경로' })).toContainText('Alpha');
    const created = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
    );
    await page.getByTestId('page-title').fill('Alpha second');
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    const second = await createdResponse.json();
    expect(second.parentId).toBe(parent.id);
    await expect(page).toHaveURL(`/page/${second.slug}`);
    await expect(row(page, 'Alpha second')).toHaveAttribute('aria-level', '2');
    await expect(row(page, 'Alpha second')).toHaveAttribute('aria-current', 'page');
    expect(await shapeOf(api, team.id)).toEqual([
      ['Alpha', null],
      ['Alpha child', 'Alpha'],
      ['Alpha second', 'Alpha'],
      ['Beta', null],
    ]);
    // The breadcrumb shows the readable ancestors.
    await expect(
      page.getByRole('navigation', { name: '문서 경로' }).getByRole('link', { name: 'Alpha' })
    ).toHaveAttribute('href', `/page/${parent.slug}`);

    // ── Mouse: drag Beta above Alpha (reorder at the root) ──
    let moved = waitForMove(page, sibling.id);
    const top = await row(page, 'Alpha').boundingBox();
    if (!top) throw new Error('tree rows are not laid out');
    await dragRow(page, row(page, 'Beta'), { x: top.x + top.width / 3, y: top.y + 2 });
    expect((await moved).status()).toBe(200);
    await expect
      .poll(() => shapeOf(api, team.id))
      .toEqual([
        ['Beta', null],
        ['Alpha', null],
        ['Alpha child', 'Alpha'],
        ['Alpha second', 'Alpha'],
      ]);

    // ── Mouse: drop Beta onto Alpha child (nest) ──
    moved = waitForMove(page, sibling.id);
    await dragOnto(page, row(page, 'Beta'), row(page, 'Alpha child'));
    expect((await moved).status()).toBe(200);
    await expect
      .poll(() => shapeOf(api, team.id))
      .toEqual([
        ['Alpha', null],
        ['Alpha child', 'Alpha'],
        ['Beta', 'Alpha child'],
        ['Alpha second', 'Alpha'],
      ]);

    // ── Keyboard: Alt+Shift+← out one level, Alt+Shift+↓ down, Alt+Shift+→ into the previous ──
    await row(page, 'Beta').focus();
    moved = waitForMove(page, sibling.id);
    await page.keyboard.press('Alt+Shift+ArrowLeft');
    expect((await moved).status()).toBe(200);
    await expect(page.getByText('"Beta" 문서를 "Alpha" 안 2번째 위치로 옮겼습니다')).toBeAttached();
    await expect(row(page, 'Beta')).toBeFocused();
    moved = waitForMove(page, sibling.id);
    await page.keyboard.press('Alt+Shift+ArrowDown');
    expect((await moved).status()).toBe(200);
    moved = waitForMove(page, sibling.id);
    await page.keyboard.press('Alt+Shift+ArrowLeft');
    expect((await moved).status()).toBe(200);
    await expect
      .poll(() => shapeOf(api, team.id))
      .toEqual([
        ['Alpha', null],
        ['Alpha child', 'Alpha'],
        ['Alpha second', 'Alpha'],
        ['Beta', null],
      ]);
    moved = waitForMove(page, sibling.id);
    await page.keyboard.press('Alt+Shift+ArrowRight');
    expect((await moved).status()).toBe(200);
    await expect(row(page, 'Beta')).toHaveAttribute('aria-level', '2');
    await expect
      .poll(() => shapeOf(api, team.id))
      .toEqual([
        ['Alpha', null],
        ['Alpha child', 'Alpha'],
        ['Alpha second', 'Alpha'],
        ['Beta', 'Alpha'],
      ]);

    // ── The row menu offers the same moves ──
    await row(page, 'Beta').hover();
    await row(page, 'Beta').getByRole('button', { name: 'Beta 메뉴' }).click();
    moved = waitForMove(page, sibling.id);
    await page.getByRole('menuitem', { name: '위로 옮기기', exact: true }).click();
    expect((await moved).status()).toBe(200);
    await expect
      .poll(() => shapeOf(api, team.id))
      .toEqual([
        ['Alpha', null],
        ['Alpha child', 'Alpha'],
        ['Beta', 'Alpha'],
        ['Alpha second', 'Alpha'],
      ]);

    // ── Delete the parent: the whole subtree goes to the trash ──
    await page.goto(`/page/${parent.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    page.once('dialog', (dialog) => dialog.accept());
    const deleted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/pages/${parent.id}` &&
        response.request().method() === 'DELETE'
    );
    await page.locator('button[title="Delete"]').click();
    const deleteResponse = await deleted;
    expect(deleteResponse.status()).toBe(200);
    expect((await deleteResponse.json()).subPages).toBe(3);
    await expect(
      page.getByText('하위 문서 3개와 함께 휴지통으로 옮겼습니다.', { exact: true })
    ).toBeVisible();
    expect(await shapeOf(api, team.id)).toEqual([]);
    await expect(row(page, 'Alpha')).toHaveCount(0);
    for (const id of [parent.id, child.id, sibling.id, second.id]) {
      expect((await api.get(`/api/pages/${id}`)).status(), `page ${id} trashed`).toBe(404);
    }

    // ── Undo: restoring the parent brings the subtree back ──
    const restored = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/trash/${parent.id}/restore` &&
        response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: '되돌리기' }).click();
    expect((await restored).status()).toBe(200);
    await expect(page).toHaveURL(`/page/${parent.slug}`);
    await expect
      .poll(() => shapeOf(api, team.id))
      .toEqual([
        ['Alpha', null],
        ['Alpha child', 'Alpha'],
        ['Beta', 'Alpha'],
        ['Alpha second', 'Alpha'],
      ]);
    await expect(row(page, 'Alpha child')).toBeVisible();
  } finally {
    for (const id of [child.id, sibling.id, parent.id]) {
      await api.delete(`/api/pages/${id}`).catch(() => {});
    }
    await api.dispose();
  }
});

test('page tree works in the 375px mobile drawer', async ({ page, request }) => {
  const stamp = Date.now();
  const user = await registerTestUser(request, 'tree-mobile');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const teamName = `tree-m-${stamp}`;
  const team = await (
    await api.post('/api/teams', { data: { name: teamName, displayName: `Tree M ${stamp}` } })
  ).json();
  const make = async (title: string, parentId?: number) => {
    const response = await api.post('/api/pages', {
      data: {
        title,
        slug: `tree-m-${title.toLowerCase().replace(/\s+/g, '-')}-${stamp}`,
        content: '',
        folder: 'docs',
        author: user.email,
        tags: [],
        teamId: team.id,
        ...(parentId ? { parentId } : {}),
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json()) as { id: number; slug: string };
  };
  const root = await make('Mobile root with a fairly long title that must truncate');
  const leaf = await make('Mobile leaf', root.id);

  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${leaf.slug}`);
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const drawer = page.getByRole('complementary', { name: '워크스페이스 패널' });
    await expect
      .poll(async () => Math.round((await drawer.boundingBox())?.x ?? -1))
      .toBeGreaterThanOrEqual(0);
    // The current page's ancestors open by themselves.
    const current = row(page, 'Mobile leaf');
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(current).toHaveAttribute('aria-level', '2');
    // Row actions ("…" and "+") are targets of at least 24px.
    await current.hover();
    const actions = await current.getByRole('button').all();
    expect(actions).toHaveLength(2);
    for (const button of actions) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(24);
      expect(box!.height).toBeGreaterThanOrEqual(24);
    }
    // The tree fits the drawer: long titles truncate instead of widening it. (The document page
    // behind the drawer is not measured: its property row depends on unrelated folder names.)
    const fit = await drawer.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      right: element.getBoundingClientRect().right,
      rows: Array.from(element.querySelectorAll('[role="treeitem"]')).map(
        (item) => item.getBoundingClientRect().right
      ),
    }));
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);
    for (const right of fit.rows) expect(right).toBeLessThanOrEqual(fit.right + 1);
    expect(fit.right).toBeLessThanOrEqual(375);
    // Opening a page from the tree closes the drawer.
    await row(page, 'Mobile root with a fairly long title that must truncate').click();
    await expect(page).toHaveURL(`/page/${root.slug}`);
  } finally {
    await api.delete(`/api/pages/${root.id}`).catch(() => {});
    await api.dispose();
  }
});
