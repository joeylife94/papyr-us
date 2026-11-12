/**
 * Layer 4: platform admin organization management against real Postgres (issue #124 X1c P1).
 *
 * DBStorage on tables in the shape of 0022/0024:
 * - getAccountFootprintOutside: a fresh account has none; one row of each kind gives exactly
 *   that reason; the same rows inside the target organization give none;
 * - createOrganizationWithOwner: moves the account's membership into the new organization as
 *   owner with AI off, creates the membership of an account that has none, refuses an unknown
 *   or inactive account and an account with a footprint without leaving an organization behind,
 *   and surfaces a taken slug as a unique violation;
 * - promoteFirstOrganizationOwner: only an existing member of that organization, only while it
 *   has no owner, and of two concurrent calls exactly one wins;
 * - listOrganizationsForAdmin: counts per organization, by id.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_x1c_p1';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let scoped: Pool;
let storage: any;
let postgresErrorOf: (error: unknown) => { code: string; constraint?: string } | null;
let defaultOrg = 0;
let counter = 0;

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
  CREATE TABLE comments (
    id SERIAL PRIMARY KEY, content TEXT NOT NULL, author TEXT NOT NULL,
    author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE, parent_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

async function newUser(label: string, isActive = true) {
  counter += 1;
  const email = `${label}-${counter}@example.com`;
  const { rows } = await scoped.query(
    `INSERT INTO users (name, email, is_active) VALUES ($1, $1, $2) RETURNING id`,
    [email, isActive]
  );
  return { id: Number(rows[0].id), email };
}

async function newOrganization(slug: string): Promise<number> {
  const { rows } = await scoped.query(
    `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
    [slug]
  );
  return Number(rows[0].id);
}

async function newTeam(organizationId: number): Promise<number> {
  counter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO teams (name, display_name, organization_id) VALUES ($1, $1, $2) RETURNING id`,
    [`team-${counter}`, organizationId]
  );
  return Number(rows[0].id);
}

async function newPage(organizationId: number, author: string, trashed = false): Promise<number> {
  counter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, organization_id, deleted_at)
     VALUES ($1, $1, 'x', $2, $3, CASE WHEN $4 THEN NOW() ELSE NULL END) RETURNING id`,
    [`page-${counter}`, author, organizationId, trashed]
  );
  return Number(rows[0].id);
}

async function membershipOf(userId: number) {
  const { rows } = await scoped.query(
    `SELECT organization_id, role FROM organization_members WHERE user_id = $1`,
    [userId]
  );
  return rows.map((row: any) => ({ organizationId: Number(row.organization_id), role: row.role }));
}

async function organizationCount() {
  const { rows } = await scoped.query(`SELECT count(*)::int AS n FROM organizations`);
  return rows[0].n as number;
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(TABLES);
  defaultOrg = await addOrganizations(scoped);

  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
  ({ postgresErrorOf } = await import('../../server/db-errors.js'));
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('getAccountFootprintOutside', () => {
  it('is empty for a fresh account (default organization, member, nothing done)', async () => {
    const target = await newOrganization('fp-target-fresh');
    const user = await newUser('fresh');
    expect(await storage.getAccountFootprintOutside(user.id, target)).toEqual([]);
  });

  it('is empty for an unknown account', async () => {
    const target = await newOrganization('fp-target-unknown');
    expect(await storage.getAccountFootprintOutside(987654, target)).toEqual([]);
  });

  type Setup = (user: { id: number; email: string }) => Promise<void>;
  const kinds: Array<[string, Setup]> = [
    [
      'holds_role',
      async (u) => {
        await scoped.query(`UPDATE organization_members SET role = 'admin' WHERE user_id = $1`, [
          u.id,
        ]);
      },
    ],
    [
      'team_memberships',
      async (u) => {
        const team = await newTeam(defaultOrg);
        await scoped.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [
          team,
          u.id,
        ]);
      },
    ],
    [
      'authored_pages',
      async (u) => {
        await newPage(defaultOrg, u.email, true);
      },
    ],
    [
      'page_grants',
      async (u) => {
        const page = await newPage(defaultOrg, 'someone-else@example.com');
        await scoped.query(
          `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
           VALUES ($1, 'user', $2, 'viewer')`,
          [page, u.id]
        );
      },
    ],
    [
      'comments',
      async (u) => {
        const page = await newPage(defaultOrg, 'someone-else@example.com');
        await scoped.query(
          `INSERT INTO comments (content, author, author_user_id, page_id)
           VALUES ('c', $1, $2, $3)`,
          [u.email, u.id, page]
        );
      },
    ],
    [
      'roster_rows',
      async (u) => {
        await scoped.query(`INSERT INTO members (name, email, role) VALUES ($1, $1, 'dev')`, [
          u.email,
        ]);
      },
    ],
  ];

  it.each(kinds)('%s alone gives exactly that reason', async (reason, setup) => {
    const target = await newOrganization(`fp-target-${reason}`);
    const user = await newUser(reason);
    await setup(user);
    expect(await storage.getAccountFootprintOutside(user.id, target)).toEqual([reason]);
  });

  it('a roster row on a team of another organization is a reason; on a team of the target is not', async () => {
    const target = await newOrganization('fp-target-roster');
    const targetTeam = await newTeam(target);
    const otherTeam = await newTeam(defaultOrg);
    const outside = await newUser('roster-out');
    const inside = await newUser('roster-in');
    await scoped.query(
      `INSERT INTO members (name, email, role, team_id) VALUES ($1, $1, 'd', $2)`,
      [outside.email, otherTeam]
    );
    await scoped.query(
      `INSERT INTO members (name, email, role, team_id) VALUES ($1, $1, 'd', $2)`,
      [inside.email, targetTeam]
    );
    expect(await storage.getAccountFootprintOutside(outside.id, target)).toEqual(['roster_rows']);
    expect(await storage.getAccountFootprintOutside(inside.id, target)).toEqual([]);
  });

  it('reports every reason an account has, in a fixed order', async () => {
    const target = await newOrganization('fp-target-all');
    const user = await newUser('everything');
    for (const [, setup] of kinds) await setup(user);
    expect(await storage.getAccountFootprintOutside(user.id, target)).toEqual(
      kinds.map(([reason]) => reason)
    );
  });

  it('rows inside the target organization are not a footprint', async () => {
    const target = await newOrganization('fp-target-inside');
    const user = await newUser('inside');
    // Everything below belongs to the target organization, the account's own.
    await scoped.query(
      `UPDATE organization_members SET organization_id = $1, role = 'owner' WHERE user_id = $2`,
      [target, user.id]
    );
    const team = await newTeam(target);
    await scoped.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [
      team,
      user.id,
    ]);
    const page = await newPage(target, user.email);
    await scoped.query(
      `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
       VALUES ($1, 'user', $2, 'owner')`,
      [page, user.id]
    );
    await scoped.query(
      `INSERT INTO comments (content, author, author_user_id, page_id) VALUES ('c', $1, $2, $3)`,
      [user.email, user.id, page]
    );
    await scoped.query(
      `INSERT INTO members (name, email, role, team_id) VALUES ($1, $1, 'd', $2)`,
      [user.email, team]
    );
    expect(await storage.getAccountFootprintOutside(user.id, target)).toEqual([]);
  });

  it('a grant of another kind with the same id is not a user grant', async () => {
    const target = await newOrganization('fp-target-teamgrant');
    const user = await newUser('teamgrant');
    const page = await newPage(defaultOrg, 'someone-else@example.com');
    await scoped.query(
      `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
       VALUES ($1, 'team', $2, 'viewer')`,
      [page, user.id]
    );
    expect(await storage.getAccountFootprintOutside(user.id, target)).toEqual([]);
  });
});

describe('createOrganizationWithOwner', () => {
  it('moves the membership into the new organization as owner, AI off', async () => {
    const user = await newUser('owner-fresh');
    const before = await organizationCount();
    const result = await storage.createOrganizationWithOwner({
      name: 'Acme',
      slug: 'acme',
      ownerEmail: user.email,
    });
    expect(result.kind).toBe('created');
    expect(result.organization).toMatchObject({ slug: 'acme', name: 'Acme', aiEnabled: false });
    expect(result.owner).toEqual({ userId: user.id, email: user.email });
    expect(await organizationCount()).toBe(before + 1);
    expect(await membershipOf(user.id)).toEqual([
      { organizationId: result.organization.id, role: 'owner' },
    ]);
    const { rows } = await scoped.query(`SELECT ai_enabled FROM organizations WHERE slug = 'acme'`);
    expect(rows[0].ai_enabled).toBe(false);
    expect(await storage.getOrganizationMembership(user.id)).toEqual({
      organizationId: result.organization.id,
      role: 'owner',
    });
  });

  it('leaves the other members of the source organization where they are', async () => {
    const owner = await newUser('mover');
    const stayer = await newUser('stayer');
    await storage.createOrganizationWithOwner({
      name: 'Mover Org',
      slug: 'mover-org',
      ownerEmail: owner.email,
    });
    expect(await membershipOf(stayer.id)).toEqual([{ organizationId: defaultOrg, role: 'member' }]);
  });

  it('creates the membership of an account that has none', async () => {
    const user = await newUser('no-membership');
    await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [user.id]);
    const result = await storage.createOrganizationWithOwner({
      name: 'Orphan Org',
      slug: 'orphan-org',
      ownerEmail: user.email,
    });
    expect(result.kind).toBe('created');
    expect(await membershipOf(user.id)).toEqual([
      { organizationId: result.organization.id, role: 'owner' },
    ]);
  });

  it('does not match an email by case or by prefix', async () => {
    const user = await newUser('Exact');
    const before = await organizationCount();
    for (const ownerEmail of [user.email.toLowerCase(), user.email.slice(0, -4), 'nobody@x.org']) {
      expect(
        await storage.createOrganizationWithOwner({ name: 'N', slug: 'no-match', ownerEmail })
      ).toEqual({ kind: 'user_not_found' });
    }
    expect(await organizationCount()).toBe(before);
  });

  it('refuses an inactive account', async () => {
    const user = await newUser('inactive', false);
    const before = await organizationCount();
    expect(
      await storage.createOrganizationWithOwner({
        name: 'Inactive',
        slug: 'inactive-org',
        ownerEmail: user.email,
      })
    ).toEqual({ kind: 'user_not_found' });
    expect(await organizationCount()).toBe(before);
  });

  it('an ineligible account gets its reasons and no organization is left behind', async () => {
    const user = await newUser('ineligible');
    const team = await newTeam(defaultOrg);
    await scoped.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [team, user.id]
    );
    await newPage(defaultOrg, user.email);
    const before = await organizationCount();
    const result = await storage.createOrganizationWithOwner({
      name: 'Nope',
      slug: 'nope-org',
      ownerEmail: user.email,
    });
    expect(result).toEqual({
      kind: 'not_eligible',
      reasons: ['team_memberships', 'authored_pages'],
    });
    expect(await organizationCount()).toBe(before);
    const { rows } = await scoped.query(`SELECT 1 FROM organizations WHERE slug = 'nope-org'`);
    expect(rows).toHaveLength(0);
    expect(await membershipOf(user.id)).toEqual([{ organizationId: defaultOrg, role: 'member' }]);
  });

  it('an account holding a role elsewhere is refused', async () => {
    const user = await newUser('role-holder');
    await scoped.query(`UPDATE organization_members SET role = 'admin' WHERE user_id = $1`, [
      user.id,
    ]);
    const result = await storage.createOrganizationWithOwner({
      name: 'Role',
      slug: 'role-org',
      ownerEmail: user.email,
    });
    expect(result).toEqual({ kind: 'not_eligible', reasons: ['holds_role'] });
    expect(await membershipOf(user.id)).toEqual([{ organizationId: defaultOrg, role: 'admin' }]);
  });

  it('a taken slug is a unique violation on the slug, and nothing changes', async () => {
    const user = await newUser('dup-slug');
    const before = await organizationCount();
    for (const slug of ['default', 'acme']) {
      const error = await storage
        .createOrganizationWithOwner({ name: 'Dup', slug, ownerEmail: user.email })
        .then(
          () => null,
          (e: unknown) => e
        );
      const pg = postgresErrorOf(error);
      expect(pg?.code).toBe('23505');
      expect(pg?.constraint).toMatch(/slug/);
    }
    expect(await organizationCount()).toBe(before);
    expect(await membershipOf(user.id)).toEqual([{ organizationId: defaultOrg, role: 'member' }]);
  });

  it('two concurrent creations with one slug: one wins, the other is a slug violation', async () => {
    const a = await newUser('race-a');
    const b = await newUser('race-b');
    const results = await Promise.allSettled([
      storage.createOrganizationWithOwner({ name: 'R', slug: 'race-slug', ownerEmail: a.email }),
      storage.createOrganizationWithOwner({ name: 'R', slug: 'race-slug', ownerEmail: b.email }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(postgresErrorOf(rejected.reason)?.code).toBe('23505');
    const { rows } = await scoped.query(`SELECT 1 FROM organizations WHERE slug = 'race-slug'`);
    expect(rows).toHaveLength(1);
  });
});

describe('promoteFirstOrganizationOwner', () => {
  async function organizationWith(slug: string, ...users: Array<{ id: number }>) {
    const id = await newOrganization(slug);
    for (const user of users) {
      await scoped.query(
        `UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`,
        [id, user.id]
      );
    }
    return id;
  }
  const roleOf = async (userId: number) => (await membershipOf(userId))[0]?.role;

  it('promotes a member of an organization without an owner', async () => {
    const m = await newUser('promote');
    const org = await organizationWith('promote-org', m);
    expect(await storage.promoteFirstOrganizationOwner(org, m.email)).toEqual({
      kind: 'promoted',
      userId: m.id,
      email: m.email,
    });
    expect(await roleOf(m.id)).toBe('owner');
  });

  it('refuses when the organization has an owner, and changes nothing', async () => {
    const owner = await newUser('has-owner');
    const m = await newUser('second');
    const org = await organizationWith('has-owner-org', owner, m);
    await scoped.query(`UPDATE organization_members SET role = 'owner' WHERE user_id = $1`, [
      owner.id,
    ]);
    expect(await storage.promoteFirstOrganizationOwner(org, m.email)).toEqual({
      kind: 'has_owner',
    });
    expect(await roleOf(m.id)).toBe('member');
  });

  it('an unknown organization, an unknown email and an account of another organization', async () => {
    const m = await newUser('elsewhere');
    const org = await organizationWith('empty-org');
    expect(await storage.promoteFirstOrganizationOwner(999999, m.email)).toEqual({
      kind: 'organization_not_found',
    });
    expect(await storage.promoteFirstOrganizationOwner(org, 'nobody@example.com')).toEqual({
      kind: 'member_not_found',
    });
    // m belongs to the default organization: never moved, never promoted
    expect(await storage.promoteFirstOrganizationOwner(org, m.email)).toEqual({
      kind: 'member_not_found',
    });
    expect(await membershipOf(m.id)).toEqual([{ organizationId: defaultOrg, role: 'member' }]);
  });

  it('an inactive account is not a member', async () => {
    const m = await newUser('inactive-member', false);
    const org = await organizationWith('inactive-org', m);
    expect(await storage.promoteFirstOrganizationOwner(org, m.email)).toEqual({
      kind: 'member_not_found',
    });
  });

  it('of concurrent calls on an ownerless organization exactly one becomes the first owner', async () => {
    for (let round = 0; round < 5; round += 1) {
      const a = await newUser(`conc-a${round}`);
      const b = await newUser(`conc-b${round}`);
      const org = await organizationWith(`conc-org-${round}`, a, b);
      const results = await Promise.all([
        storage.promoteFirstOrganizationOwner(org, a.email),
        storage.promoteFirstOrganizationOwner(org, b.email),
      ]);
      expect(results.map((r: any) => r.kind).sort()).toEqual(['has_owner', 'promoted']);
      const { rows } = await scoped.query(
        `SELECT count(*)::int AS n FROM organization_members
          WHERE organization_id = $1 AND role = 'owner'`,
        [org]
      );
      expect(rows[0].n).toBe(1);
    }
  });
});

describe('listOrganizationsForAdmin', () => {
  it('lists every organization by id with member and owner counts only', async () => {
    const user = await newUser('listed');
    const created = await storage.createOrganizationWithOwner({
      name: 'Listed',
      slug: 'listed-org',
      ownerEmail: user.email,
    });
    const rows = await storage.listOrganizationsForAdmin();
    expect(rows.map((r: any) => r.id)).toEqual(
      [...rows.map((r: any) => r.id)].sort((a, b) => a - b)
    );
    const listed = rows.find((r: any) => r.id === created.organization.id);
    expect(listed).toEqual({
      id: created.organization.id,
      slug: 'listed-org',
      name: 'Listed',
      isActive: true,
      aiEnabled: false,
      memberCount: 1,
      ownerCount: 1,
      createdAt: expect.any(Date),
    });
    const def = rows.find((r: any) => r.id === defaultOrg);
    expect(def).toMatchObject({ slug: 'default', aiEnabled: true, ownerCount: 0 });
    expect(def.memberCount).toBeGreaterThan(1);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        [
          'aiEnabled',
          'createdAt',
          'id',
          'isActive',
          'memberCount',
          'name',
          'ownerCount',
          'slug',
        ].sort()
      );
    }
  });
});
