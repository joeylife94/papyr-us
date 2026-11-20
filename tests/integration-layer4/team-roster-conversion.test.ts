/**
 * Layer 4: drizzle/0028_convert_roster_team_access.sql and its down file (WP2), on real Postgres.
 *
 * Until 0028 a directory (`members`) row gave team access to the account with exactly its email,
 * but only while that account had no team_members row in a team of its own organization. The
 * migration turns exactly that access into team_members rows (plain members), records them, and
 * changes nothing else:
 *   - converted: an account of an organization without a team_members row in that organization,
 *     for its active directory row on a team of the same organization (also when its only
 *     team_members row is in another organization's team);
 *   - not converted: an account that already has a team_members row in its organization, an
 *     inactive row, a row without a team, a row on another organization's team, an email no
 *     account has, an email that differs in case, an account without an organization;
 *   - idempotent: a second run changes nothing, and a directory row written after the first run
 *     never becomes access;
 *   - down: removes exactly the recorded rows; a membership an owner removed and added again, or
 *     added later, stays; it refuses (changing nothing) while a recorded membership has a role
 *     above member;
 *   - a database without the tables (fresh install) is left alone.
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_wp2_roster_conversion';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const UP = readFileSync(
  new URL('../../drizzle/0028_convert_roster_team_access.sql', import.meta.url),
  'utf8'
);
const DOWN = readFileSync(
  new URL('../../drizzle/0028_convert_roster_team_access.down.sql', import.meta.url),
  'utf8'
);

let admin: Pool;
let scoped: Pool;
let defaultId: number;
let acmeId: number;
const team: Record<string, number> = {};
const user: Record<string, number> = {};

const rows = async (text: string, params: unknown[] = []) =>
  (await scoped.query(text, params)).rows;
const one = async (text: string, params: unknown[] = []) => (await rows(text, params))[0];

async function seed() {
  await scoped.query(`DROP TABLE IF EXISTS team_roster_conversions`);
  await scoped.query(`
    TRUNCATE team_members, members, wiki_pages, teams, organization_members, users
      RESTART IDENTITY CASCADE;
  `);
  const makeTeam = async (key: string, organizationId: number) => {
    team[key] = (
      await one(
        `INSERT INTO teams (name, display_name, organization_id) VALUES ($1, $1, $2) RETURNING id`,
        [key, organizationId]
      )
    ).id;
  };
  await makeTeam('t1', defaultId);
  await makeTeam('t2', defaultId);
  await makeTeam('acme-team', acmeId);

  // Accounts, each described by what it holds before the migration.
  const accounts: Array<[string, { org?: 'default' | 'acme' | null; email?: string }]> = [
    ['roster-only', {}],
    ['other-org-row-only', {}], // team_members row only in another organization's team
    ['has-row-elsewhere', {}], // a team_members row in its organization: the directory row was ignored
    ['has-row-same-team', {}], // a team_members row and a directory row on the same team
    ['inactive-roster', {}],
    ['roster-other-org-team', {}], // directory row on a team of an organization it is not in
    ['no-org', { org: null }],
    ['case-differs', {}],
    ['no-team-row', {}], // directory row without a team
    ['acme-user', { org: 'acme' }], // converted too: the same rule in another organization
  ];
  for (const [key, options] of accounts) {
    const email = options.email ?? `${key}@example.com`;
    user[key] = (
      await one(`INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`, [key, email])
    ).id;
    if (options.org === null) {
      await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [user[key]]);
    } else if (options.org === 'acme') {
      await scoped.query(
        `UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`,
        [acmeId, user[key]]
      );
    }
  }
  const roster = (
    email: string,
    teamKey: string | null,
    active = true
  ): [string, string, string, number | null, boolean] => [
    email,
    email,
    'dev',
    teamKey ? team[teamKey] : null,
    active,
  ];
  for (const values of [
    roster('roster-only@example.com', 't1'),
    roster('other-org-row-only@example.com', 't1'),
    roster('has-row-elsewhere@example.com', 't1'),
    roster('has-row-same-team@example.com', 't1'),
    roster('inactive-roster@example.com', 't1', false),
    roster('roster-other-org-team@example.com', 'acme-team'),
    roster('no-org@example.com', 't1'),
    roster('Case-Differs@Example.com', 't1'),
    roster('no-team-row@example.com', null),
    roster('acme-user@example.com', 'acme-team'),
    roster('nobody-has-this-email@example.com', 't1'),
  ]) {
    await scoped.query(
      `INSERT INTO members (name, email, role, team_id, is_active) VALUES ($1, $2, $3, $4, $5)`,
      values
    );
  }
  const memberships: Array<[string, string, string]> = [
    ['other-org-row-only', 'acme-team', 'member'],
    ['has-row-elsewhere', 't2', 'member'],
    ['has-row-same-team', 't1', 'owner'],
  ];
  for (const [account, teamKey, role] of memberships) {
    await scoped.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)`, [
      team[teamKey],
      user[account],
      role,
    ]);
  }
}

const memberships = async () =>
  rows(
    `SELECT u.email, t.name AS team, tm.role
       FROM team_members tm JOIN users u ON u.id = tm.user_id JOIN teams t ON t.id = tm.team_id
      ORDER BY u.email, t.name`
  );
const recorded = async () =>
  rows(
    `SELECT u.email, t.name AS team FROM team_roster_conversions c
       JOIN team_members tm ON tm.id = c.team_member_id
       JOIN users u ON u.id = tm.user_id JOIN teams t ON t.id = tm.team_id ORDER BY u.email`
  );
const up = () => scoped.query(UP);
/** Runs a migration file and returns the NOTICE messages it raised. */
async function runWithNotices(sqlText: string, pool: Pool = scoped): Promise<string[]> {
  const client = await pool.connect();
  const notices: string[] = [];
  client.on('notice', (notice) => notices.push(notice.message));
  try {
    await client.query(sqlText);
  } finally {
    client.removeAllListeners('notice');
    client.release();
  }
  return notices;
}
const marker = async () =>
  (await one(`SELECT obj_description(to_regclass('team_roster_conversions'), 'pg_class') AS c`))
    ?.c ?? null;
