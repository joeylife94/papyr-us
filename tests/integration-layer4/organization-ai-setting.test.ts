/**
 * Layer 4: the organization AI setting against real Postgres (issue #124 X1c, base package).
 *
 * drizzle/0024_add_organization_ai_setting.sql adds organizations.ai_enabled:
 *   - on an upgraded database (0022 applied) the column is added and every existing
 *     organization, `default` included, gets TRUE: AI stays as it was before the setting;
 *   - running it again changes nothing, an owner's later FALSE is kept;
 *   - an organization inserted afterwards without naming the column gets FALSE;
 *   - on a database without an organizations table (fresh install) it does nothing;
 *   - it applies after 0022 and 0023 in one transaction, as scripts/apply-organizations-schema.mjs
 *     runs them.
 * The down file refuses, and changes nothing, while any organization has AI off; with all on it
 * drops the column, and 0024 applies again afterwards.
 * DBStorage.getOrganizationMembership, isOrganizationAiEnabled and withOrganizationLocks run
 * against the upgraded shape.
 *
 * Every scenario has its own schema, so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const read = (name: string) =>
  readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), 'utf8');
const M0022 = read('0022_add_organizations.sql');
const M0023 = read('0023_add_template_organizations.sql');
const UP = read('0024_add_organization_ai_setting.sql');
const DOWN = read('0024_add_organization_ai_setting.down.sql');

const SCHEMAS = {
  upgrade: 'l4_x1c_base',
  fresh: 'l4_x1c_base_fresh',
  chain: 'l4_x1c_base_chain',
  storage: 'l4_x1c_base_storage',
  pushed: 'l4_x1c_base_pushed',
};
const urlFor = (schema: string) => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
};

const PRE_ORG_TABLES = `
  CREATE TABLE users (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password TEXT, provider VARCHAR(50), provider_id VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE teams (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    description TEXT, password TEXT, icon TEXT, color TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, "order" INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE wiki_pages (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
    author TEXT NOT NULL, team_id INTEGER
  );
`;

let admin: Pool;
const pools: Record<string, Pool> = {};
let storage: any;

async function run(pool: Pool, sql: string) {
  await pool.query(sql);
}
const aiOf = async (pool: Pool, slug: string) =>
  (await pool.query(`SELECT ai_enabled FROM organizations WHERE slug = $1`, [slug])).rows[0]
    ?.ai_enabled;
const hasColumn = async (pool: Pool) =>
  (
    await pool.query(
      `SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('organizations') AND attname = 'ai_enabled' AND NOT attisdropped`
    )
  ).rowCount === 1;

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  for (const schema of Object.values(SCHEMAS)) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    pools[schema] = new Pool({ connectionString: urlFor(schema) });
  }
  // A pre-organization database with accounts, as an old deployment has it.
  const upgrade = pools[SCHEMAS.upgrade];
  await run(upgrade, PRE_ORG_TABLES);
  await run(upgrade, `INSERT INTO users (name, email) VALUES ('Old', 'old@example.com')`);
  await run(upgrade, `INSERT INTO teams (name, display_name) VALUES ('t', 'T')`);
  await run(upgrade, M0022);

  const chain = pools[SCHEMAS.chain];
  await run(chain, PRE_ORG_TABLES);
  await run(
    chain,
    `CREATE TABLE templates (id SERIAL PRIMARY KEY, name TEXT NOT NULL, team_id INTEGER);
     INSERT INTO templates (name) VALUES ('tpl');`
  );

  // A database a schema push already gave the column, with `default` inserted by 0022 after it.
  const pushed = pools[SCHEMAS.pushed];
  await run(pushed, PRE_ORG_TABLES);
  await run(pushed, M0022);
  await run(
    pushed,
    `ALTER TABLE organizations ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT FALSE`
  );

  // Storage scenario: the upgraded shape with accounts in several states.
  const st = pools[SCHEMAS.storage];
  await run(st, PRE_ORG_TABLES);
  await run(st, M0022);
  await run(st, UP);
  process.env.DATABASE_URL = urlFor(SCHEMAS.storage);
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
});

afterAll(async () => {
  await storage?.pool.end();
  for (const pool of Object.values(pools)) await pool.end();
  for (const schema of Object.values(SCHEMAS)) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  }
  await admin.end();
});

describe('migration 0024', () => {
  it('adds the column and turns it on for the organizations that exist (0022 then 0024)', async () => {
    const pool = pools[SCHEMAS.upgrade];
    expect(await hasColumn(pool)).toBe(false);
    expect(await aiOf(pool, 'default').catch(() => undefined)).toBeUndefined();
    await run(pool, `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme')`);
    await run(pool, UP);
    expect(await hasColumn(pool)).toBe(true);
    expect(await aiOf(pool, 'default')).toBe(true);
    expect(await aiOf(pool, 'acme')).toBe(true);
    const { rows } = await pool.query(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'organizations' AND column_name = 'ai_enabled'`,
      [SCHEMAS.upgrade]
    );
    expect(rows[0]).toEqual({ is_nullable: 'NO', column_default: 'false' });
  });

  it('keeps an organization set to FALSE when it runs again', async () => {
    const pool = pools[SCHEMAS.upgrade];
    await run(pool, `UPDATE organizations SET ai_enabled = FALSE WHERE slug = 'acme'`);
    await run(pool, UP);
    expect(await aiOf(pool, 'acme')).toBe(false);
    expect(await aiOf(pool, 'default')).toBe(true);
  });

  it('gives an organization inserted afterwards without the column FALSE', async () => {
    const pool = pools[SCHEMAS.upgrade];
    await run(pool, `INSERT INTO organizations (slug, name) VALUES ('later', 'Later')`);
    expect(await aiOf(pool, 'later')).toBe(false);
  });

  it('does nothing without an organizations table (fresh install)', async () => {
    const pool = pools[SCHEMAS.fresh];
    await run(pool, UP);
    await run(pool, DOWN);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1`,
      [SCHEMAS.fresh]
    );
    expect(rows[0].n).toBe(0);
  });

  it('applies after 0022 and 0023 inside one transaction', async () => {
    const pool = pools[SCHEMAS.chain];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(M0022);
      await client.query(M0023);
      await client.query(UP);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    expect(await hasColumn(pool)).toBe(true);
    expect(await aiOf(pool, 'default')).toBe(true);
  });
});

describe('migration 0024 when the column already exists (schema push ran first)', () => {
  it('turns AI on for `default` while it has no members', async () => {
    const pool = pools[SCHEMAS.pushed];
    expect(await aiOf(pool, 'default')).toBe(false);
    await run(pool, UP);
    expect(await aiOf(pool, 'default')).toBe(true);
    await run(pool, UP);
    expect(await aiOf(pool, 'default')).toBe(true);
  });

  it('leaves an organization without members other than `default` alone', async () => {
    const pool = pools[SCHEMAS.pushed];
    await run(pool, `INSERT INTO organizations (slug, name) VALUES ('empty', 'Empty')`);
    await run(pool, UP);
    expect(await aiOf(pool, 'empty')).toBe(false);
  });

  it('keeps FALSE on `default` once it has a member', async () => {
    const pool = pools[SCHEMAS.pushed];
    await run(pool, `INSERT INTO users (id, name, email) VALUES (50, 'M', 'm@example.com')`);
    await run(
      pool,
      `INSERT INTO organization_members (organization_id, user_id, role)
       SELECT id, 50, 'member' FROM organizations WHERE slug = 'default'`
    );
    await run(pool, `UPDATE organizations SET ai_enabled = FALSE WHERE slug = 'default'`);
    await run(pool, UP);
    expect(await aiOf(pool, 'default')).toBe(false);
  });
});

describe('migration 0024 down', () => {
  it('refuses while an organization has AI off and changes nothing', async () => {
    const pool = pools[SCHEMAS.upgrade];
    await expect(run(pool, DOWN)).rejects.toThrow(/an organization has AI turned off/);
    expect(await hasColumn(pool)).toBe(true);
    expect(await aiOf(pool, 'acme')).toBe(false);
    expect(await aiOf(pool, 'default')).toBe(true);
  });

  it('drops the column when every organization has AI on, and 0024 applies again', async () => {
    const pool = pools[SCHEMAS.upgrade];
    await run(pool, `UPDATE organizations SET ai_enabled = TRUE`);
    await run(pool, DOWN);
    expect(await hasColumn(pool)).toBe(false);
    expect((await pool.query(`SELECT count(*)::int AS n FROM organizations`)).rows[0].n).toBe(3);
    await run(pool, DOWN); // no-op without the column
    await run(pool, UP);
    expect(await hasColumn(pool)).toBe(true);
    expect(await aiOf(pool, 'acme')).toBe(true);
  });
});

describe('DBStorage organization helpers', () => {
  const st = () => pools[SCHEMAS.storage];
  let orgId: number;
  let aiOffId: number;

  beforeAll(async () => {
    orgId = Number(
      (
        await st().query(
          `INSERT INTO organizations (slug, name, ai_enabled) VALUES ('on', 'On', TRUE) RETURNING id`
        )
      ).rows[0].id
    );
    aiOffId = Number(
      (
        await st().query(
          `INSERT INTO organizations (slug, name) VALUES ('off', 'Off') RETURNING id`
        )
      ).rows[0].id
    );
    await st().query(
      `INSERT INTO users (id, name, email, is_active) VALUES
         (1, 'Owner', 'o@example.com', TRUE), (2, 'Gone', 'g@example.com', FALSE),
         (3, 'Odd', 'x@example.com', TRUE), (4, 'None', 'n@example.com', TRUE)`
    );
    await st().query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES
         ($1, 1, 'owner'), ($1, 2, 'admin'), ($1, 3, 'superuser')`,
      [orgId]
    );
  });

  it('getOrganizationMembership returns the stored role of an active account', async () => {
    expect(await storage.getOrganizationMembership(1)).toEqual({
      organizationId: orgId,
      role: 'owner',
    });
  });

  it('getOrganizationMembership is null for an inactive account, no membership or unknown id', async () => {
    expect(await storage.getOrganizationMembership(2)).toBeNull();
    expect(await storage.getOrganizationMembership(4)).toBeNull();
    expect(await storage.getOrganizationMembership(999)).toBeNull();
  });

  it('getOrganizationMembership counts a role outside the enum as member', async () => {
    expect(await storage.getOrganizationMembership(3)).toEqual({
      organizationId: orgId,
      role: 'member',
    });
  });

  it('getOrganization returns the row or undefined', async () => {
    const row = await storage.getOrganization(orgId);
    expect(row).toMatchObject({ id: orgId, slug: 'on', name: 'On', aiEnabled: true });
    expect(await storage.getOrganization(999999)).toBeUndefined();
  });

  it('isOrganizationAiEnabled follows the column; null and unknown ids are false', async () => {
    expect(await storage.isOrganizationAiEnabled(orgId)).toBe(true);
    expect(await storage.isOrganizationAiEnabled(aiOffId)).toBe(false);
    expect(await storage.isOrganizationAiEnabled(null)).toBe(false);
    expect(await storage.isOrganizationAiEnabled(999999)).toBe(false);
  });

  it('a default organization created by the application has AI on', async () => {
    // 0022 already inserted `default`; remove it (no members) so the insert really runs.
    await st().query(`DELETE FROM organizations WHERE slug = 'default'`);
    expect((await st().query(`SELECT 1 FROM organizations WHERE slug = 'default'`)).rowCount).toBe(
      0
    );
    const id = await storage.getDefaultOrganizationId();
    expect(await aiOf(st(), 'default')).toBe(true);
    expect(await storage.isOrganizationAiEnabled(id)).toBe(true);
  });

  it('withOrganizationLocks runs two callers on the same id one after the other', async () => {
    const events: string[] = [];
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const first = storage.withOrganizationLocks([orgId], async () => {
      events.push('first:start');
      await sleep(300);
      events.push('first:end');
    });
    await sleep(50); // the first caller holds the lock before the second asks
    const second = storage.withOrganizationLocks([orgId], async () => {
      events.push('second:start');
      events.push('second:end');
    });
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('withOrganizationLocks lets callers on different ids run together', async () => {
    const events: string[] = [];
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const first = storage.withOrganizationLocks([orgId], async () => {
      events.push('a:start');
      await sleep(300);
      events.push('a:end');
    });
    await sleep(50);
    await storage.withOrganizationLocks([aiOffId], async () => {
      events.push('b');
    });
    await first;
    expect(events).toEqual(['a:start', 'b', 'a:end']);
  });

  it('withOrganizationLocks locks ids in ascending order, so crossed lists do not deadlock', async () => {
    const run = (ids: number[]) =>
      storage.withOrganizationLocks(ids, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return ids.join(',');
      });
    const results = await Promise.all([
      run([orgId, aiOffId]),
      run([aiOffId, orgId]),
      run([orgId, orgId]),
    ]);
    expect(results).toHaveLength(3);
  });

  it('withOrganizationLocks rolls back the transaction when fn throws, and returns its result', async () => {
    await expect(
      storage.withOrganizationLocks([orgId], async (tx: any) => {
        await tx.execute(
          (await import('drizzle-orm'))
            .sql`UPDATE organizations SET name = 'Changed' WHERE id = ${orgId}`
        );
        throw new Error('stop');
      })
    ).rejects.toThrow('stop');
    expect((await storage.getOrganization(orgId)).name).toBe('On');
    expect(await storage.withOrganizationLocks([orgId], async () => 42)).toBe(42);
  });

  it('an empty id list throws instead of running unlocked', async () => {
    let ran = false;
    await expect(
      storage.withOrganizationLocks([], async () => {
        ran = true;
      })
    ).rejects.toThrow(/at least one organization/);
    expect(ran).toBe(false);
  });

  it('a read through the handle sees the locked transaction, a read without it does not', async () => {
    await expect(
      storage.withOrganizationLocks([orgId], async (tx: any) => {
        await tx.execute(sql`UPDATE organization_members SET role = 'admin' WHERE user_id = 1`);
        expect((await storage.getOrganizationMembership(1, tx))?.role).toBe('admin');
        expect((await storage.getOrganizationMembership(1))?.role).toBe('owner');
        expect((await storage.getOrganization(orgId, tx))?.id).toBe(orgId);
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect((await storage.getOrganizationMembership(1))?.role).toBe('owner');
  });

  it('a second caller gets OrganizationBusyError when the lock is not free in time', async () => {
    const { OrganizationBusyError } = await import('../../server/storage.js');
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const first = storage.withOrganizationLocks([orgId], async () => {
      await held;
      return 'first done';
    });
    await sleep(100);
    const started = Date.now();
    await expect(
      storage.withOrganizationLocks([orgId], async () => 'never', { lockTimeoutMs: 300 })
    ).rejects.toBeInstanceOf(OrganizationBusyError);
    expect(Date.now() - started).toBeLessThan(3000);
    release();
    expect(await first).toBe('first done');
    // The timeout bounds the wait, not the work: a holder may run longer than it.
    expect(
      await storage.withOrganizationLocks(
        [orgId],
        async () => {
          await sleep(500);
          return 'long work';
        },
        { lockTimeoutMs: 300 }
      )
    ).toBe('long work');
    // The lock is free again.
    expect(await storage.withOrganizationLocks([orgId], async () => 1)).toBe(1);
  });
});
