import { defineConfig } from 'vitest/config';

/**
 * Default vitest config — runs all unit / smoke tests.
 *
 * Test layer boundaries:
 *
 *   UNIT / SMOKE (this config, `npm test`):
 *     - server/**\/*.test.{ts,tsx} EXCEPT exclusions below.
 *     - All test files mock ../storage via vi.mock() — no real DB access.
 *     - DATABASE_URL is explicitly absent (setup.ts deletes it).
 *     - Any accidental DBStorage() call fails immediately with a clear error.
 *
 *   INTEGRATION (`npm run test:integration`, vitest.integration.config.ts):
 *     - server/tests/integration/** — requires a live PostgreSQL database.
 *     - Does NOT use setup.ts; needs a real DATABASE_URL.
 *
 *   E2E (`npm run e2e`, Playwright):
 *     - tests/ (Playwright) — requires a running server + seeded data.
 *
 * Excluded from this run (intentional, not accidental):
 *   - server/tests/integration/**  → require a live PostgreSQL database.
 *                                    Run via: npm run test:integration
 *   - server/tests/search-fts.test.ts → tombstone file, test moved to integration/
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.test.{ts,tsx}'],
    exclude: ['server/tests/integration/**', 'server/tests/search-fts.test.ts'],
    setupFiles: './server/tests/setup.ts',
  },
});
