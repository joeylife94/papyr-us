/**
 * Layer 6 Visual & A11y · Screenshot baselines + axe-core accessibility scan.
 * Invariant 1 (visual): pixel diff between baseline and current render must be < 0.1%.
 * Invariant 2 (a11y):   zero critical axe violations on all covered pages.
 *
 * First run: baselines are CREATED in tests/visual/__snapshots__.
 * Subsequent runs: new screenshots are COMPARED against baselines; failures signal unintended
 * visual regressions.
 *
 * Font-blocking defense-in-depth
 * ─ Layer 1 (config / launch): --host-resolver-rules in playwright.visual.config.ts maps
 *   fonts.googleapis.com / fonts.gstatic.com to 127.0.0.1 at the Chromium DNS layer,
 *   preventing TCP connections from being established.
 * ─ Layer 2 (runtime / network): page.route() below intercepts any request that
 *   reaches Playwright's network stack and aborts it before it leaves the process.
 *   page.route() is a runtime API; it cannot be expressed in the static config file.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ─── Global font-CDN block (applies to every test in this file) ──────────────
// Defense-in-depth layer 2: abort any external font requests that bypass the
// DNS-level --host-resolver-rules configured in playwright.visual.config.ts.
test.beforeEach(async ({ page }) => {
  await page.route(
    (url) =>
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com' ||
      url.hostname === 'use.typekit.net',
    (route) => route.abort()
  );
});

// ─── Homepage / login page ────────────────────────────────────────────────────

test.describe('Layer 6 Visual + A11y: login / homepage', () => {
  test('login page screenshot matches baseline (< 0.1% diff)', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Wait until the browser's FontFaceSet reports all fonts are loaded and
    // rendered. This is deterministic: it resolves when the UA is done, not
    // after an arbitrary fixed delay.
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('login page has zero critical axe accessibility violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    const criticalViolations = results.violations.filter((v) => v.impact === 'critical');
    expect(
      criticalViolations,
      `Critical a11y violations: ${JSON.stringify(criticalViolations.map((v) => v.id))}`
    ).toHaveLength(0);
  });
});

// ─── Root / main action page ──────────────────────────────────────────────────

test.describe('Layer 6 Visual + A11y: root page', () => {
  test('root page screenshot matches baseline (< 0.1% diff)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('root-page.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('root page has zero critical axe accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    const criticalViolations = results.violations.filter((v) => v.impact === 'critical');
    expect(
      criticalViolations,
      `Critical a11y violations: ${JSON.stringify(criticalViolations.map((v) => v.id))}`
    ).toHaveLength(0);
  });
});
