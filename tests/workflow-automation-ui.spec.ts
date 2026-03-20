import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { registerTestUser, authHeader } from './e2e-helpers';

/**
 * Workflow Automation UI E2E Tests
 *
 * Validates the /teams/:teamName/automation page:
 * - Create a workflow through the UI dialog
 * - Verify it appears in the same team's automation page
 * - Verify it does NOT appear in a different team's automation page
 */

/** Create a team via API and return the team object */
async function createTeamApi(
  request: APIRequestContext,
  name: string,
  headers: Record<string, string>
) {
  const resp = await request.post('/api/teams', {
    headers,
    data: { name, displayName: `Team ${name}`, description: `E2E UI workflow team ${name}` },
  });
  expect(resp.status()).toBe(201);
  return resp.json();
}

/** Inject auth token into the browser's localStorage so API calls from the SPA succeed */
async function injectToken(page: Page, token: string, baseURL: string) {
  await page.goto(baseURL);
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
  }, token);
}

test.describe('Workflow Automation UI', () => {
  let token: string;
  let teamAName: string;
  let teamBName: string;

  test.beforeAll(async ({ request }) => {
    const result = await registerTestUser(request, 'wf-ui');
    token = result.token;
    teamAName = `wf-ui-a-${Date.now()}`;
    teamBName = `wf-ui-b-${Date.now()}`;
    const headers = authHeader(token);
    await createTeamApi(request, teamAName, headers);
    await createTeamApi(request, teamBName, headers);
  });

  test('create workflow on team A, visible in A, invisible in B', async ({ page, baseURL }) => {
    // Inject the auth token into localStorage
    await injectToken(page, token, baseURL!);

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
