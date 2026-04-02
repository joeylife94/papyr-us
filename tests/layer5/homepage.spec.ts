/**
 * Layer 5 E2E · Critical happy-path user flow.
 * Invariant: the application must be reachable and render a recognisable UI
 * within a reasonable timeout — a broken deploy or startup crash will fail this test.
 *
 * Covers: app reachability → homepage / login page renders.
 * Does NOT test authenticated flows (those belong to the full E2E suite in tests/).
 */
import { test, expect } from '@playwright/test';

test.describe('Layer 5 E2E: Application reachability', () => {
  test('homepage or login page renders without a JS crash', async ({ page }) => {
    // Navigate to root — app may redirect to /login if auth is required
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(500);

    // Wait for the page to settle — either login form or dashboard content
    await page.waitForLoadState('networkidle');

    // The app must render SOMETHING meaningful — not a blank or error page
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(10);
  });

  test('login page is reachable and contains an email input', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Must have an email (or username) field — basic form contract
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
  });

  test('unknown route returns a graceful 404 or redirect, not a 500', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-layer5');
    // Acceptable: 200 (SPA catches all), 301/302 redirect, 404 — never 500
    expect(response?.status()).not.toBe(500);
  });
});
