/**
 * Layer 4: AI access per organization member against real Postgres (issue #124 X1c P5a).
 *
 * drizzle/0025_add_organization_member_ai_access.sql adds organization_members.ai_allowed:
 *   - on an upgraded database (0022 and 0024 applied) the column is added and every existing
 *     membership row, in every organization, is granted: members keep AI as they have it;
 *   - running it again changes nothing, a later revocation is kept;
 *   - a row inserted afterwards without naming the column is not granted;
 *   - on a database without organization_members it does nothing, and where the column already
 *     exists (a schema push created it) it changes nothing;
 *   - it applies after 0022, 0023 and 0024 in one transaction, as
 *     scripts/apply-organizations-schema.mjs runs them.
 * The down file refuses, and changes nothing, while any member lacks AI access, whether or not
 * the organization has AI on; with every member granted it drops the column, and 0025 applies
 * again afterwards.
 * Every place DBStorage writes a membership row states the value: sign-up and the default
 * organization join grant, the first owner of a new organization is granted on both branches of
 * the move, role changes keep the stored value, removal deletes the row.
 * DBStorage.setOrganizationMemberAiAccess runs under the organization lock and reads the actor
 * and the target again after taking it.
 *
 * Every scenario has its own schema, so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const read = (name: string) =>
  readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), 'utf8');
const M0022 = read('0022_add_organizations.sql');
const M0023 = read('0023_add_template_organizations.sql');
const M0024 = read('0024_add_organization_ai_setting.sql');
const UP = read('0025_add_organization_member_ai_access.sql');
const DOWN = read('0025_add_organization_member_ai_access.down.sql');

const SCHEMAS = {
  upgrade: 'l4_x1c_p5_upgrade',
  noTable: 'l4_x1c_p5_notable',
  chain: 'l4_x1c_p5_chain',
  pushed: 'l4_x1c_p5_pushed',
  down: 'l4_x1c_p5_down',
  storage: 'l4_x1c_p5_storage',
};
const urlFor = (schema: string) => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
};

const BASE_TABLES = `
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

// What the storage scenario needs besides the base tables: the organization routes read and
// write team memberships, roster rows, page grants and comments.
const STORAGE_TABLES = `
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
  CREATE TABLE page_permissions (
    id SERIAL PRIMARY KEY, page_id INTEGER NOT NULL, entity_type TEXT NOT NULL,
    entity_id INTEGER, permission TEXT NOT NULL, granted_by INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE comments (
    id SERIAL PRIMARY KEY, content TEXT NOT NULL, author TEXT NOT NULL,
    author_user_id INTEGER, page_id INTEGER NOT NULL, parent_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

let admin: Pool;
const pools: Record<string, Pool> = {};
let storage: any;
let defaultId: number;

const run = (pool: Pool, text: string) => pool.query(text);
const hasColumn = async (pool: Pool) =>
  (
    await pool.query(
      `SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('organization_members')
          AND attname = 'ai_allowed' AND NOT attisdropped`
    )
  ).rowCount === 1;
const grants = async (pool: Pool) =>
  (
    await pool.query(`SELECT user_id, ai_allowed FROM organization_members ORDER BY user_id`)
  ).rows.map((row: any) => [Number(row.user_id), row.ai_allowed]);

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  for (const schema of Object.values(SCHEMAS)) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    pools[schema] = new Pool({ connectionString: urlFor(schema) });
  }

  // An upgraded deployment (0022 and 0024 applied) with members in `default` and a second
  // organization, one of them an owner.
  const upgrade = pools[SCHEMAS.upgrade];
  await run(upgrade, BASE_TABLES);
  await run(
    upgrade,
    `INSERT INTO users (id, name, email) VALUES (1, 'A', 'a@example.com'), (2, 'B', 'b@example.com'),
       (3, 'C', 'c@example.com')`
  );
  await run(upgrade, M0022);
  await run(upgrade, M0024);
  await run(upgrade, `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme')`);
  await run(
    upgrade,
    `UPDATE organization_members SET organization_id = (SELECT id FROM organizations WHERE slug = 'acme'),
       role = 'owner' WHERE user_id = 3`
  );

  // No organization_members table at all (a fresh install before push).
  await run(pools[SCHEMAS.noTable], BASE_TABLES);

  // The whole chain on a pre-organization database, as the script runs it.
  const chain = pools[SCHEMAS.chain];
  await run(chain, BASE_TABLES);
  await run(
    chain,
    `CREATE TABLE templates (id SERIAL PRIMARY KEY, name TEXT NOT NULL, team_id INTEGER);
     INSERT INTO templates (name) VALUES ('tpl');
     INSERT INTO users (name, email) VALUES ('X', 'x@example.com'), ('Y', 'y@example.com');`
  );

  // A database a schema push already gave the column: rows exist and are not granted.
  const pushed = pools[SCHEMAS.pushed];
  await run(pushed, BASE_TABLES);
  await run(pushed, `INSERT INTO users (id, name, email) VALUES (1, 'P', 'p@example.com')`);
  await run(pushed, M0022);
  await run(
    pushed,
    `ALTER TABLE organization_members ADD COLUMN ai_allowed BOOLEAN NOT NULL DEFAULT FALSE`
  );

  // The down scenario: an upgraded schema with 0025 applied, an organization with AI on and one
  // with AI off.
  const down = pools[SCHEMAS.down];
  await run(down, BASE_TABLES);
  await run(
    down,
    `INSERT INTO users (id, name, email) VALUES (1, 'A', 'a@example.com'), (2, 'B', 'b@example.com'),
       (3, 'C', 'c@example.com')`
  );
  await run(down, M0022);
  await run(down, M0024);
  await run(down, `INSERT INTO organizations (slug, name) VALUES ('quiet', 'Quiet')`); // AI off
  await run(
    down,
    `UPDATE organization_members SET organization_id = (SELECT id FROM organizations WHERE slug = 'quiet')
      WHERE user_id = 3`
  );
  await run(down, UP);

  // Storage scenario, with the fixture the other files use.
  const st = pools[SCHEMAS.storage];
  await run(st, BASE_TABLES);
  await run(st, STORAGE_TABLES);
  defaultId = await addOrganizations(st);
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

describe('migration 0025', () => {
  it('adds the column and grants every existing member, in every organization', async () => {
    const pool = pools[SCHEMAS.upgrade];
    expect(await hasColumn(pool)).toBe(false);
    await run(pool, UP);
    expect(await hasColumn(pool)).toBe(true);
    expect(await grants(pool)).toEqual([
      [1, true],
      [2, true],
      [3, true],
    ]);
  });

  it('keeps a later revocation when it runs again', async () => {
    const pool = pools[SCHEMAS.upgrade];
    await run(pool, `UPDATE organization_members SET ai_allowed = FALSE WHERE user_id = 2`);
    await run(pool, UP);
    expect(await grants(pool)).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ]);
  });

  it('gives a row inserted afterwards without naming the column no access', async () => {
    const pool = pools[SCHEMAS.upgrade];
    await run(pool, `INSERT INTO users (id, name, email) VALUES (9, 'N', 'n@example.com')`);
    await run(
      pool,
      `INSERT INTO organization_members (organization_id, user_id, role)
       SELECT id, 9, 'member' FROM organizations WHERE slug = 'default'`
    );
    expect((await grants(pool)).find(([id]) => id === 9)).toEqual([9, false]);
  });

  it('does nothing without an organization_members table', async () => {
    const pool = pools[SCHEMAS.noTable];
    await run(pool, UP);
    expect(
      (await pool.query(`SELECT to_regclass('organization_members') AS t`)).rows[0].t
    ).toBeNull();
  });

  it('applies after 0022, 0023 and 0024 in one transaction and grants every account', async () => {
    const pool = pools[SCHEMAS.chain];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const file of [M0022, M0023, M0024, UP]) await client.query(file);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect(await hasColumn(pool)).toBe(true);
    const rows = await grants(pool);
    expect(rows).toHaveLength(2);
    expect(rows.every(([, granted]) => granted === true)).toBe(true);
  });

  it('changes nothing where the column already exists (a push created it)', async () => {
    const pool = pools[SCHEMAS.pushed];
    expect(await grants(pool)).toEqual([[1, false]]);
    await run(pool, UP);
    expect(await grants(pool)).toEqual([[1, false]]);
  });
});

describe('migration 0025 down', () => {
  const pool = () => pools[SCHEMAS.down];

  it('refuses while any member lacks AI access in an organization with AI on', async () => {
    await run(pool(), `UPDATE organization_members SET ai_allowed = FALSE WHERE user_id = 2`);
    await expect(run(pool(), DOWN)).rejects.toThrow(/a member does not have AI access/);
    expect(await hasColumn(pool())).toBe(true);
    expect(await grants(pool())).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ]);
  });

  it('refuses while a member lacks AI access in an organization with AI off', async () => {
    await run(pool(), `UPDATE organization_members SET ai_allowed = TRUE`);
    await run(pool(), `UPDATE organization_members SET ai_allowed = FALSE WHERE user_id = 3`);
    const quiet = (await pool().query(`SELECT ai_enabled FROM organizations WHERE slug = 'quiet'`))
      .rows[0];
    expect(quiet.ai_enabled).toBe(false);
    await expect(run(pool(), DOWN)).rejects.toThrow(/a member does not have AI access/);
    expect(await hasColumn(pool())).toBe(true);
  });

  it('drops the column when every member has AI access, and 0025 applies again', async () => {
    await run(pool(), `UPDATE organization_members SET ai_allowed = TRUE`);
    await run(pool(), DOWN);
    expect(await hasColumn(pool())).toBe(false);
    await run(pool(), DOWN); // no-op without the column
    await run(pool(), UP);
    expect(await grants(pool())).toEqual([
      [1, true],
      [2, true],
      [3, true],
    ]);
  });

  it('does nothing without the table', async () => {
    await run(pools[SCHEMAS.noTable], DOWN);
  });
});

// ---------------------------------------------------------------------------------------------

const aiOf = async (userId: number) =>
  (
    await pools[SCHEMAS.storage].query(
      `SELECT ai_allowed FROM organization_members WHERE user_id = $1`,
      [userId]
    )
  ).rows[0]?.ai_allowed ?? null;
const st = () => pools[SCHEMAS.storage];
let counter = 0;
async function newUser(label: string) {
  counter += 1;
  const email = `${label}-${counter}@example.com`;
  // the fixture's trigger places it in `default` with AI access, as sign-up does
  const { rows } = await st().query(
    `INSERT INTO users (name, email) VALUES ($1, $1) RETURNING id`,
    [email]
  );
  return { id: Number(rows[0].id), email };
}
async function newOrganization(slug: string) {
  const { rows } = await st().query(
    `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
    [slug]
  );
  return Number(rows[0].id);
}
async function placeIn(userId: number, organizationId: number, roleName: string, ai: boolean) {
  await st().query(
    `UPDATE organization_members SET organization_id = $1, role = $2, ai_allowed = $3 WHERE user_id = $4`,
    [organizationId, roleName, ai, userId]
  );
}

describe('every write of a membership row states AI access', () => {
  it('createUserInDefaultOrganization grants', async () => {
    const { createUserInDefaultOrganization } = await import('../../server/organizations.js');
    await st().query(`ALTER TABLE users DISABLE TRIGGER l4_join_default_organization`);
    try {
      const user = await createUserInDefaultOrganization(storage.db, {
        name: 'Signup',
        email: 'signup@example.com',
      } as any);
      expect(await aiOf(user.id)).toBe(true);
      expect(await storage.getOrganizationMembership(user.id)).toEqual({
        organizationId: defaultId,
        role: 'member',
        aiAllowed: true,
      });
    } finally {
      await st().query(`ALTER TABLE users ENABLE TRIGGER l4_join_default_organization`);
    }
  });

  it('joinDefaultOrganization grants', async () => {
    const user = await newUser('join');
    await st().query(`DELETE FROM organization_members WHERE user_id = $1`, [user.id]);
    expect(await storage.joinDefaultOrganization(user.id)).toBe(defaultId);
    expect(await aiOf(user.id)).toBe(true);
  });

  it('createOrganizationWithOwner grants the first owner moved from an organization, whatever the source row held', async () => {
    const user = await newUser('mover');
    await st().query(`UPDATE organization_members SET ai_allowed = FALSE WHERE user_id = $1`, [
      user.id,
    ]);
    const result = await storage.createOrganizationWithOwner({
      name: 'Moved',
      slug: 'moved',
      ownerEmail: user.email,
    });
    expect(result.kind).toBe('created');
    expect(await aiOf(user.id)).toBe(true);
    expect(await storage.getOrganizationMembership(user.id)).toEqual({
      organizationId: result.organization.id,
      role: 'owner',
      aiAllowed: true,
    });
  });

  it('createOrganizationWithOwner grants the first owner who had no membership', async () => {
    const user = await newUser('loner');
    await st().query(`DELETE FROM organization_members WHERE user_id = $1`, [user.id]);
    const result = await storage.createOrganizationWithOwner({
      name: 'Loner Org',
      slug: 'loner-org',
      ownerEmail: user.email,
    });
    expect(result.kind).toBe('created');
    expect(await aiOf(user.id)).toBe(true);
  });

  it('promoteFirstOrganizationOwner keeps the stored value, FALSE and TRUE alike', async () => {
    const orgId = await newOrganization('promote-org');
    const without = await newUser('promote-no');
    const withAi = await newUser('promote-yes');
    await placeIn(without.id, orgId, 'member', false);
    await placeIn(withAi.id, orgId, 'member', true);
    expect(await storage.promoteFirstOrganizationOwner(orgId, without.email)).toMatchObject({
      kind: 'promoted',
    });
    expect(await aiOf(without.id)).toBe(false);
    const orgTwo = await newOrganization('promote-org-2');
    await placeIn(withAi.id, orgTwo, 'member', true);
    expect(await storage.promoteFirstOrganizationOwner(orgTwo, withAi.email)).toMatchObject({
      kind: 'promoted',
    });
    expect(await aiOf(withAi.id)).toBe(true);
  });

  it('changeOrganizationMemberRole keeps the stored value, FALSE and TRUE alike', async () => {
    const orgId = await newOrganization('role-org');
    const owner = await newUser('role-owner');
    const off = await newUser('role-off');
    const on = await newUser('role-on');
    await placeIn(owner.id, orgId, 'owner', true);
    await placeIn(off.id, orgId, 'member', false);
    await placeIn(on.id, orgId, 'member', true);
    for (const target of [off.id, on.id]) {
      const result = await storage.changeOrganizationMemberRole(orgId, owner.id, target, 'admin');
      expect(result).toMatchObject({ ok: true });
    }
    expect(await aiOf(off.id)).toBe(false);
    expect(await aiOf(on.id)).toBe(true);
  });

  it('removeOrganizationMember leaves no row, and a return starts without access', async () => {
    const orgId = await newOrganization('remove-org');
    const owner = await newUser('remove-owner');
    const target = await newUser('remove-target');
    await placeIn(owner.id, orgId, 'owner', true);
    await placeIn(target.id, orgId, 'member', true);
    expect(await storage.removeOrganizationMember(orgId, owner.id, target.id)).toMatchObject({
      ok: true,
    });
    expect(await aiOf(target.id)).toBeNull();
    // a row written later without naming the column is not granted
    await st().query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'member')`,
      [orgId, target.id]
    );
    expect(await aiOf(target.id)).toBe(false);
  });

  it('getOrganizationMembership and listOrganizationMembers return the stored value', async () => {
    const orgId = await newOrganization('read-org');
    const on = await newUser('read-on');
    const off = await newUser('read-off');
    await placeIn(on.id, orgId, 'owner', true);
    await placeIn(off.id, orgId, 'member', false);
    expect(await storage.getOrganizationMembership(on.id)).toMatchObject({ aiAllowed: true });
    expect(await storage.getOrganizationMembership(off.id)).toMatchObject({ aiAllowed: false });
    const listed = await storage.listOrganizationMembers(orgId);
    expect(listed.map((row: any) => [row.userId, row.aiAllowed])).toEqual([
      [on.id, true],
      [off.id, false],
    ]);
  });

  it('updateOrganizationSettings returns the actor own value', async () => {
    const orgId = await newOrganization('settings-org');
    const admin = await newUser('settings-admin');
    await placeIn(admin.id, orgId, 'admin', false);
    const result = await storage.updateOrganizationSettings(orgId, admin.id, { aiEnabled: true });
    expect(result).toMatchObject({ ok: true, value: { role: 'admin', aiAllowed: false } });
  });
});

describe('setOrganizationMemberAiAccess', () => {
  let orgId: number;
  let otherOrgId: number;
  let owner: { id: number; email: string };
  let admin1: { id: number; email: string };
  let member: { id: number; email: string };
  let sibling: { id: number; email: string };
  let outsider: { id: number; email: string };

  beforeAll(async () => {
    orgId = await newOrganization('grant-org');
    otherOrgId = await newOrganization('grant-other');
    owner = await newUser('g-owner');
    admin1 = await newUser('g-admin');
    member = await newUser('g-member');
    sibling = await newUser('g-sibling');
    outsider = await newUser('g-outsider');
    await placeIn(owner.id, orgId, 'owner', true);
    await placeIn(admin1.id, orgId, 'admin', true);
    await placeIn(member.id, orgId, 'member', false);
    await placeIn(sibling.id, orgId, 'member', false);
    await placeIn(outsider.id, otherOrgId, 'member', false);
  });

  it('writes only the target row of this organization', async () => {
    const result = await storage.setOrganizationMemberAiAccess(orgId, owner.id, member.id, true);
    expect(result).toEqual({ ok: true, value: { userId: member.id, aiAllowed: true } });
    expect(await aiOf(member.id)).toBe(true);
    expect(await aiOf(sibling.id)).toBe(false);
    expect(await aiOf(owner.id)).toBe(true);
    expect(await aiOf(outsider.id)).toBe(false);
    await storage.setOrganizationMemberAiAccess(orgId, admin1.id, member.id, false);
    expect(await aiOf(member.id)).toBe(false);
  });

  it('a target in another organization is 404, even for an owner, and nothing is written', async () => {
    const result = await storage.setOrganizationMemberAiAccess(orgId, owner.id, outsider.id, true);
    expect(result).toEqual({ ok: false, status: 404, body: { message: 'Member not found' } });
    expect(await aiOf(outsider.id)).toBe(false);
    const unknown = await storage.setOrganizationMemberAiAccess(orgId, owner.id, 987654, true);
    expect(unknown).toMatchObject({ ok: false, status: 404 });
  });

  it('an actor of another organization or a plain member is refused', async () => {
    expect(
      await storage.setOrganizationMemberAiAccess(orgId, outsider.id, member.id, true)
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      await storage.setOrganizationMemberAiAccess(orgId, sibling.id, member.id, true)
    ).toMatchObject({ ok: false, status: 403 });
    expect(await aiOf(member.id)).toBe(false);
  });

  it('an admin may revoke itself but not grant itself back', async () => {
    expect(
      await storage.setOrganizationMemberAiAccess(orgId, admin1.id, admin1.id, false)
    ).toMatchObject({ ok: true });
    expect(await aiOf(admin1.id)).toBe(false);
    expect(await storage.setOrganizationMemberAiAccess(orgId, admin1.id, admin1.id, true)).toEqual({
      ok: false,
      status: 403,
      body: { message: 'You cannot grant AI access to yourself' },
    });
    expect(await aiOf(admin1.id)).toBe(false);
    // an owner may
    expect(
      await storage.setOrganizationMemberAiAccess(orgId, owner.id, admin1.id, true)
    ).toMatchObject({ ok: true });
    expect(await aiOf(admin1.id)).toBe(true);
  });

  it('a deactivated actor is refused', async () => {
    await st().query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [admin1.id]);
    try {
      expect(
        await storage.setOrganizationMemberAiAccess(orgId, admin1.id, member.id, true)
      ).toMatchObject({ ok: false, status: 403 });
    } finally {
      await st().query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [admin1.id]);
    }
  });

  it('re-reads the target under the lock: a promotion committed while the grant waits refuses it', async () => {
    // admin1 may change a plain member; sibling is promoted to admin while the grant waits.
    await placeIn(admin1.id, orgId, 'admin', true);
    const holder = await st().connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `organization-members:${orgId}`,
      ]);
      const pending = storage.setOrganizationMemberAiAccess(orgId, admin1.id, sibling.id, true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await holder.query(`UPDATE organization_members SET role = 'admin' WHERE user_id = $1`, [
        sibling.id,
      ]);
      await holder.query('COMMIT');
      expect(await pending).toEqual({
        ok: false,
        status: 403,
        body: { message: 'Only an organization owner can change AI access for an owner or admin' },
      });
      expect(await aiOf(sibling.id)).toBe(false);
    } finally {
      holder.release();
      await placeIn(sibling.id, orgId, 'member', false);
    }
  });

  it('throws OrganizationBusyError while the lock is held past the timeout', async () => {
    // The route uses the default 5 s timeout; a stored method has no option, so hold the lock
    // for longer than that and check the typed error.
    const { OrganizationBusyError } = await import('../../server/storage.js');
    const holder = await st().connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `organization-members:${orgId}`,
      ]);
      await expect(
        storage.setOrganizationMemberAiAccess(orgId, owner.id, member.id, true)
      ).rejects.toBeInstanceOf(OrganizationBusyError);
      expect(await aiOf(member.id)).toBe(false);
    } finally {
      await holder.query('ROLLBACK').catch(() => {});
      holder.release();
    }
  }, 15_000);
});
