/**
 * Layer 4: platform admin checks against real Postgres (issue #124 X0).
 *
 * A platform admin is an active `users` row whose current email is listed in ADMIN_EMAILS.
 * DBStorage.getUserAccount reads that row, and isPlatformAdmin decides from it rather than from
 * whatever a token claims, so a changed email or a deactivated account loses admin at once.
 *
 * The table lives in its own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'platform_admin_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let scoped: Pool;
let storage: any;
let isPlatformAdmin: (store: any, user: { id?: unknown } | undefined) => Promise<boolean>;
const ids: Record<'owner' | 'member' | 'former', number> = { owner: 0, member: 0, former: 0 };

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  // `users` as shared/schema.ts defines it.
  await scoped.query(`
    CREATE TABLE users (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(255) NOT NULL,
      email           VARCHAR(255) NOT NULL UNIQUE,
      hashed_password TEXT,
      provider        VARCHAR(50),
      provider_id     VARCHAR(255),
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
  const insert = async (name: string, email: string, isActive = true) =>
    (
      await scoped.query(
        `INSERT INTO users (name, email, is_active) VALUES ($1, $2, $3) RETURNING id`,
        [name, email, isActive]
      )
    ).rows[0].id as number;
  ids.owner = await insert('Owner', 'Owner@Example.com');
  ids.member = await insert('Member', 'member@example.com');
  ids.former = await insert('Former', 'former@example.com', false);

  process.env.DATABASE_URL = scopedUrl;
  process.env.ADMIN_EMAILS = 'owner@example.com, former@example.com';
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
  ({ isPlatformAdmin } = await import('../../server/middleware.js'));
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('platform admin (real Postgres)', () => {
  it('getUserAccount returns id, email and active flag, or nothing for an unknown id', async () => {
    expect(await storage.getUserAccount(ids.owner)).toEqual({
      id: ids.owner,
      email: 'Owner@Example.com',
      isActive: true,
    });
    expect(await storage.getUserAccount(ids.former)).toMatchObject({ isActive: false });
    expect(await storage.getUserAccount(999_999)).toBeUndefined();
  });

  it('grants admin only to an active account whose stored email is listed', async () => {
    expect(await isPlatformAdmin(storage, { id: ids.owner })).toBe(true);
    expect(await isPlatformAdmin(storage, { id: String(ids.owner) })).toBe(true);
    expect(await isPlatformAdmin(storage, { id: ids.member })).toBe(false);
    // Listed, but deactivated.
    expect(await isPlatformAdmin(storage, { id: ids.former })).toBe(false);
    expect(await isPlatformAdmin(storage, { id: 999_999 })).toBe(false);
    expect(await isPlatformAdmin(storage, {})).toBe(false);
    expect(await isPlatformAdmin(storage, undefined)).toBe(false);
  });

  it('follows the stored row: a changed email or deactivation takes effect on the next check', async () => {
    await scoped.query(`UPDATE users SET email = 'owner-renamed@example.com' WHERE id = $1`, [
      ids.owner,
    ]);
    expect(await isPlatformAdmin(storage, { id: ids.owner })).toBe(false);

    await scoped.query(
      `UPDATE users SET email = 'owner@example.com', is_active = false WHERE id = $1`,
      [ids.owner]
    );
    expect(await isPlatformAdmin(storage, { id: ids.owner })).toBe(false);

    await scoped.query(`UPDATE users SET is_active = true WHERE id = $1`, [ids.owner]);
    expect(await isPlatformAdmin(storage, { id: ids.owner })).toBe(true);
  });
});
