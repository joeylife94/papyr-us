import { chromium, FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalSetup(config: FullConfig) {
  const storagePath = process.env.STORAGE_STATE_PATH || path.join(__dirname, 'storageState.json');

  // If storage state already exists, skip creation
  if (fs.existsSync(storagePath)) {
    console.log(`Using existing storage state at ${storagePath}`);
    return;
  }

  const baseURL = process.env.BASE_URL || 'http://localhost:5001';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Global API setup: requesting token from', `${baseURL}/api/auth/login`);

    // Use Playwright's request available on page to call backend API
    const resp = await page.request.post(`${baseURL}/api/auth/login`, {
      data: { email: adminEmail, password: adminPassword },
      headers: { 'Content-Type': 'application/json' },
    });

    if (!resp.ok()) {
      throw new Error(`Login API failed: ${resp.status()} ${resp.statusText()}`);
    }

    const body = await resp.json();
    const token = body.token || body.accessToken || null;

    if (!token) {
      throw new Error('Login response did not include a token');
    }

    // Persist token in localStorage so client-side auth picks it up
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.evaluate((t) => {
      localStorage.setItem('token', t);
    }, token);

    // Optionally, hit /api/auth/me to warm server-side caches
    await page.request
      .get(`${baseURL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .catch(() => {});

    // Save storage state including localStorage and cookies
    await context.storageState({ path: storagePath });
    console.log('Saved storage state to', storagePath);
  } catch (err) {
    console.warn('Global API setup failed:', err);
    try {
      const dumpPath = path.join(__dirname, 'global-setup-api-failure.png');
      await page.screenshot({ path: dumpPath }).catch(() => {});
      console.warn('Wrote diagnostic screenshot to', dumpPath);
    } catch (e) {
      // ignore
    }
    throw err;
  } finally {
    await browser.close();
  }
}
