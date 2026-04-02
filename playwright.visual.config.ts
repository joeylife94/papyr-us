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
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
