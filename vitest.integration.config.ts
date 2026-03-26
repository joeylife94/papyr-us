import { defineConfig } from 'vitest/config';

/**
 * Integration test config — runs DB-backed tests ONLY.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@host/db npm run test:integration
 *
 * Requirements:
 *   - A live PostgreSQL database must be accessible via DATABASE_URL.
 *   - Tests will skip automatically when DATABASE_URL is absent.
 *
 * What runs here:
 *   - server/tests/integration/ (all .test.ts files) — requires live Postgres.
 *
 * What does NOT run here:
 *   - Unit/smoke tests — use `npm test` (vitest.config.ts) instead.
 *   - Playwright E2E tests — use `npm run e2e` instead.
 *
 * This config intentionally omits server/tests/setup.ts as a setupFile.
 * Integration tests manage their own DB credentials via process.env.DATABASE_URL.
 * No placeholder injection is used — a real DATABASE_URL is required.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/tests/integration/**/*.test.{ts,tsx}'],
    // No setupFiles — integration tests need a real DATABASE_URL, not placeholder injection.
    // Tests will skip automatically when DATABASE_URL is absent.
  },
});
