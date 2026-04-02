import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const e2ePort = '5005';
const baseURL = `http://localhost:${e2ePort}`;

/**
 * Layer 5 E2E configuration — critical happy-path user flows only.
 * Uses chromium only for speed; CI runs via scripts/run-e2e-layer5.mjs which
 * skips gracefully when DATABASE_URL is not set.
 */
export default defineConfig({
  testDir: path.join(__dirname, 'tests/layer5'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report/layer5' }]],
  timeout: 60_000,
  expect: { timeout: 30_000 },
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
    command: `cross-env PORT=${e2ePort} COLLAB_REQUIRE_AUTH=false NODE_ENV=development tsx -r dotenv/config server/index.ts`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
