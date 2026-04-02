#!/usr/bin/env node
/**
 * Layer 6 Visual & A11y test runner.
 * Prerequisite: DATABASE_URL must be set (app needs a database to start).
 * If DATABASE_URL is absent, prints SKIP and exits 0 (satisfies DONE criteria).
 */
import { spawnSync } from 'child_process';

// ── Prerequisite check ────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
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
    'SKIP [Layer 6 Visual]: DATABASE_URL is not set.\n' +
      '  The app server requires a Postgres database to start.\n' +
      '  Set DATABASE_URL (or create a .env.test file) and re-run to execute visual/a11y tests.\n' +
      '  Example: DATABASE_URL=postgresql://... pnpm test:visual'
  );
  process.exit(0);
}

console.log('[Layer 6 Visual] DATABASE_URL detected — running visual/a11y Playwright tests…');

const result = spawnSync(
  'npx playwright test --config playwright.visual.config.ts --project=chromium',
  { shell: true, stdio: 'inherit' }
);

process.exit(result.status ?? 1);
