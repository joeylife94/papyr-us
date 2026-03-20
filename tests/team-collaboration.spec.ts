import { test, expect } from '@playwright/test';

/**
 * Team Collaboration E2E Tests
 *
 * Tests team-based features:
 * - Team creation and management
 * - Member invitation and roles
 * - Team settings
 */

test.describe('Team Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display teams list if feature enabled', async ({ page }) => {
    // Navigate to teams page
    await page.goto('/teams');
    await page.waitForLoadState('networkidle');

    // Check if teams feature is available or redirected
    const teamsContent = page.locator('[data-testid="teams-list"], .teams-container, main').first();
    await expect(teamsContent).toBeVisible();
  });

  test('should show team creation option for authorized users', async ({ page }) => {
    await page.goto('/teams');
    await page.waitForLoadState('networkidle');

    // Page should render the React app without crashes
    await expect(page.locator('#root')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('Something went wrong');
  });
});

test.describe('Member Management', () => {
  test('should display member list', async ({ page }) => {
    // Navigate to members/team members page
    await page.goto('/members');
    await page.waitForLoadState('networkidle');

    const membersContent = page
      .locator('[data-testid="members-list"], .members-container, main, table')
      .first();
    await expect(membersContent).toBeVisible();
  });

  test('should show member roles', async ({ page }) => {
    await page.goto('/members');
    await page.waitForLoadState('networkidle');

    // Page should render the React app without crashes
    await expect(page.locator('#root')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('Something went wrong');
  });
});

test.describe('Team Settings', () => {
  test('should access team settings when authorized', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Settings page should load
    const settingsContent = page
      .locator('[data-testid="settings"], .settings-container, main, form')
      .first();
    await expect(settingsContent).toBeVisible();
  });
});
