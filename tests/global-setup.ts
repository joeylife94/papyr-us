import { chromium, FullConfig } from '@playwright/test';
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
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  try {
    console.log('Global setup: navigating to', `${baseURL}/login`);
    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });

    // Use concrete IDs from the app's login form for reliability
    // If your app uses different ids/data-testids change these to match.
    const emailSelector = '#email';
    const passwordSelector = '#password';
    const submitSelector = 'button[type="submit"]';

    // Ensure inputs are present
    await page.waitForSelector(emailSelector, { timeout: 5000 });
    await page.waitForSelector(passwordSelector, { timeout: 5000 });

    await page.fill(emailSelector, adminEmail);
    await page.fill(passwordSelector, adminPassword);

    // Click and wait for navigation triggered by the client code
    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
      page.click(submitSelector),
    ]);

    // As a fallback, wait a short time for client-side routing to settle
    await page.waitForTimeout(500);

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
