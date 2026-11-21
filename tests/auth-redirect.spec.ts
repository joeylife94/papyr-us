import { test, expect } from '@playwright/test';
import { registerTestUser } from './e2e-helpers';

/**
 * Verify that when a write action is attempted without a valid token,
 * the client removes token and navigates to /login with redirect param.
 */
test('401 -> redirects to /login with redirect param when accessing protected route', async ({
  page,
  request,
}) => {
  // A registered account exists, but this browser context never signs in.
  await registerTestUser(request, 'e2e-401');
  await page.context().clearCookies();
  // Ensure logged-out state AND disable the E2E ProtectedRoute bypass
  // (server injects __PLAYWRIGHT__=true via vite.ts when NODE_ENV=test)
  await page.addInitScript(() => {
    // Prevent the server-injected script from setting __PLAYWRIGHT__
    Object.defineProperty(window, '__PLAYWRIGHT__', {
      value: false,
      writable: false,
      configurable: true,
    });
    Object.defineProperty(window, '__E2E_BYPASS_PROTECTED__', {
      value: false,
      writable: false,
      configurable: true,
    });
  });
  // Access a protected route
  await page.goto('/create');
  // ProtectedRoute redirects to /login with ?redirect= param preserving the original URL
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('401 write -> redirects to /login with redirect param when posting /api/pages while logged out', async ({
  page,
}) => {
  // Ensure fully logged-out before navigating
  await page.context().clearCookies();

  // Navigate to a known page and capture the pathname to assert redirect param
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const currentPath = new URL(page.url()).pathname; // e.g. '/'
  const encoded = encodeURIComponent(currentPath);

  // Trigger a write via client fetch without awaiting it (navigation will occur on 401)
  try {
    // Use page.route to reliably intercept the POST even if navigation happens.
    let sawPost = false;
    const postSeen = new Promise<void>((resolve) => {
      // route will be attached; we'll unroute in finally to avoid leaking into other tests
      page.route('**/api/pages', async (route, request) => {
        if (request.method() === 'POST') {
          sawPost = true;
          resolve();
        }
        try {
          await route.continue();
        } catch (e) {
          // ignore if route continuation fails due to navigation
        }
      });
    });

    try {
      await page.evaluate(() => {
        // start a fire-and-forget fetch from the page context immediately
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)
          .fetch('/api/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 't', content: 'c' }),
          })
          .catch(() => {
            // ignore network/navigation errors
          });
      });

      // Wait up to 5s for the route to observe the POST. If not seen, fail the test explicitly.
      const timeoutMs = 5000;
      const saw = await Promise.race([
        postSeen.then(() => true),
        (async () => {
          await page.waitForTimeout(timeoutMs);
          return false;
        })(),
      ]);

      if (!saw) {
        // Give a clearer failure message: either the fetch never fired or navigation aborted it before the router could observe.
        throw new Error(
          `POST to /api/pages was not observed within ${timeoutMs}ms. This may be due to navigation aborting the request.`
        );
      }
    } finally {
      // ensure we detach the route so later tests are unaffected
      try {
        page.unroute('**/api/pages');
      } catch (e) {
        // ignore if unroute fails for any reason
      }
    }
  } catch (err) {
    // navigation may destroy the execution context; rethrow to surface assertion failures only
    // If the error is our explicit missing-POST error, rethrow. Otherwise ignore navigation-induced evaluate errors.
    if (
      err instanceof Error &&
      err.message &&
      err.message.startsWith('POST to /api/pages was not observed')
    ) {
      throw err;
    }
  }

  // Wait explicitly for the login redirect that includes the encoded current path
  await page.waitForURL(new RegExp(`/login\\?redirect=${encoded}`), { timeout: 10000 });
  await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encoded}`));
});
