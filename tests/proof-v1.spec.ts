import { mkdirSync } from 'node:fs';
import { Pool } from 'pg';
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const PROOF_DIR = 'proof-artifacts';

async function createTeam(request: APIRequestContext, name: string, displayName: string) {
  const response = await request.post('/api/teams', {
    data: {
      name,
      displayName,
      description: 'Synthetic v1.0 proof workspace',
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function grantProofTeamMembership(email: string, teamId: number) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const userResult = await pool.query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    expect(userResult.rowCount).toBe(1);
    const userId = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO team_members (team_id, user_id, role, invited_by)
       VALUES ($1, $2, 'owner', $2)`,
      [teamId, userId]
    );

    const membershipResult = await pool.query(
      'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, userId]
    );
    expect(membershipResult.rows).toEqual([{ role: 'owner' }]);
  } finally {
    await pool.end();
  }
}

test.describe('v1.0 fresh proof package', () => {
  test('captures synthetic team workspace and created document proof', async ({ page, request }) => {
    mkdirSync(PROOF_DIR, { recursive: true });

    const stamp = Date.now();
    const credentials = await registerTestUser(request, `proof-v1-${stamp}`);
    const teamName = `proof-team-${stamp}`;
    const teamDisplayName = `Proof Team ${stamp}`;
    const pageTitle = `Papyr v1 Proof ${stamp}`;

    // GAP-006 packages representative user-visible proof; GJ-01 already owns UI register/login proof.
    // Seed a fresh synthetic actor through the accepted API helper, then authenticate the browser
    // with the same session contract so proof generation is not coupled to duplicate auth coverage.
    await loginPageWithCookies(page, credentials.email, credentials.password);
    await page.goto('/');
    await expect(page).toHaveURL('/', { timeout: 20000 });

    const authRequest = await createAuthenticatedApiContext(
      credentials.email,
      credentials.password
    );
    const team = await createTeam(authRequest, teamName, teamDisplayName);

    // The authenticated teams collection is membership-scoped. Team creation itself only creates
    // the team row, so the proof fixture must seed the actor's RBAC membership before asking the
    // already-authenticated browser to render that team in the accepted GJ-01 sidebar path.
    await grantProofTeamMembership(credentials.email, team.id);

    await page.reload({ waitUntil: 'domcontentloaded' });
    const teamButton = page.getByRole('button', { name: new RegExp(teamDisplayName) });
    await expect(teamButton).toBeVisible({ timeout: 15000 });
    await teamButton.click();
    await page.getByRole('link', { name: '팀 페이지' }).click();
    await expect(page).toHaveURL(`/teams/${teamName}/pages`, { timeout: 15000 });
    await expect(
      page.getByRole('heading', { name: `${teamName} 팀 문서`, level: 1, exact: true })
    ).toBeVisible();

    await page.screenshot({
      path: `${PROOF_DIR}/01-team-pages.png`,
      fullPage: true,
    });

    await page.getByRole('button', { name: '새 문서 작성' }).click();
    await expect(page).toHaveURL(new RegExp(`/teams/${teamName}/create`));
    await page.getByLabel('Title').fill(pageTitle);

    const addParagraph = page.getByRole('button', { name: '단락', exact: true });
    await expect(addParagraph).toBeVisible({ timeout: 10000 });
    await addParagraph.click();

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('Synthetic proof content for the accepted Papyr.us v1.0 browser path.');

    // Observe the actual create response first. Filtering on status here hides a real 4xx/5xx
    // behind a 120s wait timeout and prevents Issue #61 from recording the concrete failure.
    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/pages') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Create Page' }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const createdPage = await createResponse.json();

    expect(String(createdPage.teamId)).toBe(String(team.id));
    await expect(page).toHaveURL(`/page/${createdPage.slug}`, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: pageTitle })).toBeVisible();

    await page.screenshot({
      path: `${PROOF_DIR}/02-created-page.png`,
      fullPage: true,
    });

    await authRequest.delete(`/api/pages/${createdPage.id}`).catch(() => {});
    await authRequest.delete(`/api/teams/${team.id}`).catch(() => {});
    await authRequest.dispose();
  });
});
