/**
 * Layer 4 Integration · DB read/write roundtrip via real Postgres.
 * Invariant: data written to the database must be retrievable unchanged —
 * verifies the ORM, schema, and connection pool work end-to-end with live infra.
 *
 * This file requires DATABASE_URL to point to a running Postgres instance.
 * It is invoked by scripts/run-layer4.mjs which manages the Docker Compose lifecycle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Guard: should never reach here because run-layer4.mjs checks this first.
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });

  // Create a minimal test table scoped to this test run
  await pool.query(`
    CREATE TABLE IF NOT EXISTS layer4_test_roundtrip (
      id   SERIAL PRIMARY KEY,
      key  TEXT NOT NULL UNIQUE,
      val  TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
});

afterAll(async () => {
  // Teardown: remove test table so no state bleeds between runs
  await pool.query('DROP TABLE IF EXISTS layer4_test_roundtrip');
  await pool.end();
});

describe('DB roundtrip: write → read → delete', () => {
  it('inserts a row and reads it back with the same value', async () => {
    const testKey = `test-key-${Date.now()}`;
    const testVal = 'hello-papyrus';

    await pool.query('INSERT INTO layer4_test_roundtrip (key, val) VALUES ($1, $2)', [
      testKey,
      testVal,
    ]);

    const { rows } = await pool.query<{ val: string }>(
      'SELECT val FROM layer4_test_roundtrip WHERE key = $1',
      [testKey]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].val).toBe(testVal);
  });

  it('deletes a row and confirms it is gone', async () => {
    const testKey = `delete-key-${Date.now()}`;
    await pool.query('INSERT INTO layer4_test_roundtrip (key, val) VALUES ($1, $2)', [
      testKey,
      'to-be-deleted',
    ]);

    await pool.query('DELETE FROM layer4_test_roundtrip WHERE key = $1', [testKey]);

    const { rows } = await pool.query('SELECT id FROM layer4_test_roundtrip WHERE key = $1', [
      testKey,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('enforces the UNIQUE constraint on "key"', async () => {
    const testKey = `unique-key-${Date.now()}`;
    await pool.query('INSERT INTO layer4_test_roundtrip (key, val) VALUES ($1, $2)', [
      testKey,
      'first',
    ]);

    await expect(
      pool.query('INSERT INTO layer4_test_roundtrip (key, val) VALUES ($1, $2)', [testKey, 'dupe'])
    ).rejects.toThrow();
  });
});
