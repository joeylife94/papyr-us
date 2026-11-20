/**
 * Sessions belong to active accounts, and a session is an access token: end to end against the
 * real server, authentication and PostgreSQL. Synthetic accounts only. The route rules are in
 * server/tests/auth-token-kinds.test.ts.
 *
 * No API deactivates an account yet (#124 X5), so the spec sets users.is_active in the database
 * (DATABASE_URL).
 *
 * Rules under test:
 * - a refresh token is accepted by POST /api/auth/refresh only, never as the session;
 * - a deactivated account gets no new session: password sign-in is refused (403, and only
 *   after the right password; a wrong one still answers 401) and so is a refresh (401);
 * - the login page tells the person why, for the password form and for the redirect the social
 *   sign-in callbacks use;
 * - an active account is unaffected.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test';
import { Pool } from 'pg';
import { registerTestUser } from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';

function cookieValue(setCookie: string[], name: string): string | undefined {
  for (const header of setCookie) {
    const match = header.match(new RegExp(`(?:^|\\n)${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
}

test.describe('Sessions of deactivated accounts', () => {
  test('a refresh token is not a session, and a deactivated account gets none', async ({
    request,
    page,
  }) => {
    test.setTimeout(120_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to deactivate an account');
    const db = new Pool({ connectionString: DATABASE_URL });
    const user = await registerTestUser(request, 'deactivated');
    const signedOut = await playwrightRequest.newContext({ baseURL: BASE_URL });

    try {
      // An active account signs in and gets both cookies.
      const login = await signedOut.post('/api/auth/login', {
        data: { email: user.email, password: user.password },
      });
      expect(login.status()).toBe(200);
      const setCookie = login
        .headersArray()
        .filter((header) => header.name.toLowerCase() === 'set-cookie')
        .map((header) => header.value);
      const accessToken = cookieValue(setCookie, 'accessToken');
      const refreshToken = cookieValue(setCookie, 'refreshToken');
      expect(accessToken, 'access cookie').toBeTruthy();
      expect(refreshToken, 'refresh cookie').toBeTruthy();

      // The refresh token is not a session, as a cookie or as a Bearer token.
      const bare = await playwrightRequest.newContext({ baseURL: BASE_URL });
      try {
        const asCookie = await bare.get('/api/auth/me', {
          headers: { Cookie: `accessToken=${refreshToken}` },
        });
        expect(asCookie.status(), 'refresh token as the session cookie').toBe(401);
        const asBearer = await bare.get('/api/auth/me', {
          headers: { Authorization: `Bearer ${refreshToken}` },
        });
        expect(asBearer.status(), 'refresh token as a Bearer token').toBe(401);
        // The access token is one.
        const real = await bare.get('/api/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        expect(real.status(), 'access token').toBe(200);

        // While active, a refresh works.
        const refreshed = await bare.post('/api/auth/refresh', {
          headers: { Cookie: `refreshToken=${refreshToken}` },
        });
        expect(refreshed.status(), 'refresh while active').toBe(200);

        // An administrator turns the account off.
        const updated = await db.query('UPDATE users SET is_active = FALSE WHERE email = $1', [
          user.email,
        ]);
        expect(updated.rowCount).toBe(1);

        const refreshAfter = await bare.post('/api/auth/refresh', {
          headers: { Cookie: `refreshToken=${refreshToken}` },
        });
        expect(refreshAfter.status(), 'refresh after deactivation').toBe(401);
        expect(
          refreshAfter.headersArray().some((header) => header.name.toLowerCase() === 'set-cookie'),
          'no cookie is set by a refused refresh'
        ).toBe(false);

        const wrongPassword = await bare.post('/api/auth/login', {
          data: { email: user.email, password: `${user.password}-wrong` },
        });
        expect(wrongPassword.status(), 'wrong password says nothing about the account').toBe(401);

        const rightPassword = await bare.post('/api/auth/login', {
          data: { email: user.email, password: user.password },
        });
        expect(rightPassword.status(), 'right password, deactivated').toBe(403);
        expect(await rightPassword.json()).toEqual({ message: 'Account is deactivated' });
        expect(
          rightPassword.headersArray().some((header) => header.name.toLowerCase() === 'set-cookie'),
          'no cookie is set by a refused sign-in'
        ).toBe(false);
      } finally {
        await bare.dispose();
      }

      // The login page says why, and stays where it is.
      await page.goto('/login');
      await expect(page.getByTestId('login-account-deactivated')).toHaveCount(0);
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: 'Login with Email' }).click();
      await expect(page.getByTestId('login-account-deactivated')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);

      // The social sign-in callbacks land here with the same explanation.
      await page.goto('/login?error=account_deactivated');
      await expect(page.getByTestId('login-account-deactivated')).toBeVisible();

      // Turned on again, the account signs in as before.
      await db.query('UPDATE users SET is_active = TRUE WHERE email = $1', [user.email]);
      const again = await signedOut.post('/api/auth/login', {
        data: { email: user.email, password: user.password },
      });
      expect(again.status(), 'sign-in after reactivation').toBe(200);
    } finally {
      await db.query('UPDATE users SET is_active = TRUE WHERE email = $1', [user.email]);
      await signedOut.dispose();
      await db.end();
    }
  });
});
