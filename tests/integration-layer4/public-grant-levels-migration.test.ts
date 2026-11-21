/**
 * Layer 4: migration 0030 (WP4), the report on public grant levels, against real Postgres.
 *
 * - It changes no data: every page_permissions row is the same after it, on every run.
 * - It raises one notice that starts with "0030 " and says how many public grants above
 *   commenter (editor or owner) exist; user and team grants of any level and public grants at
 *   viewer or commenter are not counted.
 * - It runs without the table, and the down file does nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_wp4_migration';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const file = (name: string) =>
  readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), 'utf8');
const UP = file('0030_report_public_grant_levels.sql');
const DOWN = file('0030_report_public_grant_levels.down.sql');

let admin: Pool;
let scoped: Pool;

/** Runs a file on one connection and returns the notices it raised. */
async function run(sqlText: string): Promise<string[]> {
  const client = await scoped.connect();
  const notices: string[] = [];
  client.on('notice', (notice) => notices.push(notice.message));
  try {
    await client.query(sqlText);
  } finally {
    client.release();
  }
  return notices;
}

const rows = async () =>
  (await scoped.query(`SELECT * FROM page_permissions ORDER BY id`)).rows as Array<
    Record<string, unknown>
  >;

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
});

afterAll(async () => {
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('0030 public grant levels', () => {
  it('says nothing is above commenter when the table is not there, and changes nothing', async () => {
    const notices = await run(UP);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/^0030 /);
    expect(notices[0]).toContain(' 0 above commenter');
  });

  it('counts public grants stored as editor or owner, leaves every row as it was, and says so on every run', async () => {
    await scoped.query(`
      CREATE TABLE page_permissions (
        id SERIAL PRIMARY KEY, page_id INTEGER NOT NULL, entity_type TEXT NOT NULL,
        entity_id INTEGER, permission TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT '2026-01-01'
      );
      INSERT INTO page_permissions (page_id, entity_type, entity_id, permission) VALUES
        (1, 'public', NULL, 'viewer'),
        (2, 'public', NULL, 'commenter'),
        (3, 'public', NULL, 'editor'),
        (4, 'public', NULL, 'owner'),
        (5, 'public', NULL, 'owner'),
        (6, 'user', 7, 'owner'),
        (7, 'team', 8, 'editor');
    `);
    const before = await rows();
    for (let run_ = 0; run_ < 2; run_++) {
      const notices = await run(UP);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatch(/^0030 public grants: 3 above commenter/);
      expect(notices[0]).toContain('honoured as viewer');
    }
    expect(await rows()).toEqual(before);
  });

  it('the down file does nothing', async () => {
    const before = await rows();
    expect(await run(DOWN)).toEqual([]);
    expect(await rows()).toEqual(before);
  });
});
