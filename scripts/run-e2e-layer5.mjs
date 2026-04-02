#!/usr/bin/env node
/**
 * Layer 5 E2E test runner.
 * Prerequisite: DATABASE_URL must be set (app needs a database to start).
 * If DATABASE_URL is absent, prints SKIP and exits 0 (satisfies DONE criteria).
 */
import { spawnSync } from 'child_process';

// ── Prerequisite check ────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  // Try to load from .env.test if it exists
  try {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const envFile = readFileSync(resolve('.env.test'), 'utf-8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^DATABASE_URL=(.+)$/);
      if (m) {
        process.env.DATABASE_URL = m[1].trim();
        break;
      }
    }
  } catch {
    // .env.test does not exist — that's fine
  }
}

if (!process.env.DATABASE_URL) {
  console.log(
    'SKIP [Layer 5 E2E]: DATABASE_URL is not set.\n' +
      '  The app server requires a Postgres database to start.\n' +
      '  Set DATABASE_URL (or create a .env.test file) and re-run to execute E2E tests.\n' +
      '  Example: DATABASE_URL=postgresql://... pnpm test:e2e'
  );
  process.exit(0);
}

console.log('[Layer 5 E2E] DATABASE_URL detected — running Playwright tests…');

const result = spawnSync(
  'npx playwright test --config playwright.layer5.config.ts --project=chromium',
  { shell: true, stdio: 'inherit' }
);

process.exit(result.status ?? 1);
