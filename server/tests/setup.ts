/**
 * Global vitest setup for all server unit tests.
 *
 * This file is loaded BEFORE any test module via vitest.config.ts `setupFiles`.
 * It ensures that:
 *   1. DATABASE_URL is absent — unit tests have no database access.
 *   2. Any accidental call to DBStorage() will fail immediately with "DATABASE_URL
 *      is required" rather than silently proceeding with a fake connection string.
 *   3. Feature flags have safe defaults for testing.
 *
 * UNIT vs INTEGRATION boundary:
 *   - Unit tests (this suite): all tests in server/**\/\*.test.ts  EXCEPT:
 *       - server/tests/integration/**  (excluded in vitest.config.ts — needs real Postgres)
 *   - Integration tests: run via `npm run test:integration` using
 *     vitest.integration.config.ts — NO setup.ts, requires a real DATABASE_URL.
 *   - E2E tests: run via `npm run e2e` using Playwright.
 *
 * Individual test files MUST mock ../storage via vi.mock() to prevent any
 * accidental DBStorage construction. This setup explicitly removes DATABASE_URL
 * so accidental construction fails fast with a clear error instead of a
 * silent network timeout.
 *
 * cookie-parser: available in package.json dependencies; import directly in tests
 * that need it (e.g., auth.test.ts, realtime.notifications.socket.test.ts).
 */
import { vi } from 'vitest';

// Explicitly remove DATABASE_URL for ALL unit tests.
// Previously this was set to a placeholder value — that approach was a structural
// crutch: if any test accidentally constructed DBStorage, it would fail with a
// connection error rather than an immediate clear message.
// Now: DATABASE_URL is absent. Any accidental DBStorage() call throws immediately
// with "DATABASE_URL is required", making the failure obvious and fast.
delete (process.env as any).DATABASE_URL;

// Mark the test environment so that config.ts / routes.ts behaviour stays
// in non-production mode throughout all unit tests.
process.env.NODE_ENV = 'test';
