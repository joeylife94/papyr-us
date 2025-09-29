import { chromium, FullConfig, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-safe dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function globalSetup(config: FullConfig) {
  const storagePath = process.env.STORAGE_STATE_PATH || path.join(__dirname, 'storageState.json');

  // If storage state already exists, skip creation
  if (fs.existsSync(storagePath)) {
    console.log(`Using existing storage state at ${storagePath}`);
    return;
  }

  // Create a browser, perform login, save storage state
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseURL = process.env.BASE_URL || 'http://localhost:5001';
  // Use dedicated env vars for E2E UI login to avoid clashing with server ADMIN_PASSWORD (admin panel)
  const e2eEmail = process.env.E2E_EMAIL || 'test@example.com';
  const e2ePassword = process.env.E2E_PASSWORD || 'password123';

  try {
    console.log('Global setup: navigating to', `${baseURL}/login`);
    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });

    // Use the same accessible selectors as the tests for stability
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await page.getByLabel('Email').fill(e2eEmail);
    await page.getByLabel('Password').fill(e2ePassword);
    await page.getByRole('button', { name: 'Login with Email' }).click();
    await expect(page).toHaveURL(`${baseURL}/`, { timeout: 15000 });
    // Wait for user avatar initials button to confirm authenticated UI
    await expect(page.getByRole('button', { name: /^[A-Z]{1,3}$/ })).toBeVisible({
      timeout: 30000,
    });

    // Save storage state
    await context.storageState({ path: storagePath });
    console.log('Saved storage state to', storagePath);
  } catch (err) {
    console.warn('Global setup login failed:', err);
    // Attempt to capture a screenshot for diagnostics if possible
    try {
      const dumpPath = path.join(__dirname, 'global-setup-failure.png');
      await page.screenshot({ path: dumpPath }).catch(() => {});
      console.warn('Wrote diagnostic screenshot to', dumpPath);
    } catch (e) {
      // ignore
    }
  } finally {
    await browser.close();
  }
}

export default globalSetup;
