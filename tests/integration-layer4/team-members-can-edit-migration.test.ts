/**
 * Layer 4: drizzle/0031_add_team_members_can_edit.sql and its down file (WP7), on real Postgres.
 *
 * The setting "members can edit team pages" is on for teams created from now on and off for every
 * team that exists when the column is added, so no existing team's rights widen:
 *   - up: the column is added NOT NULL with the default false, every existing team reads false,
 *     and the NOTICE says how many teams that is;
 *   - idempotent: a second run changes nothing, and a team an owner or admin turned on since keeps
 *     its value;
 *   - whatever the order of the deploy steps: when `drizzle-kit push` created the column first
 *     (the same definition, NOT NULL DEFAULT false) the existing teams are off and the migration
 *     changes nothing; when the migration ran first push has nothing to add;
 *   - a database without the table (a fresh install) is left alone;
 *   - down: drops the column and says how many teams had it on; up applies again after it.
 *
 * Access before and after: on a database upgraded from the previous shape, what every kind of
 * caller may do on every shape of team page is exactly what it was (the "before" table below is
 * the rule of the previous release, taken from its code at the parent commit), and it changes
 * only for plain members of a team whose owner turned the setting on.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { teams } from '../../shared/schema';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_wp7_migration';
const FRESH_SCHEMA = 'l4_wp7_migration_fresh';
const urlFor = (schema: string) => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
};
const read = (file: string) =>
  readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8');
const UP = read('0031_add_team_members_can_edit.sql');
const DOWN = read('0031_add_team_members_can_edit.down.sql');

const TABLES = `
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
  CREATE TABLE members (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL, avatar_url TEXT, bio TEXT,
    github_username TEXT, skills TEXT[] NOT NULL DEFAULT '{}',
    joined_date TIMESTAMP NOT NULL DEFAULT NOW(), is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', invited_by INTEGER REFERENCES users(id),
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id)
  );
  CREATE TABLE wiki_pages (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
    blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs', tags TEXT[] NOT NULL DEFAULT '{}',
    author TEXT NOT NULL, parent_id INTEGER, position INTEGER,
    team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_published BOOLEAN NOT NULL DEFAULT TRUE, deleted_at TIMESTAMP,
    metadata JSONB DEFAULT '{}', icon TEXT
  );
  CREATE TABLE page_permissions (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, entity_id INTEGER, permission TEXT NOT NULL,
    granted_by INTEGER, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

let admin: Pool;
let scoped: Pool;
let fresh: Pool;
let storage: any;
let defaultOrg = 0;
let acmeOrg = 0;

const rows = async (text: string, params: unknown[] = [], pool = scoped) =>
  (await pool.query(text, params)).rows;
const one = async (text: string, params: unknown[] = []) => (await rows(text, params))[0];

/** Runs a migration file and returns the NOTICE messages it raised. */
async function run(sql: string, pool = scoped): Promise<string[]> {
  const client = await pool.connect();
  const notices: string[] = [];
  const listener = (notice: { message: string }) => notices.push(notice.message);
  client.on('notice', listener);
  try {
    await client.query(sql);
  } finally {
    client.removeListener('notice', listener);
    client.release();
  }
  return notices;
}
const column = async () =>
  one(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'teams' AND column_name = 'members_can_edit'`,
    [SCHEMA]
  );
const flags = async () =>
  (await rows(`SELECT name, members_can_edit AS on FROM teams ORDER BY id`)).map(
    (row) => `${row.name}:${row.on}`
  );

// ---- the cast of the access table ----
const PEOPLE = [
  'owner',
  'admin',
  'member',
  'member2',
  'other',
  'orgOnly',
  'outsider',
  'out',
] as const;
type PersonKey = (typeof PEOPLE)[number];
type Seen = 'owner' | 'editor' | 'commenter' | 'viewer' | 'none';
const person: Record<string, number> = {};
let teamT = 0;
let teamT2 = 0;
const pageOf: Record<string, number> = {};

const SHAPES = [
  'no grants',
  'member created it',
  'member viewer grant',
  'member2 commenter grant',
  'member2 editor grant',
  'team grant to T2',
  'public commenter',
  'team-less, no grants',
] as const;

/**
 * What each caller held on each shape of page in the previous release (no per-team setting): a
 * current plain member of the page's team reads; owners and admins of the team own its pages;
 * a grant counts for the member it names (and a team grant for members of that team); a public
 * grant for everyone; a team-less page without grants is open to members of the organization.
 * Order of the columns: PEOPLE.
 */
const BEFORE: Record<(typeof SHAPES)[number], Seen[]> = {
  //                          owner    admin    member    member2     other     orgOnly   outsider   out
  'no grants': ['owner', 'owner', 'viewer', 'viewer', 'none', 'none', 'none', 'none'],
  'member created it': ['owner', 'owner', 'owner', 'viewer', 'none', 'none', 'none', 'none'],
  'member viewer grant': ['owner', 'owner', 'viewer', 'viewer', 'none', 'none', 'none', 'none'],
  'member2 commenter grant': [
    'owner',
    'owner',
    'viewer',
    'commenter',
    'none',
    'none',
    'none',
    'none',
  ],
  'member2 editor grant': ['owner', 'owner', 'viewer', 'editor', 'none', 'none', 'none', 'none'],
  'team grant to T2': ['owner', 'owner', 'viewer', 'viewer', 'editor', 'none', 'none', 'none'],
  'public commenter': [
    'owner',
    'owner',
    'commenter',
    'commenter',
    'commenter',
    'commenter',
    'commenter',
    'commenter',
  ],
  'team-less, no grants': ['owner', 'owner', 'owner', 'owner', 'owner', 'owner', 'none', 'none'],
};

async function seedAccessCast() {
  await scoped.query(`
    TRUNCATE page_permissions, team_members, members, wiki_pages, teams, organization_members, users
      RESTART IDENTITY CASCADE;
  `);
  for (const key of PEOPLE) {
    if (key === 'out') continue;
    person[key] = Number(
      (
        await one(`INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`, [
          key,
          `${key}@example.com`,
        ])
      ).id
    );
  }
  await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
    acmeOrg,
    person.outsider,
  ]);
  const makeTeam = async (name: string) =>
    Number(
      (
        await one(
          `INSERT INTO teams (name, display_name, organization_id) VALUES ($1, $1, $2) RETURNING id`,
          [name, defaultOrg]
        )
      ).id
    );
  teamT = await makeTeam('T');
  teamT2 = await makeTeam('T2');
  for (const [teamId, key, role] of [
    [teamT, 'owner', 'owner'],
    [teamT, 'admin', 'admin'],
    [teamT, 'member', 'member'],
    [teamT, 'member2', 'member'],
    [teamT2, 'other', 'member'],
  ] as Array<[number, PersonKey, string]>) {
    await scoped.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)`, [
      teamId,
      person[key],
      role,
    ]);
  }
  const grants: Record<(typeof SHAPES)[number], Array<[string, number | null, string]>> = {
    'no grants': [],
    'member created it': [['user', person.member, 'owner']],
    'member viewer grant': [['user', person.member, 'viewer']],
    'member2 commenter grant': [['user', person.member2, 'commenter']],
    'member2 editor grant': [['user', person.member2, 'editor']],
    'team grant to T2': [['team', teamT2, 'editor']],
    'public commenter': [['public', null, 'commenter']],
    'team-less, no grants': [],
  };
  for (const shape of SHAPES) {
    const teamId = shape === 'team-less, no grants' ? null : teamT;
    const page = await one(
      `INSERT INTO wiki_pages (title, slug, content, author, organization_id, team_id)
       VALUES ($1, $2, '', 'Automation', $3, $4) RETURNING id`,
      [shape, `wp7-${shape.replace(/[^a-z0-9]+/gi, '-')}`, defaultOrg, teamId]
    );
    pageOf[shape] = Number(page.id);
    for (const [type, entityId, permission] of grants[shape]) {
      await scoped.query(
        `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission) VALUES ($1, $2, $3, $4)`,
        [page.id, type, entityId, permission]
      );
    }
  }
}

