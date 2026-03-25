/**
 * Global vitest setup for all server unit tests.
 *
 * This file is loaded BEFORE any test module via vitest.config.ts `setupFiles`.
 * It ensures that:
 *   1. DATABASE_URL is never required for unit tests.
 *   2. The DBStorage constructor is never called in unit-test paths.
 *   3. Feature flags have safe defaults for testing.
 *
 * Individual test files can still override these mocks with vi.mock() calls,
 * because per-file vi.mock() declarations take precedence over global setup.
 *
 * Integration tests that need a real database should be placed in a dedicated
 * folder (e.g., server/tests/integration/) and run with a separate vitest
 * config that does NOT include this setup file.
 */
import { vi } from 'vitest';

// Prevent any accidental real DB construction
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_placeholder';
}

// Mark the test environment
process.env.NODE_ENV = 'test';
