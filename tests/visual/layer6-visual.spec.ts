/**
 * Layer 6 Visual & A11y · Screenshot baselines + axe-core accessibility scan.
 * Invariant 1 (visual): pixel diff between baseline and current render must be < 0.1%.
 * Invariant 2 (a11y):   zero critical axe violations on all covered pages.
 *
 * Snapshot naming — follows P0 artifact convention (block2-3-prep-plan.md §3-1):
 *   <scenarioId>/01-initial.png  — page in initial (pre-interaction) state
 *   <scenarioId>/02-action.png   — page after user interaction (form filled, etc.)
 *   <scenarioId>/03-result.png   — page after final action result
 *
 * Baselines live in tests/visual/layer6-visual.spec.ts-snapshots/ and are generated
 * only through the pinned Playwright Linux container (`npm run test:visual:update`).
 *
 * Font-blocking defense-in-depth
 * ─ Layer 1 (config / launch): --host-resolver-rules in playwright.visual.config.ts maps
 *   fonts.googleapis.com / fonts.gstatic.com to 127.0.0.1 at the Chromium DNS layer,
 *   preventing TCP connections from being established.
 * ─ Layer 2 (runtime / network): page.route() below intercepts any request that
 *   reaches Playwright's network stack and aborts it before it leaves the process.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function waitForLoginView(page: Page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login with Email' })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

// ─── Global font-CDN block (applies to every test in this file) ──────────────
test.beforeEach(async ({ page }) => {
  await page.route(
    (url) =>
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com' ||
      url.hostname === 'use.typekit.net',
    (route) => route.abort()
  );
});

// ─── Login page ───────────────────────────────────────────────────────────────

test.describe('Layer 6 Visual + A11y: login / homepage', () => {
  test('login page: 01-initial — empty form matches baseline (< 0.1% diff)', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await waitForLoginView(page);

    await expect(page).toHaveScreenshot(['s6-login', '01-initial.png'], {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('login page: 02-action — form filled state matches baseline (< 0.1% diff)', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await waitForLoginView(page);

    const email = page.getByLabel('Email');
    const password = page.getByLabel('Password');
    await email.fill('visual-test@example.com');
    await password.fill('VisualTestPass1!');
    await expect(email).toHaveValue('visual-test@example.com');
    await expect(password).toHaveValue('VisualTestPass1!');

    await expect(page).toHaveScreenshot(['s6-login', '02-action.png'], {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('login page: 03-result — post-submit feedback matches baseline (< 0.1% diff)', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await waitForLoginView(page);

    await page.getByLabel('Email').fill('visual-test-invalid@example.com');
    await page.getByLabel('Password').fill('WrongPass!');

    const loginResponse = page.waitForResponse((response) =>
      response.url().includes('/api/auth/login')
    );
    await page.getByRole('button', { name: 'Login with Email' }).click();
    await loginResponse;
    await expect(page.getByText('Login Failed', { exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot(['s6-login', '03-result.png'], {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('login page has zero critical axe accessibility violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await waitForLoginView(page);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const criticalViolations = results.violations.filter((violation) => violation.impact === 'critical');

    expect(
      criticalViolations,
      `Critical a11y violations: ${JSON.stringify(criticalViolations.map((violation) => violation.id))}`
    ).toHaveLength(0);
  });
});

// ─── Root / main action page ──────────────────────────────────────────────────

test.describe('Layer 6 Visual + A11y: root page', () => {
  test('root page: 01-initial — page load matches baseline (< 0.1% diff)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForLoginView(page);

    await expect(page).toHaveScreenshot(['s6-root', '01-initial.png'], {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('root page: 02-action — after login redirect, login form matches baseline', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForLoginView(page);

    await expect(page).toHaveScreenshot(['s6-root', '02-action.png'], {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('root page: 03-result — stable settled state matches baseline', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForLoginView(page);

    await expect(page).toHaveScreenshot(['s6-root', '03-result.png'], {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('root page has zero critical axe accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForLoginView(page);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const criticalViolations = results.violations.filter((violation) => violation.impact === 'critical');

    expect(
      criticalViolations,
      `Critical a11y violations: ${JSON.stringify(criticalViolations.map((violation) => violation.id))}`
    ).toHaveLength(0);
  });
});
