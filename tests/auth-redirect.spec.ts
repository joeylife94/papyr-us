import { test, expect, type Page, type Response, request } from '@playwright/test';

async function registerUser(page: Page, name: string, email: string, pass: string) {
  // Prefer fast API-based registration; fall back to UI if needed
  const ctx = await request.newContext({ baseURL: test.info().project.use?.baseURL as string });
  const apiResp = await ctx.post('/api/auth/register', {
    data: { name, email, password: pass },
  });
  if (apiResp.status() === 201 || apiResp.status() === 409) {
    // 201: created, 409: already exists — both fine for tests
    return;
  }

  // Fallback to UI registration if API path failed
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pass);
  const responsePromise = page.waitForResponse(
    (response: Response) =>
      response.url().includes('/api/auth/register') && response.status() === 201
  );
  await page.getByRole('button', { name: 'Register' }).click();
  await responsePromise;
  await expect(page).toHaveURL('/login');
}

async function login(page: Page, email: string, password: string) {
  // Try API login to set token directly for speed and stability
  const ctx = await request.newContext({ baseURL: test.info().project.use?.baseURL as string });
  const resp = await ctx.post('/api/auth/login', { data: { email, password } });
  if (resp.ok()) {
    const body = await resp.json();
    await page.addInitScript((t) => localStorage.setItem('token', t), body.token);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    return;
  }

  // Fallback to UI login
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  const loginResponse = page.waitForResponse(
    (response: Response) => response.url().includes('/api/auth/login') && response.status() === 200
  );
  await page.getByRole('button', { name: 'Login with Email' }).click();
  await loginResponse;
  await expect(page).toHaveURL('/');
}

/**
 * Verify that when a write action is attempted without a valid token,
 * the client removes token and navigates to /login with redirect param.
 */
test('401 -> redirects to /login with redirect param when accessing protected route', async ({
  page,
}) => {
  const email = `e2e-401-${Date.now()}@example.com`;
  const password = 'password123';

  await registerUser(page, 'E2E401', email, password);
  // Ensure logged-out state
  await page.addInitScript(() => localStorage.removeItem('token'));
  // Access a protected route
  await page.goto('/create');
  // Expect immediate redirect to login with correct redirect param
  await expect(page).toHaveURL(/\/login\?redirect=%2Fcreate/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('401 write -> redirects to /login with redirect param when posting /api/pages while logged out', async ({
  page,
}) => {
  // Start logged out on home
  await page.addInitScript(() => localStorage.removeItem('token'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Trigger a write via client fetch without awaiting it (navigation will occur on 401)
  await page.evaluate(() => {
    setTimeout(() => {
      fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 't', content: 'c' }),
      }).catch(() => {
        // ignore errors due to navigation
      });
    }, 0);
  });

  // Expect redirect to login with current path as redirect
  await expect(page).toHaveURL(/\/login\?redirect=%2F/);
});