/** The table as `drizzle-kit push` creates it: no comment, no rows. */
const createTableAsPushDoes = () =>
  scoped.query(`
    CREATE TABLE team_roster_conversions (
      team_member_id integer PRIMARY KEY NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    );
    ALTER TABLE team_roster_conversions
      ADD CONSTRAINT team_roster_conversions_team_member_id_team_members_id_fk
      FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE ON UPDATE NO ACTION;
  `);
const down = () => scoped.query(DOWN);

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
      hashed_password TEXT, provider VARCHAR(50), provider_id VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE members (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
      team_id INTEGER, avatar_url TEXT, bio TEXT, github_username TEXT,
      skills TEXT[] NOT NULL DEFAULT '{}', joined_date TIMESTAMP NOT NULL DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE team_members (
      id SERIAL PRIMARY KEY, team_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', invited_by INTEGER,
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(), created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE wiki_pages (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
      blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs',
      tags TEXT[] NOT NULL DEFAULT '{}', author TEXT NOT NULL, parent_id INTEGER,
      position INTEGER, icon TEXT, team_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE, metadata JSONB DEFAULT '{}',
      deleted_at TIMESTAMP
    );
  `);
  defaultId = await addOrganizations(scoped);
  acmeId = Number(
    (await one(`INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`)).id
  );
});

beforeEach(seed);

afterAll(async () => {
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('0028 up', () => {
  it('converts exactly the access the directory gave, as plain members', async () => {
    const before = await memberships();
    await up();
    const after = await memberships();
    const created = after.filter(
      (row: any) => !before.some((b: any) => b.email === row.email && b.team === row.team)
    );
    expect(created).toEqual([
      { email: 'acme-user@example.com', team: 'acme-team', role: 'member' },
      { email: 'other-org-row-only@example.com', team: 't1', role: 'member' },
      { email: 'roster-only@example.com', team: 't1', role: 'member' },
    ]);
    // Every row that existed is untouched (roles included).
    for (const row of before) expect(after).toContainEqual(row);
    expect(after).toHaveLength(before.length + 3);
    expect(await recorded()).toEqual([
      { email: 'acme-user@example.com', team: 'acme-team' },
      { email: 'other-org-row-only@example.com', team: 't1' },
      { email: 'roster-only@example.com', team: 't1' },
    ]);
  });

  it('does not convert what grants nothing today (each shape)', async () => {
    await up();
    const rowsFor = async (key: string) =>
      rows(`SELECT team_id FROM team_members WHERE user_id = $1 ORDER BY team_id`, [user[key]]);
    // An account that already had a team_members row in its organization: the directory row was ignored.
    expect(await rowsFor('has-row-elsewhere')).toEqual([{ team_id: team.t2 }]);
    expect(await rowsFor('has-row-same-team')).toEqual([{ team_id: team.t1 }]);
    expect(await rowsFor('inactive-roster')).toEqual([]);
    expect(await rowsFor('roster-other-org-team')).toEqual([]);
    expect(await rowsFor('no-org')).toEqual([]);
    expect(await rowsFor('case-differs')).toEqual([]);
    expect(await rowsFor('no-team-row')).toEqual([]);
    // The existing owner row on the same team keeps its role.
    expect(
      (await one(`SELECT role FROM team_members WHERE user_id = $1`, [user['has-row-same-team']]))
        .role
    ).toBe('owner');
  });

  it('is idempotent, and a directory row written afterwards never becomes access', async () => {
    await up();
    const once = await memberships();
    await up();
    expect(await memberships()).toEqual(once);
    expect(await recorded()).toHaveLength(3);

    const late = (
      await one(`INSERT INTO users (name, email) VALUES ('late', 'late@example.com') RETURNING id`)
    ).id;
    await scoped.query(
      `INSERT INTO members (name, email, role, team_id) VALUES ('late', 'late@example.com', 'dev', $1)`,
      [team.t1]
    );
    await up();
    expect(await rows(`SELECT 1 FROM team_members WHERE user_id = $1`, [late])).toEqual([]);
    expect(await memberships()).toEqual(once);
  });

  it('marks what it did, says how many rows it converted, and is quiet the second time', async () => {
    const notices = await runWithNotices(UP);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/^0028: /);
    expect(notices[0]).toContain('3');
    expect(await marker()).not.toBeNull();
    expect(await runWithNotices(UP)).toEqual([]);
  });

  describe('a record table that is there but not marked (a schema push made it)', () => {
    it('converts nothing on its own, says how many rows it left, and stays unmarked', async () => {
      await createTableAsPushDoes();
      const before = await memberships();
      const notices = await runWithNotices(UP);
      expect(await memberships()).toEqual(before);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatch(/^0028: /);
      expect(notices[0]).toContain('3 directory row(s)');
      expect(notices[0]).toMatch(/operator/);
      expect(await marker()).toBeNull();
      // Asked again, it says the same and still changes nothing.
      expect(await runWithNotices(UP)).toEqual(notices);
      expect(await memberships()).toEqual(before);
      expect(await marker()).toBeNull();
    });

    it('marks itself, silently, when no directory row would qualify (nothing is converted)', async () => {
      await scoped.query(
        `UPDATE members SET is_active = FALSE WHERE email IN ('roster-only@example.com', 'other-org-row-only@example.com', 'acme-user@example.com')`
      );
      await createTableAsPushDoes();
      const before = await memberships();
      expect(await runWithNotices(UP)).toEqual([]);
      expect(await memberships()).toEqual(before);
      expect(await marker()).not.toBeNull();
    });

    it('converts after the documented remedy: drop the empty table, run it again', async () => {
      await createTableAsPushDoes();
      await runWithNotices(UP);
      await scoped.query(`DROP TABLE team_roster_conversions`);
      const notices = await runWithNotices(UP);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toContain('3');
      expect(await recorded()).toHaveLength(3);
      expect(await marker()).not.toBeNull();
    });

    it('converts nothing after the other remedy: declining by setting the marker', async () => {
      await createTableAsPushDoes();
      await scoped.query(`COMMENT ON TABLE team_roster_conversions IS 'declined by an operator'`);
      const before = await memberships();
      expect(await runWithNotices(UP)).toEqual([]);
      expect(await memberships()).toEqual(before);
      expect(await marker()).toBe('declined by an operator');
    });
  });

  it('does nothing on a database without the tables (fresh install)', async () => {
    const fresh = `${SCHEMA}_fresh`;
    await admin.query(`DROP SCHEMA IF EXISTS ${fresh} CASCADE`);
    await admin.query(`CREATE SCHEMA ${fresh}`);
    const client = await admin.connect();
    try {
      await client.query(`SET search_path TO ${fresh}`);
      await client.query(UP);
      await client.query(DOWN);
      const { rows: tables } = await client.query(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1`,
        [fresh]
      );
      expect(tables[0].n).toBe(0);
    } finally {
      client.release();
      await admin.query(`DROP SCHEMA IF EXISTS ${fresh} CASCADE`);
    }
  });

  it('fresh-install order (prepare, push, prepare, push) ends marked with nothing converted', async () => {
    // prepare on a database without tables: nothing, and no record table
    const fresh = `${SCHEMA}_order`;
    await admin.query(`DROP SCHEMA IF EXISTS ${fresh} CASCADE`);
    await admin.query(`CREATE SCHEMA ${fresh}`);
    const pool = new Pool({
      connectionString: (() => {
        const url = new URL(DATABASE_URL!);
        url.searchParams.set('options', `-c search_path=${fresh}`);
        return url.toString();
      })(),
    });
    try {
      expect(await runWithNotices(UP, pool)).toEqual([]);
      expect(
        (await pool.query(`SELECT to_regclass('team_roster_conversions') AS t`)).rows[0].t
      ).toBeNull();
      // push: the tables, the record table unmarked and empty
      await pool.query(`
        CREATE TABLE users (id SERIAL PRIMARY KEY, email text NOT NULL UNIQUE);
        CREATE TABLE teams (id SERIAL PRIMARY KEY, organization_id integer NOT NULL);
        CREATE TABLE members (id SERIAL PRIMARY KEY, email text NOT NULL UNIQUE, team_id integer, is_active boolean NOT NULL DEFAULT TRUE);
        CREATE TABLE organization_members (id SERIAL PRIMARY KEY, organization_id integer NOT NULL, user_id integer NOT NULL UNIQUE);
        CREATE TABLE team_members (id SERIAL PRIMARY KEY, team_id integer NOT NULL, user_id integer NOT NULL, role text NOT NULL DEFAULT 'member', invited_by integer);
        CREATE TABLE team_roster_conversions (team_member_id integer PRIMARY KEY NOT NULL, created_at timestamp DEFAULT now() NOT NULL);
      `);
      // prepare again: marks, quietly, converts nothing
      expect(await runWithNotices(UP, pool)).toEqual([]);
      const comment = (
        await pool.query(
          `SELECT obj_description(to_regclass('team_roster_conversions'), 'pg_class') AS c`
        )
      ).rows[0].c;
      expect(comment).not.toBeNull();
      expect((await pool.query(`SELECT count(*)::int AS n FROM team_members`)).rows[0].n).toBe(0);
      // a directory row written afterwards (under the new rules) never becomes access
      await pool.query(`
        INSERT INTO users (email) VALUES ('late@example.com');
        INSERT INTO organization_members (organization_id, user_id) SELECT 1, id FROM users;
        INSERT INTO teams (organization_id) VALUES (1);
        INSERT INTO members (email, team_id) VALUES ('late@example.com', 1);
      `);
      expect(await runWithNotices(UP, pool)).toEqual([]);
      expect((await pool.query(`SELECT count(*)::int AS n FROM team_members`)).rows[0].n).toBe(0);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${fresh} CASCADE`);
    }
  });

  it('creates the record table with the names the schema declares', async () => {
    await up();
    const columns = await rows(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'team_roster_conversions' ORDER BY column_name`,
      [SCHEMA]
    );
    expect(columns).toEqual([
      { column_name: 'created_at', is_nullable: 'NO' },
      { column_name: 'team_member_id', is_nullable: 'NO' },
    ]);
    const constraints = await rows(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'team_roster_conversions'::regclass ORDER BY conname`
    );
    expect(await marker()).not.toBeNull();
    expect(constraints.map((c: any) => c.conname)).toEqual([
      'team_roster_conversions_pkey',
      'team_roster_conversions_team_member_id_team_members_id_fk',
    ]);
  });
});

describe('0028 down', () => {
  it('removes exactly the recorded rows and drops the record', async () => {
    const before = await memberships();
    await up();
    await down();
    expect(await memberships()).toEqual(before);
    expect((await one(`SELECT to_regclass('team_roster_conversions') AS t`)).t).toBeNull();
    // The marker went with the table: a later run converts again, and marks again.
    await up();
    expect(await marker()).not.toBeNull();
  });

  it('keeps a membership an owner added later, and one removed and added again', async () => {
    await up();
    // An owner adds someone new, and removes then re-adds a converted member.
    await scoped.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')`,
      [team.t2, user['inactive-roster']]
    );
    await scoped.query(`DELETE FROM team_members WHERE user_id = $1`, [user['roster-only']]);
    await scoped.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')`,
      [team.t1, user['roster-only']]
    );
    await down();
    const after = await memberships();
    expect(after).toContainEqual({
      email: 'inactive-roster@example.com',
      team: 't2',
      role: 'member',
    });
    expect(after).toContainEqual({ email: 'roster-only@example.com', team: 't1', role: 'member' });
    // The conversions still recorded are gone.
    for (const [email, teamName] of [
      ['other-org-row-only@example.com', 't1'],
      ['acme-user@example.com', 'acme-team'],
    ]) {
      expect(after).not.toContainEqual({ email, team: teamName, role: 'member' });
    }
  });

  it('refuses, and changes nothing, while a converted membership holds a higher role', async () => {
    await up();
    await scoped.query(
      `UPDATE team_members SET role = 'admin' WHERE user_id = $1 AND team_id = $2`,
      [user['roster-only'], team.t1]
    );
    const before = await memberships();
    await expect(down()).rejects.toThrow(/higher role/);
    expect(await memberships()).toEqual(before);
    expect(await recorded()).toHaveLength(3);
    // Lowering it again makes the down allowed.
    await scoped.query(
      `UPDATE team_members SET role = 'member' WHERE user_id = $1 AND team_id = $2`,
      [user['roster-only'], team.t1]
    );
    await down();
    expect((await one(`SELECT to_regclass('team_roster_conversions') AS t`)).t).toBeNull();
  });

  it('does nothing when the record is not there', async () => {
    const before = await memberships();
    await down();
    expect(await memberships()).toEqual(before);
  });

  it('after a down, a second up converts the directory rows again, once', async () => {
    await up();
    await down();
    await up();
    expect(await recorded()).toHaveLength(3);
  });
});
