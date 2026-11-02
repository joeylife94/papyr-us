import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #124 X0: the admin panel and the admin APIs accept a signed-in platform admin (an account
// whose email is in ADMIN_EMAILS, set for the E2E server in playwright.config.ts) and nothing else.
// There is no shared admin password.

const ADMIN_EMAIL = 'e2e-platform-admin@example.com';
const ADMIN_ACCOUNT_PASSWORD = 'Password123!';

/** The admin account may already exist when the same database is reused between runs. */
async function ensureAdminAccount(request: APIRequestContext) {
  const resp = await request.post('/api/auth/register', {
    data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_ACCOUNT_PASSWORD },
  });
  expect([201, 409]).toContain(resp.status());
}

test('a signed-in account outside ADMIN_EMAILS is refused, with no password prompt', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'not-admin');
  await loginPageWithCookies(page, user.email, user.password);

  await page.goto('/admin');
  await expect(page.getByTestId('admin-access-message')).toHaveText(
    /Your account is not a platform admin/
  );
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Admin Panel' })).toHaveCount(0);

  const api = await createAuthenticatedApiContext(user.email, user.password);
  try {
    expect((await api.get('/api/admin/session')).status()).toBe(403);
    expect((await api.get('/api/admin/directories')).status()).toBe(403);
  } finally {
    await api.dispose();
  }
});

test('a signed-out visitor is sent to sign in, and shared-password routes are gone', async ({
  page,
  request,
}) => {
  // The app's 401 handling (or the panel's own "Sign in" button) lands on the login page, which
  // returns to /admin after signing in.
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin$/);
  await expect(page.getByRole('heading', { name: 'Admin Panel' })).toHaveCount(0);

  // The shared-password login is gone: no admin token comes back. (The route bundle answers 404,
  // see server/tests/admin.test.ts; under the E2E dev server Vite answers unknown routes with
  // the app shell.)
  const legacyLogin = await request.post('/api/admin/auth', { data: { password: 'anything' } });
  expect(legacyLogin.headers()['set-cookie'] ?? '').not.toContain('accessToken');
  expect(legacyLogin.headers()['content-type'] ?? '').not.toContain('application/json');
  const withHeader = await request.get('/api/admin/directories', {
    headers: { 'x-admin-password': 'anything' },
  });
  expect(withHeader.status()).toBe(403);
});

test('an account listed in ADMIN_EMAILS opens the admin panel with its own session', async ({
  page,
  request,
}) => {
  await ensureAdminAccount(request);
  await loginPageWithCookies(page, ADMIN_EMAIL, ADMIN_ACCOUNT_PASSWORD);

  const directories = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/admin/directories'
  );
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
  expect((await directories).status()).toBe(200);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
