import { chromium, FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-safe dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function globalSetup(config: FullConfig) {
  const storagePath = process.env.STORAGE_STATE_PATH || path.join(__dirname, 'storageState.json');

  const baseURL = process.env.BASE_URL || 'http://localhost:5003';
  const e2eEmail = process.env.E2E_EMAIL || 'test@example.com';
  const e2ePassword = process.env.E2E_PASSWORD || 'password123';
  const forceRegen = process.env.E2E_FORCE_REGENERATE === '1';

  // Helper: read auth cookies from an existing storage state file
  const readCookiesFromStorage = (p: string): Array<{ name: string; value: string }> => {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const j = JSON.parse(raw);
      const cookies = Array.isArray(j.cookies) ? j.cookies : [];
      return cookies.filter(
        (cookie: any) => cookie && (cookie.name === 'accessToken' || cookie.name === 'refreshToken')
      );
    } catch {
      return [];
    }
  };

  // If storage state exists, optionally validate token before reuse
  if (fs.existsSync(storagePath) && !forceRegen) {
    console.log(`Found existing storage state at ${storagePath}, validating...`);
    const cookies = readCookiesFromStorage(storagePath);
    if (cookies.length > 0) {
      try {
        const { request } = await import('@playwright/test');
        const req = await request.newContext({
          baseURL,
          storageState: storagePath,
        });
        const me = await req.get('/api/auth/me');
        if (me.ok()) {
          console.log('Existing storageState token is valid; reusing', storagePath);
          await req.dispose();
          return;
        }
        console.warn(
          'Existing storageState token invalid (API /api/auth/me failed), will regenerate.'
        );
        await req.dispose();
      } catch (e) {
        console.warn('Error validating existing storageState, will regenerate:', e);
      }
    } else {
      console.log('No auth cookies found inside existing storageState; will regenerate.');
    }
  }

  // At this point we need to (re)generate storageState
  try {
    const { request } = await import('@playwright/test');
    const requestContext = await request.newContext({ baseURL });

    // Try API login first
    let resp = await requestContext.post('/api/auth/login', {
      data: { email: e2eEmail, password: e2ePassword },
    });

    // If login failed, attempt to register (idempotent if user exists)
    if (resp.status() !== 200) {
      console.log(
        'API login did not return 200; attempting register -> login flow. Status:',
        resp.status()
      );
      // Try register
      const reg = await requestContext
        .post('/api/auth/register', {
          data: { name: 'E2E Test User', email: e2eEmail, password: e2ePassword },
        })
        .catch(() => null);
      if (reg && (reg.status() === 201 || reg.status() === 409)) {
        // either created or already exists
        console.log('Register attempt completed with status', reg.status());
      } else if (reg) {
        console.warn('Register returned unexpected status', reg.status());
      }
      // Retry login
      resp = await requestContext.post('/api/auth/login', {
        data: { email: e2eEmail, password: e2ePassword },
      });
    }

    if (resp.status() !== 200) {
      console.warn('API login during global-setup failed; falling back to UI login');
      // Fallback to UI method to create storageState
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
      await requestContext.dispose();
      return;
    }

    await requestContext.storageState({ path: storagePath });
    console.log('Saved storage state to', storagePath);
    await requestContext.dispose();
  } catch (err) {
    console.error('global-setup failed:', err);
    throw err;
  }
}

export default globalSetup;
