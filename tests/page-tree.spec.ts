import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #103 E5: the sidebar page tree. A child page is added with "+", pages move by keyboard
// (Alt+arrows) and by drag (drop onto a page to nest it), and deleting a page trashes its subtree,
// which a restore brings back. The server rules are checked against the real database too.

interface TreeNode {
  id: number;
  title: string;
  parentId: number | null;
  children: TreeNode[];
}

const shape = (nodes: TreeNode[], keep: Set<number>): unknown =>
  nodes
    .filter((n) => keep.has(n.id))
    .map((n) => (n.children.some((c) => keep.has(c.id)) ? [n.id, shape(n.children, keep)] : n.id));

async function personalTree(api: APIRequestContext): Promise<TreeNode[]> {
  const res = await api.get('/api/page-tree?scope=personal');
  expect(res.status()).toBe(200);
  return res.json();
}

const createPage = async (api: APIRequestContext, title: string, extra: object = {}) => {
  const res = await api.post('/api/pages', {
    data: {
      title,
      slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`,
      content: 'body',
      folder: 'docs',
      author: 'u',
      tags: [],
      ...extra,
    },
  });
  expect(res.status(), `create ${title}`).toBe(201);
  return (await res.json()) as { id: number; slug: string; title: string };
};

const waitForMove = (page: Page, pageId: number) =>
  page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/pages/${pageId}/move` && r.request().method() === 'POST'
  );

test('page tree: add a child, move by keyboard and drag, trash and restore a subtree', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'tree');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const parent = await createPage(api, `Tree Parent ${stamp}`);
  const other = await createPage(api, `Tree Other ${stamp}`);
  let childId = 0;

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${parent.slug}`);
    const tree = page.getByRole('tree', { name: '페이지 트리' });
    const item = (title: string) => tree.getByRole('treeitem', { name: title });
    await expect(item(parent.title)).toBeVisible();
    await expect(item(parent.title)).toHaveAttribute('aria-level', '1');
    await expect(item(parent.title)).toHaveAttribute('aria-selected', 'true');

    // ── Add a child with "+": the new page is created under the parent ──
    await item(parent.title).hover();
    await page.getByRole('button', { name: `${parent.title} 아래에 문서 추가` }).click();
    await expect(page).toHaveURL(new RegExp(`parent=${parent.id}`));
    const created = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/pages' && r.request().method() === 'POST'
    );
    await page.getByTestId('page-title').fill(`Tree Child ${stamp}`);
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    expect(createdResponse.request().postDataJSON().parentId).toBe(parent.id);
    childId = (await createdResponse.json()).id;
    await expect(page).toHaveURL(/\/page\//);
    const child = item(`Tree Child ${stamp}`);
    await expect(child).toHaveAttribute('aria-level', '2');
    await expect(item(parent.title)).toHaveAttribute('aria-expanded', 'true');

    const keep = new Set([parent.id, other.id, childId]);
    expect(shape(await personalTree(api), keep)).toEqual([[parent.id, [childId]], other.id]);

    // ── Keyboard: Alt+← moves the child out after its parent, Alt+→ nests it back ──
    await child.focus();
    let moved = waitForMove(page, childId);
    await page.keyboard.press('Alt+ArrowLeft');
    expect((await moved).status()).toBe(200);
    await expect(child).toHaveAttribute('aria-level', '1');
    await expect(child).toBeFocused();
    expect(shape(await personalTree(api), keep)).toEqual([parent.id, childId, other.id]);

    moved = waitForMove(page, childId);
    await page.keyboard.press('Alt+ArrowRight');
    expect((await moved).status()).toBe(200);
    await expect(child).toHaveAttribute('aria-level', '2');
    expect(shape(await personalTree(api), keep)).toEqual([[parent.id, [childId]], other.id]);

    // ── Mouse: drag "Other" by its grip to just below the parent row, which nests it there ──
    // (dropped before the parent's first child, or onto the parent itself: both nest it).
    moved = waitForMove(page, other.id);
    await item(other.title).hover();
    const grip = await item(other.title).getByTestId('tree-drag-handle').boundingBox();
    const firstChild = await child.boundingBox();
    if (!grip || !firstChild) throw new Error('tree rows are not laid out');
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y - 8, { steps: 4 });
    await page.mouse.move(grip.x + grip.width / 2, firstChild.y + 2, { steps: 20 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    expect((await moved).status()).toBe(200);
    await expect(item(other.title)).toHaveAttribute('aria-level', '2');
    const afterDrag = (await personalTree(api)).find((n) => n.id === parent.id);
    expect(afterDrag?.children.map((c) => c.id).sort()).toEqual([childId, other.id].sort());

    // ── Deleting the parent trashes the whole subtree; restoring brings it back ──
    const deleted = await api.delete(`/api/pages/${parent.id}`);
    expect(deleted.status()).toBe(200);
    expect((await deleted.json()).trashed).toBe(3);
    expect(shape(await personalTree(api), keep)).toEqual([]);
    await page.goto('/');
    await expect(item(parent.title)).toHaveCount(0);

    const restored = await api.post(`/api/trash/${parent.id}/restore`);
    expect(restored.status()).toBe(200);
    expect((await restored.json()).restoredCount).toBe(3);
    const afterRestore = (await personalTree(api)).find((n) => n.id === parent.id);
    expect(afterRestore?.children.map((c) => c.id)).toEqual(afterDrag?.children.map((c) => c.id));
    await page.reload();
    await expect(item(parent.title)).toBeVisible();
  } finally {
    for (const id of [childId, other.id, parent.id].filter(Boolean)) {
      await api.delete(`/api/pages/${id}`).catch(() => {});
    }
    await api.dispose();
  }
});

test('page tree rules hold against the database: team boundary, cycles, hidden pages', async ({
  request,
}) => {
  const owner = await registerTestUser(request, 'tree-owner');
  const other = await registerTestUser(request, 'tree-other');
  const api = await createAuthenticatedApiContext(owner.email, owner.password);
  const otherApi = await createAuthenticatedApiContext(other.email, other.password);
  const stamp = Date.now();
  const teamRes = await api.post('/api/teams', {
    data: { name: `tree-team-${stamp}`, displayName: `Tree Team ${stamp}` },
  });
  expect(teamRes.status()).toBe(201);
  const team = await teamRes.json();
  const created: number[] = [];

  try {
    const teamPage = await createPage(api, `Team Root ${stamp}`, { teamId: team.id });
    const personalA = await createPage(api, `Private A ${stamp}`);
    const personalB = await createPage(api, `Private B ${stamp}`, { parentId: personalA.id });
    created.push(teamPage.id, personalB.id, personalA.id);

    // Cross-team: a personal page cannot move under a team page, nor be created there.
    const crossMove = await api.post(`/api/pages/${personalA.id}/move`, {
      data: { parentId: teamPage.id },
    });
    expect(crossMove.status()).toBe(403);
    const crossCreate = await api.post('/api/pages', {
      data: {
        title: 'x',
        slug: `x-${stamp}`,
        content: '',
        folder: 'docs',
        author: 'u',
        parentId: personalA.id,
        teamId: team.id,
      },
    });
    expect(crossCreate.status()).toBe(403);

    // Cycle: a page cannot move below its own child.
    const cycle = await api.post(`/api/pages/${personalA.id}/move`, {
      data: { parentId: personalB.id },
    });
    expect(cycle.status()).toBe(400);

    // Another user: none of these pages in their tree, and no move into or out of them.
    const otherTree = await otherApi.get('/api/page-tree');
    expect(otherTree.status()).toBe(200);
    const text = await otherTree.text();
    for (const marker of [`Team Root ${stamp}`, `Private A ${stamp}`, `Private B ${stamp}`]) {
      expect(text).not.toContain(marker);
    }
    expect((await otherApi.get(`/api/page-tree?teamId=${team.id}`)).status()).toBe(403);
    const intruder = await createPage(otherApi, `Intruder ${stamp}`);
    created.push(intruder.id);
    const steal = await otherApi.post(`/api/pages/${intruder.id}/move`, {
      data: { parentId: personalA.id },
    });
    expect(steal.status()).toBe(403);
    const hijack = await otherApi.post(`/api/pages/${personalB.id}/move`, {
      data: { parentId: null },
    });
    expect(hijack.status()).toBe(403);
  } finally {
    for (const id of created) {
      await api.delete(`/api/pages/${id}`).catch(() => {});
      await otherApi.delete(`/api/pages/${id}`).catch(() => {});
      await api.delete(`/api/trash/${id}`).catch(() => {});
    }
    await api.delete(`/api/teams/${team.id}`).catch(() => {});
    await api.dispose();
    await otherApi.dispose();
  }
});
