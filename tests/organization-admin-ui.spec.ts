/**
 * The platform admin's Organizations tab (issue #124 X1c P4), in a browser against the real
 * server. Every organization and account here is made by the spec itself (fresh accounts, a
 * slug carrying the run's timestamp), so the spec can run twice against the same database.
 * No existing data of the default organization is read or changed. What is written there: the
 * fresh accounts register into `default` (every sign-up does); one of them creates a team there
 * (to have a footprint that makes it ineligible as an owner), and the others are moved out
 * into the spec's own organizations. All of it is new, timestamped and owned by those accounts,
 * so nothing that existed before changes.
 *
 * Under test: the table (name, slug, members, owners, AI badge), the New organization dialog
 * (success, slug already used, unknown account, account that is not eligible with its reasons in
 * words), and Set owner only on a row without an owner, with the server's refusals next to the
 * field.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const ADMIN_EMAIL = 'e2e-platform-admin@example.com';
const ADMIN_PASSWORD = 'Password123!';
const DATABASE_URL = process.env.DATABASE_URL;

async function ensureAdminAccount(request: APIRequestContext) {
  const resp = await request.post('/api/auth/register', {
    data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect([201, 409]).toContain(resp.status());
}

test.describe('Admin panel: Organizations tab', () => {
  test('creates an organization, shows every refusal, and sets an owner only where there is none', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    if (!DATABASE_URL)
      throw new Error('DATABASE_URL is required to make an owner-less organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const slug = `p4-ui-${stamp}`;
    const name = `P4 UI Org ${stamp}`;

    await ensureAdminAccount(request);
    const owner = await registerTestUser(request, 'p4ui-owner');
    const other = await registerTestUser(request, 'p4ui-other');
    const teamMaker = await registerTestUser(request, 'p4ui-teammaker');
    const member = await registerTestUser(request, 'p4ui-member');
    const teamMakerApi = await createAuthenticatedApiContext(teamMaker.email, teamMaker.password);
    const memberApi = await createAuthenticatedApiContext(member.email, member.password);

    try {
      // An account that created a team has a footprint in the default organization.
      const team = await teamMakerApi.post('/api/teams', {
        data: { name: `p4ui-team-${stamp}`, displayName: `P4 UI Team ${stamp}` },
      });
      expect(team.status()).toBe(201);

      await loginPageWithCookies(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto('/admin');
      await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      await page.getByRole('tab', { name: 'Organizations' }).click();
      await expect(page.getByTestId('organizations-table')).toBeVisible();

      // ── Create: success ──
      await page.getByTestId('new-organization-button').click();
      const dialog = page.getByTestId('new-organization-dialog');
      await expect(dialog).toContainText('AI turned off');
      await dialog.getByLabel('Name').fill(name);
      await dialog.getByLabel('Slug').fill(slug);
      await dialog.getByLabel('Owner email').fill(owner.email);
      const created = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/admin/organizations' &&
          response.request().method() === 'POST'
      );
      await page.getByTestId('create-organization-submit').click();
      expect((await created).status()).toBe(201);
      await expect(dialog).toHaveCount(0);
      const row = page.getByTestId(`organization-row-${slug}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(name);
      await expect(page.getByTestId(`organization-ai-${slug}`)).toHaveText('AI off');
      await expect(row.getByRole('cell').nth(2)).toHaveText('1'); // members
      await expect(row.getByRole('cell').nth(3)).toHaveText('1'); // owners
      await expect(page.getByTestId(`set-owner-${slug}`)).toHaveCount(0);

      // ── Create: slug already used, shown on the slug field ──
      await page.getByTestId('new-organization-button').click();
      await dialog.getByLabel('Name').fill(`${name} again`);
      await dialog.getByLabel('Slug').fill(slug);
      await dialog.getByLabel('Owner email').fill(other.email);
      await page.getByTestId('create-organization-submit').click();
      await expect(dialog.getByText('This slug is already in use')).toBeVisible();

      // ── Create: a slug that does not match the pattern is refused before any request ──
      await dialog.getByLabel('Slug').fill('Not A Slug');
      await page.getByTestId('create-organization-submit').click();
      await expect(dialog.getByText(/lowercase letters, numbers or hyphens/)).toBeVisible();

      // ── Create: unknown account, shown on the email field ──
      await dialog.getByLabel('Slug').fill(`${slug}-b`);
      await dialog.getByLabel('Owner email').fill(`nobody-${stamp}@example.com`);
      await page.getByTestId('create-organization-submit').click();
      await expect(dialog.getByText('No account with this email')).toBeVisible();

      // ── Create: an account that is on a team, with the reasons in plain words ──
      await dialog.getByLabel('Owner email').fill(teamMaker.email);
      await page.getByTestId('create-organization-submit').click();
      const notEligible = dialog.getByTestId('owner-not-eligible');
      await expect(notEligible).toContainText('belongs to a team');
      await expect(notEligible).toContainText(
        'Only an account that has not used another organization yet can be named owner.'
      );
      await expect(page.getByTestId(`organization-row-${slug}-b`)).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);

      // ── Set owner: only on a row without an owner ──
      const ownerlessSlug = `p4-ui-none-${stamp}`;
      const { rows } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [ownerlessSlug]
      );
      const ownerlessId = Number(rows[0].id);
      const memberId = Number((await (await memberApi.get('/api/auth/me')).json()).id);
      await db.query(
        `UPDATE organization_members SET organization_id = $1, role = 'member' WHERE user_id = $2`,
        [ownerlessId, memberId]
      );
      await page.reload();
      await page.getByRole('tab', { name: 'Organizations' }).click();
      const ownerlessRow = page.getByTestId(`organization-row-${ownerlessSlug}`);
      await expect(ownerlessRow).toBeVisible();
      await expect(ownerlessRow.getByRole('cell').nth(3)).toHaveText('0');
      await expect(page.getByTestId(`set-owner-${slug}`)).toHaveCount(0);

      // An organization with no members cannot be given an owner: a note, no button.
      const emptySlug = `p4-ui-empty-${stamp}`;
      await db.query(`INSERT INTO organizations (slug, name) VALUES ($1, $1)`, [emptySlug]);
      await page.reload();
      await page.getByRole('tab', { name: 'Organizations' }).click();
      await expect(page.getByTestId(`organization-row-${emptySlug}`)).toBeVisible();
      await expect(page.getByTestId(`no-members-${emptySlug}`)).toHaveText('No members yet');
      await expect(page.getByTestId(`set-owner-${emptySlug}`)).toHaveCount(0);

      await page.getByTestId(`set-owner-${ownerlessSlug}`).click();
      const ownerDialog = page.getByTestId('set-owner-dialog');
      // An email that is no member of this organization is shown on the field.
      await ownerDialog.getByLabel('Member email').fill(other.email);
      await page.getByTestId('set-owner-submit').click();
      await expect(
        ownerDialog.getByText(/No member of this organization has this email/)
      ).toBeVisible();
      // The member of the organization becomes its owner.
      await ownerDialog.getByLabel('Member email').fill(member.email);
      await page.getByTestId('set-owner-submit').click();
      await expect(ownerDialog).toHaveCount(0);
      await expect(ownerlessRow.getByRole('cell').nth(3)).toHaveText('1');
      await expect(page.getByTestId(`set-owner-${ownerlessSlug}`)).toHaveCount(0);
    } finally {
      await teamMakerApi.dispose();
      await memberApi.dispose();
      await db.end();
    }
  });
});
