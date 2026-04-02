/**
 * Layer 6 Visual & A11y · Screenshot baselines + axe-core accessibility scan.
 * Invariant 1 (visual): pixel diff between baseline and current render must be < 0.1%.
 * Invariant 2 (a11y):   zero critical axe violations on all covered pages.
 *
 * First run: baselines are CREATED in tests/visual/__snapshots__.
 * Subsequent runs: new screenshots are COMPARED against baselines; failures signal unintended
 * visual regressions.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ─── Homepage / login page ────────────────────────────────────────────────────

test.describe('Layer 6 Visual + A11y: login / homepage', () => {
  test('login page screenshot matches baseline (< 0.1% diff)', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Give any animations a moment to settle before capturing the baseline
    await page.waitForTimeout(500);

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
    await page.waitForTimeout(500);

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
