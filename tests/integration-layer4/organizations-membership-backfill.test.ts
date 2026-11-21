/**
 * Layer 4: drizzle/0022_add_organizations.sql places accounts into the default organization
 * once (issue #124 X1c), on real Postgres.
 *
 * Deployments apply the file on every deploy (scripts/apply-organizations-schema.mjs). Its
 * membership backfill is for the upgrade from a database without organizations: it runs only
 * while no account has been placed in any organization yet. After that, an account without a
 * membership is one an organization removed, and a later deploy must leave it that way.
 *
 * - first application: every existing account becomes a member of `default`;
 * - applied again after a member was removed: that account still belongs to no organization,
 *   and nobody else's membership changes;
 * - applied again after an account moved to another organization: it stays there;
 * - tables present but nobody placed yet (the default organization may already exist): the
 *   backfill still runs.
 *
 * Runs in its own schema, on tables in their pre-organization shape.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'organizations_backfill_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const UP = readFileSync(
  new URL('../../drizzle/0022_add_organizations.sql', import.meta.url),
  'utf8'
);

// Only the tables 0022 reads or alters, in the columns it needs.
const PRE_ORGANIZATION_TABLES = `
  CREATE TABLE users (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
  );
  CREATE TABLE teams (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL
  );
  CREATE TABLE wiki_pages (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    team_id INTEGER CONSTRAINT wiki_pages_team_id_teams_id_fk REFERENCES teams(id) ON DELETE RESTRICT
  );
`;

let admin: Pool;
let scoped: Pool;

async function memberships() {
  const { rows } = await scoped.query(
    `SELECT m.user_id, o.slug, m.role
       FROM organization_members m JOIN organizations o ON o.id = m.organization_id
      ORDER BY m.user_id`
  );
  return rows as Array<{ user_id: number; slug: string; role: string }>;
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  scoped = new Pool({ connectionString: scopedUrl, max: 1 });
});

beforeEach(async () => {
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  await scoped.query(PRE_ORGANIZATION_TABLES);
  await scoped.query(`
    INSERT INTO users (id, name, email) VALUES (1, 'Ann', 'ann@example.com'),
                                               (2, 'Ben', 'ben@example.com'),
                                               (3, 'Cho', 'cho@example.com');
    SELECT setval(pg_get_serial_sequence('users', 'id'), 3);
  `);
});

afterAll(async () => {
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('0022 places accounts into the default organization once (real Postgres)', () => {
  it('first application: every existing account becomes a member of default', async () => {
    await scoped.query(UP);

    expect(await memberships()).toEqual([
      { user_id: 1, slug: 'default', role: 'member' },
      { user_id: 2, slug: 'default', role: 'member' },
      { user_id: 3, slug: 'default', role: 'member' },
    ]);
  });

  it('applied again after a member was removed: the account stays without an organization', async () => {
    await scoped.query(UP);
    await scoped.query(`UPDATE organization_members SET role = 'owner' WHERE user_id = 1`);
    // What removing a member from the organization leaves behind: the account, no membership.
    await scoped.query(`DELETE FROM organization_members WHERE user_id = 2`);

    await scoped.query(UP);
    await scoped.query(UP);

    expect(await memberships()).toEqual([
      { user_id: 1, slug: 'default', role: 'owner' },
      { user_id: 3, slug: 'default', role: 'member' },
    ]);
    const { rows } = await scoped.query(`SELECT id FROM users ORDER BY id`);
    expect(rows.map((row: { id: number }) => row.id)).toEqual([1, 2, 3]);
  });

  it('applied again after an account moved to another organization: it stays there', async () => {
    await scoped.query(UP);
    await scoped.query(`INSERT INTO organizations (slug, name) VALUES ('second', 'Second')`);
    await scoped.query(
      `UPDATE organization_members
          SET organization_id = (SELECT id FROM organizations WHERE slug = 'second'),
              role = 'owner'
        WHERE user_id = 3`
    );
    await scoped.query(`DELETE FROM organization_members WHERE user_id = 2`);

    await scoped.query(UP);

    expect(await memberships()).toEqual([
      { user_id: 1, slug: 'default', role: 'member' },
      { user_id: 3, slug: 'second', role: 'owner' },
    ]);
  });

  it('tables present but nobody placed yet: the backfill still runs', async () => {
    // The shape a schema push leaves when it ran before this file: the tables and even the
    // default organization exist, but no account was ever placed.
    await scoped.query(UP);
    await scoped.query(`DELETE FROM organization_members`);

    await scoped.query(UP);

    expect(await memberships()).toEqual([
      { user_id: 1, slug: 'default', role: 'member' },
      { user_id: 2, slug: 'default', role: 'member' },
      { user_id: 3, slug: 'default', role: 'member' },
    ]);
  });
});
