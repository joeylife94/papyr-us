/**
 * Admin directory answers never carry a stored password, end to end against the real server.
 *
 * Rules under test, as a platform admin:
 * - GET, POST and PATCH /api/admin/directories answer `hasPassword` and no `password` field, and
 *   the stored hash does not appear in any answer;
 * - the admin form for a protected directory shows it as protected, keeps the password when
 *   another field is edited and removes it only when removal is ticked;
 * - the directory's password verifies for a signed-in caller.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const ADMIN_EMAIL = 'e2e-platform-admin@example.com';
const ADMIN_PASSWORD = 'Password123!';

async function ensureAdminAccount(request: APIRequestContext) {
  const resp = await request.post('/api/auth/register', {
    data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect([201, 409]).toContain(resp.status());
}

test('directory answers carry hasPassword, never the password, and the form keeps or removes it', async ({
  page,
  request,
}) => {
  await ensureAdminAccount(request);
  const admin = await createAuthenticatedApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  const stamp = Date.now();
  const name = `dirpw-${stamp}`;
  let directoryId: number | undefined;
  try {
    const created = await admin.post('/api/admin/directories', {
      data: { name, displayName: `Dir ${stamp}`, password: 'dir-secret' },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    directoryId = Number(createdBody.id);
    expect(createdBody.hasPassword).toBe(true);
    expect(createdBody).not.toHaveProperty('password');

    const listed = await admin.get('/api/admin/directories');
    expect(listed.status()).toBe(200);
    const listedText = await listed.text();
    expect(listedText).not.toContain('$2');
    const mine = (JSON.parse(listedText) as any[]).find((d) => d.id === directoryId);
    expect(mine).toMatchObject({ name, hasPassword: true });
    expect(mine).not.toHaveProperty('password');

    // A signed-in caller verifies the password
    const member = await registerTestUser(request, 'dirpw-member');
    const memberApi = await createAuthenticatedApiContext(member.email, member.password);
    try {
      const verify = (password: string) =>
        memberApi.post('/api/directory/verify', { data: { directoryName: name, password } });
      expect(await (await verify('dir-secret')).json()).toEqual({ success: true });
      expect(await (await verify('wrong')).json()).toEqual({ success: false });
    } finally {
      await memberApi.dispose();
    }

    // The form: editing another field keeps the password
    const patched = () =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/admin/directories/${directoryId}` &&
          response.request().method() === 'PATCH'
      );
    await loginPageWithCookies(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin');
    const card = page.locator('div.rounded-lg', { hasText: `Dir ${stamp}` }).first();
    await expect(card.getByText('Yes')).toBeVisible();
    await card.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByPlaceholder('Leave empty to keep the current password')).toHaveValue('');
    await page.getByPlaceholder('Documentation, Team Alpha, etc.').fill(`Dir renamed ${stamp}`);
    const renamedAnswer = patched();
    await page.getByRole('button', { name: 'Update' }).click();
    const renamed = await renamedAnswer;
    expect(renamed.status()).toBe(200);
    expect(await renamed.json()).toMatchObject({ hasPassword: true });
    const kept = await (await admin.get('/api/admin/directories')).json();
    expect(kept.find((d: any) => d.id === directoryId)).toMatchObject({ hasPassword: true });

    // Ticking the removal removes it, and only then
    await page.reload();
    const card2 = page.locator('div.rounded-lg', { hasText: `Dir renamed ${stamp}` }).first();
    await card2.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Remove the password').check();
    const removedAnswer = patched();
    await page.getByRole('button', { name: 'Update' }).click();
    const removed = await removedAnswer;
    expect(removed.status()).toBe(200);
    expect(await removed.json()).toMatchObject({ hasPassword: false });
    const after = await (await admin.get('/api/admin/directories')).json();
    expect(after.find((d: any) => d.id === directoryId)).toMatchObject({ hasPassword: false });
  } finally {
    if (directoryId) await admin.delete(`/api/admin/directories/${directoryId}`);
    await admin.dispose();
  }
});
