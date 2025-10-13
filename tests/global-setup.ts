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

  const baseURL = process.env.BASE_URL || 'http://localhost:5003';
  const e2eEmail = process.env.E2E_EMAIL || 'test@example.com';
  const e2ePassword = process.env.E2E_PASSWORD || 'password123';

  try {
    // Use Playwright API request to perform login and get token
    const requestContext = await (await import('@playwright/test')).request.newContext({ baseURL });
    const resp = await requestContext.post('/api/auth/login', {
      data: { email: e2eEmail, password: e2ePassword },
    });
    if (resp.status() !== 200) {
      console.warn('API login did not return 200, status:', resp.status());
    }
    const body = await resp.json().catch(() => ({}));
    const token = body.token;

    if (!token) {
      console.warn(
        'No token returned from API login during global-setup; falling back to UI login'
      );
      // Fallback to old UI method
      const browser = await chromium.launch();
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });
      await page.getByLabel('Email').fill(e2eEmail);
      await page.getByLabel('Password').fill(e2ePassword);
      await page.getByRole('button', { name: 'Login with Email' }).click();
      await page.waitForURL(`${baseURL}/`, { timeout: 20000 }).catch(() => {});
      await context.storageState({ path: storagePath });
      await browser.close();
      return;
    }

    // Create a browser context and set the token in localStorage before any page loads
    const browser = await chromium.launch();
    const context = await browser.newContext();
    // Add init script to set token in localStorage for all pages
    await context.addInitScript((t) => {
      // eslint-disable-next-line no-undef
      localStorage.setItem('token', t);
    }, token);
    // Create a page to ensure storage is initialized
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    // Save storage state for tests
    await context.storageState({ path: storagePath });
    console.log('Saved storage state to', storagePath);
    await browser.close();
  } catch (err) {
    console.error('global-setup failed:', err);
    throw err;
  }
}

export default globalSetup;
