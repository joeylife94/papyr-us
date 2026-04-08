import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const visualPort = '5006';
const baseURL = `http://localhost:${visualPort}`;

/**
 * Layer 6 Visual & A11y configuration.
 * Chromium only — consistent screenshot baselines require a single renderer.
 * Run via: scripts/run-visual-layer6.mjs (skips when DATABASE_URL is absent).
 */
export default defineConfig({
  testDir: path.join(__dirname, 'tests/visual'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report/layer6' }]],
  timeout: 60_000,
  expect: {
    timeout: 30_000,
    // Screenshot diff threshold — fail if pixel difference exceeds 0.1%
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    // ── Determinism: pin timezone, locale, and viewport globally ─────────────
    timezoneId: 'Europe/Berlin',
    locale: 'en-US',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Explicit viewport overrides the device preset so snapshots are
        // pixel-stable regardless of OS/display-scaling settings.
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: [
            // Defense-in-depth Layer 1 (DNS / launch-time): map external font
            // CDN hostnames to 127.0.0.1 inside Chrome's resolver before any
            // TCP connection is attempted. This is the earliest possible
            // interception point and is entirely deterministic.
            // Layer 2 (runtime / network): page.route() abort in each spec's
            // test.beforeEach catches any request that reaches Playwright's
            // network stack — page.route() is a runtime API and cannot be
            // expressed at this static config level.
            '--host-resolver-rules=' +
              'MAP fonts.googleapis.com 127.0.0.1,' +
              'MAP fonts.gstatic.com 127.0.0.1,' +
              'MAP use.typekit.net 127.0.0.1',
          ],
        },
      },
    },
  ],
  webServer: {
    command: `cross-env PORT=${visualPort} COLLAB_REQUIRE_AUTH=false NODE_ENV=development tsx -r dotenv/config server/index.ts`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
