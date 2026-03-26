/**
 * Storage Boundary Proof Tests
 *
 * These tests prove that the ordinary unit test suite is structurally isolated
 * from real database access. They run in the default Vitest suite (inside setup.ts
 * scope) and serve as a regression guard for P1: test reproducibility.
 *
 * What they prove:
 *   A. DATABASE_URL is absent during unit test execution (setup.ts deleted it,
 *      not injected a placeholder). Any accidental DBStorage() call fails fast.
 *   B. The storage module exports `undefined` as a sentinel — it does NOT
 *      auto-construct a DBStorage instance on import. This means importing the
 *      module in a unit test will never trigger a DB connection attempt.
 *   C. DBStorage construction without DATABASE_URL throws immediately with a
 *      clear, actionable error message rather than a connection-time timeout.
 */

import { describe, it, expect, vi } from 'vitest';

describe('P1 storage boundary proofs', () => {
  it('A: DATABASE_URL is absent in the unit test environment', () => {
    // setup.ts deletes DATABASE_URL instead of injecting a placeholder string.
    // This is the direct structural proof of P1 fix: any test that accidentally
    // reaches DBStorage() will fail immediately, not silently proceed with a fake URL.
    expect(process.env.DATABASE_URL).toBeUndefined();
  });

  it('B: storage module exports undefined sentinel (no auto-construction on import)', async () => {
    // The real storage.ts exports `storage = undefined as unknown as DBStorage`.
    // This proves the module does NOT call new DBStorage() during module load.
    // vi.resetModules() bypasses any cached mock to verify the real export value.
    vi.resetModules();
    const mod = await import('../../storage.js');
    // Real module-level `storage` export is the undefined sentinel.
    // This is safe to import without DATABASE_URL because no constructor runs.
    expect(mod.storage).toBeUndefined();
    // Restore module system so subsequent tests use mocked version
    vi.resetModules();
  });

  it('C: DBStorage constructor throws immediately without DATABASE_URL', async () => {
    // Confirm that when any test accidentally reaches DBStorage() without mocking,
    // the failure mode is a clear, immediate error — not a silent network timeout.
    vi.resetModules();
    const { DBStorage } = await import('../../storage.js');
    expect(() => new DBStorage()).toThrow('DATABASE_URL is required');
    vi.resetModules();
  });
});