async function levelOf(userId: number | undefined, pageId: number): Promise<Seen> {
  for (const level of ['owner', 'editor', 'commenter', 'viewer'] as const) {
    if (await storage.checkPagePermission(userId, pageId, level)) return level;
  }
  return 'none';
}
async function accessTable(): Promise<Record<string, Seen[]>> {
  const table: Record<string, Seen[]> = {};
  for (const shape of SHAPES) {
    table[shape] = [];
    for (const key of PEOPLE) {
      table[shape].push(await levelOf(key === 'out' ? undefined : person[key], pageOf[shape]));
    }
  }
  return table;
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`DROP SCHEMA IF EXISTS ${FRESH_SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  await admin.query(`CREATE SCHEMA ${FRESH_SCHEMA}`);
  scoped = new Pool({ connectionString: urlFor(SCHEMA) });
  fresh = new Pool({ connectionString: urlFor(FRESH_SCHEMA) });
  await scoped.query(TABLES);
  defaultOrg = await addOrganizations(scoped);
  acmeOrg = Number(
    (await one(`INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`)).id
  );
  process.env.DATABASE_URL = urlFor(SCHEMA);
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
});

/** Every test starts from the previous release's shape: teams without the column. */
beforeEach(async () => {
  await scoped.query(`ALTER TABLE teams DROP COLUMN IF EXISTS members_can_edit`);
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await fresh?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`DROP SCHEMA IF EXISTS ${FRESH_SCHEMA} CASCADE`);
  await admin.end();
});

async function seedTeams() {
  await scoped.query(`TRUNCATE team_members, wiki_pages, teams RESTART IDENTITY CASCADE`);
  for (const [name, org, active] of [
    ['alpha', defaultOrg, true],
    ['beta', defaultOrg, true],
    ['retired', defaultOrg, false],
    ['acme-team', acmeOrg, true],
  ] as Array<[string, number, boolean]>) {
    await scoped.query(
      `INSERT INTO teams (name, display_name, organization_id, is_active) VALUES ($1, $1, $2, $3)`,
      [name, org, active]
    );
  }
}

describe('0031 up', () => {
  it('adds the column NOT NULL default false, every existing team reads false, and says how many', async () => {
    await seedTeams();
    const notices = await run(UP);
    expect(await column()).toEqual({
      data_type: 'boolean',
      is_nullable: 'NO',
      column_default: 'false',
    });
    expect(await flags()).toEqual([
      'alpha:false',
      'beta:false',
      'retired:false',
      'acme-team:false',
    ]);
    expect(notices.filter((message) => message.startsWith('0031'))).toEqual([
      expect.stringMatching(/^0031 .*\b4\b.* team\(s\).*false/),
    ]);
  });

  it('a second run changes nothing, and a team an owner turned on since keeps its value', async () => {
    await seedTeams();
    await run(UP);
    await scoped.query(`UPDATE teams SET members_can_edit = TRUE WHERE name = 'beta'`);
    const before = await flags();
    const notices = await run(UP);
    expect(await flags()).toEqual(before);
    expect(before).toContain('beta:true');
    expect(notices.filter((message) => message.startsWith('0031'))).toEqual([
      expect.stringMatching(/^0031 .*already/),
    ]);
  });

  it('push first: when the column already exists as the schema defines it, the existing teams are off and the migration changes nothing', async () => {
    await seedTeams();
    // What `drizzle-kit push` does to a table that already has rows
    await scoped.query(
      `ALTER TABLE teams ADD COLUMN members_can_edit boolean DEFAULT false NOT NULL`
    );
    expect(await flags()).toEqual([
      'alpha:false',
      'beta:false',
      'retired:false',
      'acme-team:false',
    ]);
    await scoped.query(`UPDATE teams SET members_can_edit = TRUE WHERE name = 'beta'`);
    await run(UP);
    expect(await flags()).toEqual(['alpha:false', 'beta:true', 'retired:false', 'acme-team:false']);
  });

  it('a team created after the migration through the application is on; a raw insert without the column is off', async () => {
    await seedTeams();
    await run(UP);
    await scoped.query(
      `INSERT INTO teams (name, display_name, organization_id) VALUES ('raw', 'raw', $1)`,
      [defaultOrg]
    );
    const created = await storage.createTeam({ name: 'api', displayName: 'api' }, defaultOrg);
    expect(created.membersCanEdit).toBe(true);
    expect(await flags()).toEqual([
      'alpha:false',
      'beta:false',
      'retired:false',
      'acme-team:false',
      'raw:false',
      'api:true',
    ]);
  });

  it('leaves a database without the teams table alone (a fresh install: push creates it)', async () => {
    const notices = await run(UP, fresh);
    expect(notices.filter((message) => message.startsWith('0031'))).toEqual([]);
    expect(await rows(`SELECT to_regclass('teams') AS t`, [], fresh)).toEqual([{ t: null }]);
  });
});

describe('the default of the column stays false', () => {
  it('the schema definition is NOT NULL with default false (a push of a default true would turn every existing team on)', () => {
    const column = getTableConfig(teams).columns.find((c) => c.name === 'members_can_edit');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
    expect(column!.hasDefault).toBe(true);
    expect(column!.default).toBe(false);
  });

  it('the migration warns when the existing column has another default, and stays quiet otherwise', async () => {
    await seedTeams();
    await scoped.query(
      `ALTER TABLE teams ADD COLUMN members_can_edit boolean DEFAULT false NOT NULL`
    );
    const quiet = await run(UP);
    expect(quiet.filter((m) => m.includes('WARNING'))).toEqual([]);
    await scoped.query(`ALTER TABLE teams ALTER COLUMN members_can_edit SET DEFAULT true`);
    const warned = await run(UP);
    expect(warned.filter((m) => m.startsWith('0031') && m.includes('WARNING'))).toEqual([
      expect.stringMatching(/default true instead of false/),
    ]);
    expect(await flags()).toEqual([
      'alpha:false',
      'beta:false',
      'retired:false',
      'acme-team:false',
    ]);
  });
});

describe('0031 down', () => {
  it('drops the column, says how many teams had it on, and up applies again with every team off', async () => {
    await seedTeams();
    await run(UP);
    await scoped.query(
      `UPDATE teams SET members_can_edit = TRUE WHERE name IN ('alpha', 'acme-team')`
    );
    const notices = await run(DOWN);
    expect(await column()).toBeUndefined();
    expect(notices.filter((message) => message.startsWith('0031'))).toEqual([
      expect.stringMatching(/^0031 down: .*\b2\b.* team\(s\)/),
    ]);
    expect((await rows(`SELECT count(*)::int AS n FROM teams`))[0].n).toBe(4);
    await run(UP);
    expect(await flags()).toEqual([
      'alpha:false',
      'beta:false',
      'retired:false',
      'acme-team:false',
    ]);
  });

  it('does nothing when the column or the table is not there', async () => {
    await seedTeams();
    await run(DOWN);
    await run(DOWN);
    await run(DOWN, fresh);
    expect(await column()).toBeUndefined();
  });
});

describe('what every caller may do, before and after the upgrade', () => {
  it('the previous release’s rule, on the shapes below, is the "before" table', async () => {
    // The table is data; this guards its shape: one row per page shape, one column per caller.
    for (const shape of SHAPES) expect(BEFORE[shape]).toHaveLength(PEOPLE.length);
  });

  it('after the upgrade every caller holds what it held before, on every shape; only turning a team on lifts its plain members to editor', async () => {
    await seedAccessCast();
    // The previous release has no column: the accessor is the same code, so the "before" run is
    // the table above. Here: apply the migration to this database and compare.
    await run(UP);
    expect(await accessTable()).toEqual(BEFORE);

    // The owner turns T on: only plain members of T move, and only to editor
    await scoped.query(`UPDATE teams SET members_can_edit = TRUE WHERE id = $1`, [teamT]);
    const after = await accessTable();
    const rank: Record<Seen, number> = { none: 0, viewer: 1, commenter: 2, editor: 3, owner: 4 };
    for (const shape of SHAPES) {
      PEOPLE.forEach((key, index) => {
        const was = BEFORE[shape][index];
        const now = after[shape][index];
        const lifted = (key === 'member' || key === 'member2') && shape !== 'team-less, no grants';
        if (lifted) {
          expect(now, `${key} on "${shape}"`).toBe(rank[was] >= rank.editor ? was : 'editor');
        } else {
          expect(now, `${key} on "${shape}"`).toBe(was);
        }
      });
    }
    // Back off: exactly the table of before again
    await scoped.query(`UPDATE teams SET members_can_edit = FALSE WHERE id = $1`, [teamT]);
    expect(await accessTable()).toEqual(BEFORE);
  });

  it('with the order of the deploy reversed (push created the column first) the table is the same', async () => {
    await seedAccessCast();
    await scoped.query(
      `ALTER TABLE teams ADD COLUMN members_can_edit boolean DEFAULT false NOT NULL`
    );
    expect(await accessTable()).toEqual(BEFORE);
    await run(UP);
    expect(await accessTable()).toEqual(BEFORE);
  });
});
