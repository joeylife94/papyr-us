import { readFile, mkdir } from 'fs/promises';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';
import { readZip } from '../server/services/zip';

// Issue #113 P2-D2: a small page tree with links, tags and an icon is exported from one team as
// a Markdown vault from the workspace menu, then imported into another team from the same menu.
// Titles, hierarchy, tags, icons and links survive, and links point at the imported pages.

const SHOTS = process.env.VAULT_SHOTS_DIR;

interface TreeNode {
  id: number;
  title: string;
  parentId: number | null;
  children: TreeNode[];
}

/** Every node of the team's page tree, flattened. */
async function treeOf(api: APIRequestContext, teamId: number): Promise<TreeNode[]> {
  const response = await api.get(`/api/page-tree?teamId=${teamId}`);
  expect(response.status()).toBe(200);
  const flatten = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children)]);
  return flatten(await response.json());
}

const workspaceMenu = (page: Page) =>
  page
    .getByRole('group', { name: '현재 워크스페이스' })
    .getByRole('button', { name: '워크스페이스 메뉴' });

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test('vault round trip: export a tree as Markdown and import it into another team', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const user = await registerTestUser(request, 'vault');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const makeTeam = async (name: string) => {
    const response = await api.post('/api/teams', {
      data: { name: `${name}-${stamp}`, displayName: `${name} ${stamp}` },
    });
    expect(response.status()).toBe(201);
    return (await response.json()) as { id: number; name: string };
  };
  const source = await makeTeam('vault-src');
  const target = await makeTeam('vault-dst');

  const create = async (title: string, content: string, extra: object = {}) => {
    const response = await api.post('/api/pages', {
      data: {
        title,
        slug: `vault-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`,
        content,
        folder: 'docs',
        author: user.email,
        tags: [],
        teamId: source.id,
        ...extra,
      },
    });
    expect(response.status(), `create ${title}`).toBe(201);
    return (await response.json()) as { id: number; slug: string };
  };

  const guide = await create('Guide', 'Start here.', { tags: ['guide', 'docs'], icon: '📘' });
  const setup = await create('Setup: Day 1', `Back to [[page:${guide.id}]].`, {
    parentId: guide.id,
    tags: ['setup'],
  });
  const faq = await create('FAQ', `See [[page:${setup.id}]] and [[page:${guide.id}]].`);
  // The guide links to its sub-page once both exist.
  const linked = await api.put(`/api/pages/${guide.id}`, {
    data: { content: `Start here, then [[page:${setup.id}]].` },
  });
  expect(linked.status()).toBe(200);

  try {
    await page.emulateMedia({ colorScheme: 'light' });
    await loginPageWithCookies(page, user.email, user.password);

    // ── Export from the source team's workspace menu ──
    await page.goto(`/teams/${source.name}/pages`);
    const sourceTree = page.getByRole('tree', { name: '페이지 트리' });
    await expect(sourceTree.getByRole('treeitem', { name: 'Guide' })).toBeVisible();
    await workspaceMenu(page).click();
    const exportItem = page.getByRole('menuitem', { name: 'Markdown으로 내보내기' });
    await expect(exportItem).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Markdown 가져오기' })).toBeVisible();
    await shot(page, '01-workspace-menu-light');
    const exportRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/vault/export'
    );
    const [download] = await Promise.all([page.waitForEvent('download'), exportItem.click()]);
    // The scope goes by team id, never by name (a team named "42" is not team 42).
    expect(new URL((await exportRequest).url()).searchParams.get('teamId')).toBe(String(source.id));
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^papyrus-vault-src-${stamp}-\\d{4}-\\d{2}-\\d{2}\\.zip$`)
    );
    const archivePath = test.info().outputPath('vault.zip');
    await download.saveAs(archivePath);
    const archive = await readFile(archivePath);
    const files = new Map(
      readZip(archive, { maxEntries: 500, maxTotalUncompressed: 20 * 1024 * 1024 }).map((entry) => [
        entry.name,
        entry.read().toString('utf8'),
      ])
    );
    expect(Array.from(files.keys()).sort()).toEqual(['FAQ.md', 'Guide.md', 'Guide/Setup Day 1.md']);
    expect(files.get('FAQ.md')).toContain('See [[Setup Day 1]] and [[Guide]].');
    expect(files.get('Guide.md')).toContain('icon: "📘"');
    expect(files.get('Guide/Setup Day 1.md')).toContain('title: "Setup: Day 1"');

    // ── Import into the target team from its workspace menu ──
    await page.goto(`/teams/${target.name}/pages`);
    await expect(page.getByRole('group', { name: '현재 워크스페이스' })).toContainText(
      `vault-dst ${stamp}`
    );
    await workspaceMenu(page).click();
    await page.getByRole('menuitem', { name: 'Markdown 가져오기' }).click();
    const dialog = page.getByRole('dialog', { name: 'Markdown 가져오기' });
    await expect(dialog).toBeVisible();
    const submit = dialog.getByRole('button', { name: '가져오기', exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('가져올 파일').setInputFiles(archivePath);
    await expect(dialog.getByText('파일 1개 선택됨')).toBeVisible();
    const imported = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/vault/import' &&
        response.request().method() === 'POST'
    );
    await submit.click();
    const importResponse = await imported;
    expect(importResponse.status()).toBe(201);
    expect(new URL(importResponse.url()).searchParams.get('teamId')).toBe(String(target.id));
    await expect(dialog.getByRole('status')).toContainText('문서 3개를 가져왔습니다.');
    await shot(page, '02-import-summary-light');

    // The tree refreshes without a reload.
    await dialog.getByRole('button', { name: '닫기' }).click();
    await expect(dialog).toBeHidden();
    const targetTree = page.getByRole('tree', { name: '페이지 트리' });
    await expect(targetTree.getByRole('treeitem', { name: 'Guide' })).toBeVisible();
    await expect(targetTree.getByRole('treeitem', { name: 'FAQ' })).toBeVisible();

    // ── Titles, hierarchy, tags, icons and links survived, pointing at the imported pages ──
    const tree = await treeOf(api, target.id);
    const byTitle = new Map(tree.map((node) => [node.title, node]));
    expect(Array.from(byTitle.keys()).sort()).toEqual(['FAQ', 'Guide', 'Setup: Day 1']);
    const newGuide = byTitle.get('Guide')!;
    const newSetup = byTitle.get('Setup: Day 1')!;
    const newFaq = byTitle.get('FAQ')!;
    expect(newSetup.parentId).toBe(newGuide.id);
    expect(newGuide.parentId).toBeNull();
    expect(newFaq.parentId).toBeNull();
    const read = async (id: number) => (await (await api.get(`/api/pages/${id}`)).json()) as any;
    const [guidePage, setupPage, faqPage] = await Promise.all(
      [newGuide.id, newSetup.id, newFaq.id].map(read)
    );
    expect(guidePage.tags).toEqual(['guide', 'docs']);
    expect(guidePage.icon).toBe('📘');
    expect(setupPage.tags).toEqual(['setup']);
    expect(guidePage.content).toBe(`Start here, then [[page:${newSetup.id}]].\n`);
    expect(setupPage.content).toBe(`Back to [[page:${newGuide.id}]].\n`);
    expect(faqPage.content).toBe(`See [[page:${newSetup.id}]] and [[page:${newGuide.id}]].\n`);
    const backlinks = await api.get(`/api/pages/${newSetup.id}/backlinks`);
    expect(backlinks.status()).toBe(200);
    expect(JSON.stringify(await backlinks.json())).toContain(`"id":${newFaq.id}`);

    // The imported FAQ opens with a working link to the imported Setup page.
    await page.goto(`/page/${faqPage.slug}`);
    const chip = page.locator(`[data-page-body] a[data-page-link="${newSetup.id}"]`).first();
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Setup: Day 1');
    await chip.click();
    await expect(page).toHaveURL(`/page/${setupPage.slug}`);

    // Screenshots of the menu and the dialog in dark mode and at phone width.
    if (SHOTS) {
      await page.goto(`/teams/${target.name}/pages`);
      await page.evaluate(() => localStorage.setItem('theme', 'dark'));
      await page.reload();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await workspaceMenu(page).click();
      await expect(page.getByRole('menuitem', { name: 'Markdown 가져오기' })).toBeVisible();
      await shot(page, '03-workspace-menu-dark');
      await page.getByRole('menuitem', { name: 'Markdown 가져오기' }).click();
      await dialog.getByLabel('가져올 파일').setInputFiles(archivePath);
      await shot(page, '04-import-dialog-dark');
      await page.keyboard.press('Escape');
      await page.evaluate(() => localStorage.setItem('theme', 'light'));

      await page.setViewportSize({ width: 375, height: 812 });
      await page.reload();
      await page.getByRole('button', { name: '메뉴 열기' }).click();
      const drawer = page.getByRole('complementary', { name: '워크스페이스 패널' });
      await expect
        .poll(async () => Math.round((await drawer.boundingBox())?.x ?? -1))
        .toBeGreaterThanOrEqual(0);
      await workspaceMenu(page).click();
      await expect(page.getByRole('menuitem', { name: 'Markdown 가져오기' })).toBeVisible();
      await shot(page, '05-workspace-menu-mobile');
      await page.getByRole('menuitem', { name: 'Markdown 가져오기' }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('가져올 파일').setInputFiles(archivePath);
      await shot(page, '06-import-dialog-mobile');
    }
  } finally {
    await api.dispose();
  }
});
