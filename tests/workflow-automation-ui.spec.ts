import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  registerTestUser,
  createAuthenticatedApiContext,
  loginPageWithCookies,
} from './e2e-helpers';

/**
 * Workflow Automation UI E2E Tests
 *
 * Validates the /teams/:teamName/automation page:
 * - Create a workflow through the UI dialog
 * - Verify it appears in the same team's automation page
 * - Verify it does NOT appear in a different team's automation page
 */

/** Create a team via API and return the team object */
async function createTeamApi(request: APIRequestContext, name: string) {
  const resp = await request.post('/api/teams', {
    data: { name, displayName: `Team ${name}`, description: `E2E UI workflow team ${name}` },
  });
  expect(resp.status()).toBe(201);
  return resp.json();
}

test.describe('Workflow Automation UI', () => {
  let email: string;
  let password: string;
  let teamAName: string;
  let teamBName: string;
  let authRequest: APIRequestContext;

  test.beforeAll(async ({ request }) => {
    const result = await registerTestUser(request, 'wf-ui');
    email = result.email;
    password = result.password;
    teamAName = `wf-ui-a-${Date.now()}`;
    teamBName = `wf-ui-b-${Date.now()}`;
    authRequest = await createAuthenticatedApiContext(email, password);
    await createTeamApi(authRequest, teamAName);
    await createTeamApi(authRequest, teamBName);
  });

  test.afterAll(async () => {
    await authRequest?.dispose();
  });

  test('create workflow on team A, visible in A, invisible in B', async ({ page, baseURL }) => {
    await loginPageWithCookies(page, email, password);
    await page.goto(baseURL!);

    // Navigate to team A's automation page
    await page.goto(`/teams/${teamAName}/automation`);

    // Wait for the page to be loaded (heading or create button should be visible)
    const createBtn = page.getByRole('button', { name: /워크플로우 만들기/i });
    await expect(createBtn.first()).toBeVisible({ timeout: 30_000 });

    // Open the create dialog
    await createBtn.first().click();

    // Fill the form
    const workflowName = `UI-WF-${Date.now()}`;
    await page.getByLabel(/워크플로우 이름/i).fill(workflowName);
    await page.getByLabel(/설명/i).fill('E2E UI 자동화 테스트 워크플로우');

    // Submit
    const submitBtn = page.getByRole('button', { name: /워크플로우 생성/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Wait for dialog to close and the new workflow to appear in the list
    await expect(page.getByText(workflowName)).toBeVisible({ timeout: 15_000 });

    // Verify the workflow card has the expected trigger badge
    await expect(page.getByText('트리거')).toBeVisible();

    // --- Now check team B's page ---
    await page.goto(`/teams/${teamBName}/automation`);

    // Wait for the page to load
    const createBtnB = page.getByRole('button', { name: /워크플로우 만들기/i });
    await expect(createBtnB.first()).toBeVisible({ timeout: 30_000 });

    // The workflow created for team A should NOT be visible here
    await expect(page.getByText(workflowName)).not.toBeVisible({ timeout: 5_000 });
  });
});
