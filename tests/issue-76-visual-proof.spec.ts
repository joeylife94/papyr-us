import { mkdirSync } from 'node:fs';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

/**
 * Review package for #101 (B · Graphite) and #103 (Notion-grade editing), P7 of #101. It also
 * covers #75's buyer-facing capture: a team workspace with a document, the version history before
 * a restore, and the restored document verified after fresh navigation and an API read.
 *
 * Every surface is the real UI on synthetic data. The workflow checks each file, writes
 * SHA256SUMS and PROVENANCE.txt, and uploads the folder.
 */
const PROOF_DIR = 'issue-76-proof';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function expectNoHorizontalOverflow(page: Page, surface: string) {
  const { scrollWidth, viewportWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${surface} must not overflow the viewport horizontally`).toBeLessThanOrEqual(
    viewportWidth + 1
  );
}

/** Let open/close animations finish so captures show the settled surface. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null)))
  );
}

/**
 * A full-page capture grows the viewport to the page height first, so sticky shell parts (rail,
 * workspace panel) span the whole image as they span the window for a user, instead of ending at
 * the original viewport height.
 */
async function capture(page: Page, name: string, fullPage = true) {
  await settle(page);
  const viewport = page.viewportSize();
  if (fullPage && viewport) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: viewport.width, height: Math.min(height, 4000) });
    await settle(page);
  }
  await page.screenshot({ path: `${PROOF_DIR}/${name}.png` });
  if (fullPage && viewport) await page.setViewportSize(viewport);
}

type BlockSpec = { type: string; content: string };

/** Blocks with stable ids, and the content the save pipeline derives from them. */
function blocksDoc(items: BlockSpec[], key: string) {
  const blocks = items.map((item, index) => ({
    id: `proof_${key}_${index}`,
    type: item.type,
    content: item.content,
    properties: {},
    order: index,
    children: [],
  }));
  return { blocks, content: blocks.map((block) => block.content).join('\n\n') };
}

async function createPage(
  api: APIRequestContext,
  data: Record<string, unknown>
): Promise<{ id: number; slug: string; title: string }> {
  const response = await api.post('/api/pages', { data });
  expect(response.status(), `create ${data.title}`).toBe(201);
  return response.json();
}

test('P7 review package: workspace, editing and reading, history and restore, themes, mobile', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  mkdirSync(PROOF_DIR, { recursive: true });
  await page.emulateMedia({ colorScheme: 'light' });

  const stamp = Date.now();
  const owner = await registerTestUser(request, `proof-${stamp}`);
  const member = await registerTestUser(request, `proof-member-${stamp}`);
  await loginPageWithCookies(page, owner.email, owner.password);
  const api = await createAuthenticatedApiContext(owner.email, owner.password);

  const teamName = `proof-team-${stamp}`;
  const teamDisplayName = 'Product Design Workspace';
  const teamResponse = await api.post('/api/teams', {
    data: {
      name: teamName,
      displayName: teamDisplayName,
      description: 'Synthetic proof workspace',
    },
  });
  expect(teamResponse.status()).toBe(201);
  const team = await teamResponse.json();
  const admit = await api.post(`/api/teams/${team.id}/memberships`, {
    data: { email: member.email },
  });
  expect(admit.status()).toBe(201);

  // ── 01 · Empty workspace, entered through the real sidebar team selector ──
  await page.goto('/');
  const teamButton = page.getByRole('button', { name: new RegExp(teamDisplayName) });
  await expect(teamButton).toBeVisible({ timeout: 15000 });
  await teamButton.click();
  await page.getByRole('link', { name: '팀 페이지' }).click();
  await expect(page).toHaveURL(`/teams/${teamName}/pages`, { timeout: 15000 });
  await expect(
    page.getByRole('heading', { name: `${teamName} 팀 문서`, level: 1, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: `현재 워크스페이스: ${teamDisplayName}` })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '아직 문서가 없습니다' })).toBeVisible();
  const createButton = page.getByRole('button', { name: '새 문서 작성' });
  await expect(createButton).toBeVisible();
  await capture(page, '01-workspace-empty-desktop');

  // The create entry point opens a new, untitled page in place (#103 E2).
  await createButton.click();
  await expect(page).toHaveURL(`/teams/${teamName}/create`);
  await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
  await page.goBack();
  await expect(page).toHaveURL(`/teams/${teamName}/pages`);

  // ── Synthetic workspace content: a small page tree with icons, links and a backlink ──
  const inTeam = { folder: 'docs', author: owner.name, teamId: team.id };
  const handbook = await createPage(api, {
    ...inTeam,
    title: 'Team Handbook',
    slug: `team-handbook-${stamp}`,
    icon: '📚',
    tags: ['handbook'],
    ...blocksDoc([{ type: 'paragraph', content: 'How this team works.' }], 'handbook'),
  });
  await createPage(api, {
    ...inTeam,
    title: 'Onboarding',
    slug: `onboarding-${stamp}`,
    icon: '👋',
    parentId: handbook.id,
    tags: [],
    ...blocksDoc([{ type: 'paragraph', content: 'First week checklist.' }], 'onboarding'),
  });
  const decisions = await createPage(api, {
    ...inTeam,
    title: 'Decision log',
    slug: `decision-log-${stamp}`,
    icon: '📝',
    parentId: handbook.id,
    tags: ['decisions'],
    ...blocksDoc([{ type: 'paragraph', content: 'Decisions and their reasons.' }], 'decisions'),
  });
  const pageTitle = 'Operations Handbook';
  const originalItems: BlockSpec[] = [
    {
      type: 'paragraph',
      content: 'Guidelines for a small team to share decisions and recover prior documents.',
    },
    { type: 'heading2', content: 'Weekly rhythm' },
    { type: 'checkbox', content: 'Review tasks every Monday' },
    { type: 'checkbox', content: 'Record decisions in the log' },
    { type: 'paragraph', content: `Decisions live in [[page:${decisions.id}]].` },
  ];
  const original = blocksDoc(originalItems, 'ops');
  const ops = await createPage(api, {
    ...inTeam,
    title: pageTitle,
    slug: `operations-handbook-${stamp}`,
    icon: '🧭',
    tags: ['operations', 'proof'],
    ...original,
  });
  await createPage(api, {
    ...inTeam,
    title: 'Weekly sync notes',
    slug: `weekly-sync-${stamp}`,
    icon: '🗓️',
    tags: ['meetings'],
    ...blocksDoc([{ type: 'paragraph', content: `Agenda follows [[page:${ops.id}]].` }], 'weekly'),
  });

  // A real update leaves the original as a version for the history and restore surfaces.
  const updated = blocksDoc(
    [
      ...originalItems,
      { type: 'heading2', content: 'Recovery' },
      { type: 'paragraph', content: 'Prior versions stay available from the version history.' },
    ],
    'ops'
  );
  const updateResponse = await api.put(`/api/pages/${ops.id}`, {
    data: { blocks: updated.blocks },
  });
  expect(updateResponse.status()).toBe(200);

  // ── 02 · Populated workspace: document table and sidebar page tree ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  const main = page.locator('#main-content');
  await expect(main.getByRole('link', { name: pageTitle, exact: true })).toBeVisible();
  const tree = page.getByRole('tree', { name: '페이지 트리' });
  await expect(tree.getByRole('treeitem', { name: 'Team Handbook' })).toBeVisible();
  await capture(page, '02-workspace-populated-desktop');

  // ── 03 · Page view for an editor: in-place title, properties, blocks, links, backlinks ──
  await main.getByRole('link', { name: pageTitle, exact: true }).click();
  await expect(page).toHaveURL(`/page/${ops.slug}`);
  await expect(page.getByRole('heading', { name: pageTitle, level: 1 })).toBeVisible();
  await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
  const breadcrumb = page.getByRole('navigation', { name: '문서 경로' });
  await expect(breadcrumb.getByRole('link', { name: teamDisplayName })).toHaveAttribute(
    'href',
    `/teams/${teamName}/pages`
  );
  await expect(
    page.getByRole('link', { name: `현재 워크스페이스: ${teamDisplayName}` })
  ).toBeVisible();
  const actions = page.getByRole('group', { name: '문서 작업' });
  await expect(actions.getByRole('button', { name: /버전 기록/ })).toBeVisible();
  const body = page.locator('[data-page-body]');
  await expect(body.getByRole('link', { name: 'Decision log' })).toBeVisible();
  await expect(
    page.getByTestId('backlinks').getByRole('link', { name: 'Weekly sync notes' })
  ).toBeVisible();
  // Show the block gutter (drag handle and "+") on one block.
  await body.locator('[data-block-row]').nth(1).hover();
  await capture(page, '03-page-editing-desktop');

  // ── 04 · Version history: list with the current document marked, preview of a version ──
  await actions.getByRole('button', { name: /버전 기록/ }).click();
  const history = page.getByRole('dialog', { name: '버전 기록' });
  const versionList = history.getByRole('navigation', { name: '버전 목록' });
  await expect(versionList.getByText('현재 문서')).toBeVisible();
  const preview = history.getByRole('region', { name: '버전 미리보기' });
  await expect(preview.getByTestId('version-preview')).toContainText('Record decisions');
  await expect(preview.getByTestId('version-preview')).not.toContainText('Recovery');
  await capture(page, '04-version-history-desktop', false);

  // ── 05 · Restore is deliberate: the confirmation says what will happen ──
  await preview.getByRole('button', { name: '이 버전으로 복원' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('복원 전');
  await capture(page, '05-version-restore-confirm-desktop', false);
  const restoreResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/restore`) && response.request().method() === 'POST' && response.ok()
  );
  await confirm.getByRole('button', { name: '복원', exact: true }).click();
  expect((await (await restoreResponse).json()).content).toBe(original.content);
  await history.getByRole('button', { name: 'Close' }).click();
  await expect(history).toBeHidden();

  // ── 06 · Restored document, after fresh navigation and an API read (#75) ──
  await page.goto('/');
  await page.goto(`/page/${ops.slug}`);
  await expect(page.getByRole('heading', { name: pageTitle, level: 1 })).toBeVisible();
  await expect(body).not.toContainText('Recovery');
  const restored = await (await api.get(`/api/pages/${ops.id}`)).json();
  expect(restored.content).toBe(original.content);
  const versionsAfter = await (await api.get(`/api/pages/${ops.id}/versions`)).json();
  expect(versionsAfter[0].changeDescription).toBe('Before restore');
  await capture(page, '06-version-restored-desktop');

  // The old edit route opens the page itself, and the shell keeps the document's workspace.
  await page.goto(`/edit/${ops.id}`);
  await expect(page).toHaveURL(`/page/${ops.slug}`);
  await expect(
    page.getByRole('group', { name: '현재 워크스페이스' }).getByText(teamDisplayName)
  ).toBeVisible();

  // ── 07 · Page view for a teammate who may read but not edit ──
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.emulateMedia({ colorScheme: 'light' });
  await loginPageWithCookies(memberPage, member.email, member.password);
  await memberPage.goto(`/page/${ops.slug}`);
  await expect(memberPage.getByRole('heading', { name: pageTitle, level: 1 })).toBeVisible();
  await expect(memberPage.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
  await expect(memberPage.getByTestId('page-icon-button')).toHaveCount(0);
  await expect(
    memberPage.getByTestId('backlinks').getByRole('link', { name: 'Weekly sync notes' })
  ).toBeVisible();
  await capture(memberPage, '07-page-reading-desktop');
  await memberContext.close();

  // ── 08–10 · Dark theme: workspace, page, history ──
  await page.getByRole('button', { name: '다크 모드로 전환' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.goto(`/teams/${teamName}/pages`);
  await expect(main.getByRole('link', { name: pageTitle, exact: true })).toBeVisible();
  await capture(page, '08-workspace-dark');
  await page.goto(`/page/${ops.slug}`);
  await expect(body.getByRole('link', { name: 'Decision log' })).toBeVisible();
  await capture(page, '09-page-editing-dark');
  await actions.getByRole('button', { name: /버전 기록/ }).click();
  await expect(
    history.getByRole('region', { name: '버전 미리보기' }).getByTestId('version-preview')
  ).toBeVisible();
  await capture(page, '10-version-history-dark', false);
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
  await page.getByRole('button', { name: '라이트 모드로 전환' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  // ── 11–13 · Mobile: workspace, page, navigation drawer with the page tree ──
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(`/teams/${teamName}/pages`);
  await expect(main.getByRole('link', { name: pageTitle, exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'Mobile workspace');
  await capture(page, '11-mobile-workspace');

  await page.goto(`/page/${ops.slug}`);
  await expect(page.getByRole('heading', { name: pageTitle, level: 1 })).toBeVisible();
  await expect(page.getByRole('group', { name: '문서 작업' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'Mobile page');
  await capture(page, '12-mobile-page');

  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
  const drawer = page.getByRole('complementary', { name: '워크스페이스 패널' });
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())?.x ?? -1))
    .toBeGreaterThanOrEqual(0);
  await expect(
    page.getByRole('group', { name: '현재 워크스페이스' }).getByText(teamDisplayName)
  ).toBeVisible();
  await expect(drawer.getByRole('tree', { name: '페이지 트리' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'Mobile navigation');
  await capture(page, '13-mobile-navigation', false);

  await api.dispose();
});
