import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const PROOF_DIR = 'issue-76-proof';

test('Issue 76: capture genuine workspace, reader, dark mode, and mobile navigation', async ({
  page,
  request,
}) => {
  mkdirSync(PROOF_DIR, { recursive: true });
  await page.emulateMedia({ colorScheme: 'light' });

  const stamp = Date.now();
  const credentials = await registerTestUser(request, `issue76-${stamp}`);
  await loginPageWithCookies(page, credentials.email, credentials.password);
  const authRequest = await createAuthenticatedApiContext(
    credentials.email,
    credentials.password
  );

  const teamName = `issue76-team-${stamp}`;
  const teamDisplayName = 'Product Design Workspace';
  const createTeamResponse = await authRequest.post('/api/teams', {
    data: { name: teamName, displayName: teamDisplayName, description: 'Synthetic UI proof workspace' },
  });
  expect(createTeamResponse.status()).toBe(201);
  const team = await createTeamResponse.json();

  await page.goto('/');
  const teamButton = page.getByRole('button', { name: new RegExp(teamDisplayName) });
  await expect(teamButton).toBeVisible({ timeout: 15000 });
  await teamButton.click();
  await page.getByRole('link', { name: '팀 페이지' }).click();
  await expect(page).toHaveURL(`/teams/${teamName}/pages`, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: `${teamName} 팀 문서`, level: 1 })).toBeVisible();

  await page.screenshot({ path: `${PROOF_DIR}/01-workspace-empty-desktop.png`, fullPage: true });

  const pageTitle = 'Operations Handbook';
  const createdResponse = await authRequest.post('/api/pages', {
    data: {
      title: pageTitle,
      content: '# Operations Handbook\n\nGuidelines for a small team to share decisions and recover prior documents.\n\n## Weekly rhythm\n\n- Review tasks\n- Document decisions',
      slug: `operations-handbook-${stamp}`,
      folder: 'docs',
      author: credentials.name,
      tags: ['operations', 'proof'],
      teamId: team.id,
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(pageTitle, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${PROOF_DIR}/02-workspace-populated-desktop.png`, fullPage: true });

  await page.goto(`/page/${created.slug}`);
  await expect(page.getByRole('heading', { name: pageTitle, level: 1 }).first()).toBeVisible();
  await page.screenshot({ path: `${PROOF_DIR}/03-document-reader-desktop.png`, fullPage: true });

  const toDark = page.getByRole('button', { name: 'Switch to dark mode' });
  await expect(toDark).toBeVisible();
  await toDark.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: `${PROOF_DIR}/04-document-reader-dark.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
  await page.screenshot({ path: `${PROOF_DIR}/05-mobile-navigation.png`, fullPage: true });

  await authRequest.dispose();
});
