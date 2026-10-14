import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

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

test('Issue 76: capture genuine workspace, reader, history, dark mode, and mobile surfaces', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  mkdirSync(PROOF_DIR, { recursive: true });
  await page.emulateMedia({ colorScheme: 'light' });

  const stamp = Date.now();
  const credentials = await registerTestUser(request, `issue76-${stamp}`);
  await loginPageWithCookies(page, credentials.email, credentials.password);
  const authRequest = await createAuthenticatedApiContext(credentials.email, credentials.password);

  const teamName = `issue76-team-${stamp}`;
  const teamDisplayName = 'Product Design Workspace';
  const createTeamResponse = await authRequest.post('/api/teams', {
    data: {
      name: teamName,
      displayName: teamDisplayName,
      description: 'Synthetic UI proof workspace',
    },
  });
  expect(createTeamResponse.status()).toBe(201);
  const team = await createTeamResponse.json();

  // Workspace selection through the real sidebar team selector.
  await page.goto('/');
  const teamButton = page.getByRole('button', { name: new RegExp(teamDisplayName) });
  await expect(teamButton).toBeVisible({ timeout: 15000 });
  await teamButton.click();
  await page.getByRole('link', { name: '팀 페이지' }).click();
  await expect(page).toHaveURL(`/teams/${teamName}/pages`, { timeout: 15000 });
  await expect(
    page.getByRole('heading', { name: `${teamName} 팀 문서`, level: 1, exact: true })
  ).toBeVisible();

  // Workspace context and the empty state are explicit; creation remains the primary action.
  await expect(
    page.getByRole('link', { name: `현재 워크스페이스: ${teamDisplayName}` })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '아직 문서가 없습니다' })).toBeVisible();
  const createButton = page.getByRole('button', { name: '새 문서 작성' });
  await expect(createButton).toBeVisible();
  await page.screenshot({ path: `${PROOF_DIR}/01-workspace-empty-desktop.png`, fullPage: true });

  // The create entry point still resolves to the team-scoped editor.
  await createButton.click();
  await expect(page).toHaveURL(`/teams/${teamName}/create`);
  await expect(page.getByRole('heading', { name: `${teamName} 팀 새 문서 작성` })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(`/teams/${teamName}/pages`);

  const pageTitle = 'Operations Handbook';
  const createdResponse = await authRequest.post('/api/pages', {
    data: {
      title: pageTitle,
      content:
        'Guidelines for a small team to share decisions and recover prior documents.\n\n## Weekly rhythm\n\n- Review tasks\n- Document decisions',
      slug: `operations-handbook-${stamp}`,
      folder: 'docs',
      author: credentials.name,
      tags: ['operations', 'proof'],
      teamId: team.id,
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();

  // A real update produces a prior version for the existing history/recovery surface.
  const updatedResponse = await authRequest.put(`/api/pages/${created.id}`, {
    data: {
      content:
        'Guidelines for a small team to share decisions and recover prior documents.\n\n## Weekly rhythm\n\n- Review tasks\n- Document decisions\n\n## Recovery\n\nPrior versions stay available from the version history.',
    },
  });
  expect(updatedResponse.status()).toBe(200);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#main-content').getByText(pageTitle, { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${PROOF_DIR}/02-workspace-populated-desktop.png`,
    fullPage: true,
  });

  // Reader: open from the workspace list, keep workspace context, expose one action group.
  await page.locator('#main-content').getByText(pageTitle, { exact: true }).click();
  await expect(page).toHaveURL(`/page/${created.slug}`);
  await expect(page.getByRole('heading', { name: pageTitle, level: 1 })).toBeVisible();
  const breadcrumb = page.getByRole('navigation', { name: '문서 경로' });
  await expect(breadcrumb.getByRole('link', { name: teamDisplayName })).toHaveAttribute(
    'href',
    `/teams/${teamName}/pages`
  );
  await expect(
    page.getByRole('link', { name: `현재 워크스페이스: ${teamDisplayName}` })
  ).toBeVisible();
  const actions = page.getByRole('group', { name: '문서 작업' });
  await expect(actions.getByRole('button', { name: '편집' })).toBeVisible();
  await expect(actions.getByRole('button', { name: /버전 기록/ })).toBeVisible();
  await page.screenshot({ path: `${PROOF_DIR}/03-document-reader-desktop.png`, fullPage: true });

  // Existing history/recovery path stays reachable from the reader action group.
  await actions.getByRole('button', { name: /버전 기록/ }).click();
  const historyDialog = page.getByRole('dialog');
  await expect(historyDialog).toBeVisible();
  await expect(historyDialog.getByRole('button', { name: '복원' }).first()).toBeVisible();
  // Wait for the sheet's slide-in to finish so the capture shows the settled surface.
  const viewportWidth = page.viewportSize()?.width ?? 0;
  await expect
    .poll(async () => {
      const box = await historyDialog.boundingBox();
      return box ? Math.round(box.x + box.width) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(viewportWidth);
  await page.screenshot({ path: `${PROOF_DIR}/04-version-history-desktop.png` });
  await page.keyboard.press('Escape');
  await expect(historyDialog).toBeHidden();

  // Existing edit entry is preserved, and the shell keeps the document's workspace context.
  await actions.getByRole('button', { name: '편집' }).click();
  await expect(page).toHaveURL(`/edit/${created.id}`);
  await expect(page.getByRole('heading', { name: 'Edit Page' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: '현재 워크스페이스' }).getByText(teamDisplayName)
  ).toBeVisible();

  // Return to the reader explicitly; the editor preview also renders the title as a heading.
  await page.goto(`/page/${created.slug}`);
  await expect(page).toHaveURL(`/page/${created.slug}`);
  await expect(page.getByRole('group', { name: '문서 작업' })).toBeVisible();

  const toDark = page.getByRole('button', { name: 'Switch to dark mode' });
  await expect(toDark).toBeVisible();
  await toDark.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: `${PROOF_DIR}/05-document-reader-dark.png`, fullPage: true });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  // Mobile surfaces: workspace list, reader, and navigation drawer without horizontal overflow.
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(`/teams/${teamName}/pages`);
  await expect(page.locator('#main-content').getByText(pageTitle, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'Mobile workspace');
  await page.screenshot({ path: `${PROOF_DIR}/06-mobile-workspace.png`, fullPage: true });

  await page.goto(`/page/${created.slug}`);
  await expect(page.getByRole('heading', { name: pageTitle, level: 1 })).toBeVisible();
  await expect(page.getByRole('group', { name: '문서 작업' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'Mobile reader');
  await page.screenshot({ path: `${PROOF_DIR}/07-mobile-reader.png`, fullPage: true });

  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
  // Wait for the drawer's slide-in to finish before asserting layout and capturing.
  const drawer = page
    .getByRole('complementary')
    .filter({ has: page.getByRole('navigation', { name: '주요 메뉴' }) });
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())?.x ?? -1))
    .toBeGreaterThanOrEqual(0);
  await expect(
    page.getByRole('group', { name: '현재 워크스페이스' }).getByText(teamDisplayName)
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, 'Mobile navigation');
  await page.screenshot({ path: `${PROOF_DIR}/08-mobile-navigation.png` });

  await authRequest.dispose();
});
