import { chromium } from 'playwright';
import { request as pwRequest } from '@playwright/test';

(async function () {
  const baseURL = process.env.BASE_URL || 'http://localhost:5003';
  const email = process.env.DEBUG_EMAIL || `debug-${Date.now()}@example.com`;
  const pass = process.env.DEBUG_PASSWORD || 'password123';

  console.log('DEBUG login script starting', { baseURL, email });

  // Use Playwright request to create/register user via API
  try {
    const req = await pwRequest.newContext({ baseURL });
    const reg = await req.post('/api/auth/register', {
      data: { name: 'Debug User', email, password: pass },
    });
    console.log('API register status', reg.status());
    // ignore body
    await req.dispose();
  } catch (e) {
    console.warn('Register failed', e);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => console.log('PAGE LOG>', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR>', err.message));
  page.on('requestfailed', (req) => console.log('REQ FAILED>', req.url(), req.failure()));

  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pass);

  const loginRespPromise = page.waitForResponse((r) => r.url().includes('/api/auth/login'));
  await page.getByRole('button', { name: 'Login with Email' }).click();
  const loginResp = await loginRespPromise;
  console.log('login response status:', loginResp.status());
  try {
    const body = await loginResp.json();
    console.log('login response body keys:', Object.keys(body));
  } catch (e) {
    console.log('login response has no json body');
  }

  // small pause to allow client-side handlers to run
  await page.waitForTimeout(1000);

  const token = await page.evaluate(() => localStorage.getItem('token'));
  console.log('localStorage token present:', !!token);
  if (token) console.log('token (prefix):', token.slice(0, 40) + '...');

  console.log('page url after login:', page.url());

  // test /api/auth/me via page context
  const me = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    if (!t) return { ok: false, status: 'no-token' };
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${t}` } });
      const s = r.status;
      const b = await r.json().catch(() => null);
      return { status: s, body: b };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  console.log('fetch /api/auth/me result:', me);

  await browser.close();
  process.exit(0);
})();
