import { test, expect, type Page, type Response } from '@playwright/test';

async function registerUser(page: Page, name: string, email: string, pass: string) {
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
test('401 write -> redirects to /login with redirect param', async ({ page }) => {
  const email = `e2e-401-${Date.now()}@example.com`;
  const password = 'password123';

  await registerUser(page, 'E2E401', email, password);
  await login(page, email, password);

  // Navigate to create page via sidebar quick action to avoid full reload
  await page.getByRole('button', { name: 'Create New Page' }).click();
  // Wait for the editor form to be ready by checking the Title input via placeholder
  await expect(page.getByPlaceholder('Page title...')).toBeVisible();
  await page.getByPlaceholder('Page title...').fill('E2E 401 Redirect Test');
  // The block editor starts empty; add a paragraph block and enter content
  await page.getByRole('button', { name: '단락' }).click();
  await page.getByPlaceholder('단락을 입력하세요...').fill('Body');

  // Simulate token expiration/missing by removing it before submitting
  await page.evaluate(() => localStorage.removeItem('token'));

  // Trigger the write request (should get 401 and client wrapper will redirect)
  await page.getByRole('button', { name: 'Create Page' }).click();

  // Expect redirect to login with return path
  await expect(page).toHaveURL(/\/login\?redirect=.*/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});
