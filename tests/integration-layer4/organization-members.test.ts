/**
 * Layer 4: organization member management against real Postgres (issue #124 X1c P2).
 *
 * DBStorage.removeOrganizationMember:
 *   - deletes exactly the membership, the account's team memberships in this organization's
 *     teams and the user grants it holds on this organization's pages; the same account's rows in
 *     another organization, other accounts' rows, team grants that share the id, and the pages it
 *     wrote stay;
 *   - reports the teams of the organization left without an owner;
 *   - refuses (and changes nothing) for self, for another organization's account, for an admin
 *     acting on an admin, and for the last owner.
 * DBStorage.changeOrganizationMemberRole runs under the organization lock:
 *   - two owners each demoting the other: exactly one commits and the organization keeps an owner;
 *   - two owners each lowering itself: exactly one commits, the other gets the last-owner refusal;
 *   - a change waits while another transaction holds the organization's lock.
 * DBStorage.getMemberOrganizationId: a roster row whose account has no organization is in none.
 * DBStorage.updateTeam: the route parses with updateTeamSchema first, so organizationId and id
 * are never written (the raw call is kept as documentation of why the route parses).
 * DBStorage.listOrganizationMembers / listOrganizationTeams: only the organization's own rows.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';
import { updateTeamSchema } from '../../shared/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_x1c_p2';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const OWNER_A = 1;
const OWNER_B = 2;
const MEMBER = 3;
const ADMIN = 4;
const ACME_USER = 5;
const GHOST = 6; // roster row with an account that belongs to no organization
const email = (id: number) => `user${id}@example.com`;

let admin: Pool;
let scoped: Pool;
let storage: any;
let defaultId: number;
let acmeId: number;
const team: Record<string, number> = {};
const page: Record<string, number> = {};

async function one<T = any>(text: string, params: unknown[] = []): Promise<T> {
  return (await scoped.query(text, params)).rows[0];
}
const rows = async (text: string, params: unknown[] = []) =>
  (await scoped.query(text, params)).rows;

async function seed() {
  await scoped.query(`
    TRUNCATE page_permissions, team_members, members, wiki_pages, teams,
             organization_members, users RESTART IDENTITY CASCADE;
  `);
  for (const id of [OWNER_A, OWNER_B, MEMBER, ADMIN, ACME_USER, GHOST]) {
    await scoped.query(`INSERT INTO users (id, name, email) VALUES ($1, $2, $3)`, [
      id,
      `User ${id}`,
      email(id),
    ]);
  }
  await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [GHOST]);
  await scoped.query(`UPDATE organization_members SET role = 'owner' WHERE user_id = ANY($1)`, [
    [OWNER_A, OWNER_B],
  ]);
  await scoped.query(`UPDATE organization_members SET role = 'admin' WHERE user_id = $1`, [ADMIN]);
  await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
    acmeId,
    ACME_USER,
  ]);

  const makeTeam = async (key: string, name: string, organizationId: number, active = true) => {
    team[key] = (
      await one(
        `INSERT INTO teams (name, display_name, organization_id, is_active) VALUES ($1, $1, $2, $3) RETURNING id`,
        [name, organizationId, active]
      )
    ).id;
  };
  await makeTeam('solo', 'solo', defaultId); // MEMBER is its only owner
  await makeTeam('shared', 'shared', defaultId); // two owners
  await makeTeam('idle', 'idle', defaultId, false); // inactive, MEMBER is a plain member
  await makeTeam('acme', 'acme-team', acmeId); // another organization's team
  const joins: Array<[string, number, string]> = [
    ['solo', MEMBER, 'owner'],
    ['shared', MEMBER, 'owner'],
    ['shared', OWNER_A, 'owner'],
    ['idle', MEMBER, 'member'],
    ['idle', OWNER_A, 'owner'],
    ['acme', MEMBER, 'owner'], // a stale row of this account in another organization's team
    ['acme', ACME_USER, 'owner'],
  ];
  for (const [t, u, role] of joins) {
    await scoped.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)`, [
      team[t],
      u,
      role,
    ]);
  }

  const makePage = async (key: string, organizationId: number, author: string, teamId?: number) => {
    page[key] = (
      await one(
        `INSERT INTO wiki_pages (title, slug, content, author, team_id, organization_id)
         VALUES ($1, $1, '', $2, $3, $4) RETURNING id`,
        [key, author, teamId ?? null, organizationId]
      )
    ).id;
  };
  await makePage('default-page', defaultId, email(MEMBER)); // written by MEMBER
  await makePage('default-other', defaultId, email(OWNER_A));
  await makePage('acme-page', acmeId, email(ACME_USER));
  const grants: Array<[string, string, number | null, string]> = [
    ['default-page', 'user', MEMBER, 'editor'], // goes
    ['default-other', 'user', MEMBER, 'viewer'], // goes
    ['default-page', 'user', OWNER_A, 'viewer'], // another account: stays
    ['default-page', 'team', MEMBER, 'viewer'], // team grant that shares the number: stays
    ['default-page', 'public', null, 'viewer'], // stays
    ['acme-page', 'user', MEMBER, 'viewer'], // another organization's page: stays
  ];
  for (const [p, type, entity, permission] of grants) {
    await scoped.query(
      `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission) VALUES ($1, $2, $3, $4)`,
      [page[p], type, entity, permission]
    );
  }
  await scoped.query(
    `INSERT INTO members (name, email, role, team_id) VALUES
       ('Member', $1, 'dev', $2), ('Ghost', $3, 'dev', $2), ('Nobody', 'nobody@example.com', 'dev', $4),
       ('Orphan', 'orphan@example.com', 'dev', NULL)`,
    [email(MEMBER), team.solo, email(GHOST), team.acme]
  );
}

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
    CREATE TABLE page_permissions (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL, entity_id INTEGER, permission TEXT NOT NULL, granted_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  defaultId = await addOrganizations(scoped);
  acmeId = Number(
    (await one(`INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`)).id
  );
  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
});

beforeEach(seed);

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

const roleOf = async (userId: number) =>
  (await one(`SELECT role FROM organization_members WHERE user_id = $1`, [userId]))?.role ?? null;
const snapshot = async () => ({
  members: await rows(
    `SELECT user_id, organization_id, role FROM organization_members ORDER BY user_id`
  ),
  teamMembers: await rows(`SELECT team_id, user_id, role FROM team_members ORDER BY id`),
  grants: await rows(`SELECT page_id, entity_type, entity_id FROM page_permissions ORDER BY id`),
});

describe('removeOrganizationMember', () => {
  it('deletes exactly the membership, the team memberships and the user grants of this organization', async () => {
    const before = await snapshot();
    const result = await storage.removeOrganizationMember(defaultId, OWNER_A, MEMBER);

    expect(result.ok).toBe(true);
    const after = await snapshot();

    // The membership row of MEMBER is gone, nobody else's.
    expect(after.members).toEqual(before.members.filter((r: any) => r.user_id !== MEMBER));
    // Its rows in this organization's teams are gone; its stale row in Acme's team stays.
    expect(after.teamMembers).toEqual(
      before.teamMembers.filter((r: any) => !(r.user_id === MEMBER && r.team_id !== team.acme))
    );
    expect(
      after.teamMembers.some((r: any) => r.user_id === MEMBER && r.team_id === team.acme)
    ).toBe(true);
    // Its user grants on this organization's pages are gone; everything else stays.
    expect(after.grants).toEqual(
      before.grants.filter(
        (r: any) =>
          !(
            r.entity_type === 'user' &&
            r.entity_id === MEMBER &&
            [page['default-page'], page['default-other']].includes(r.page_id)
          )
      )
    );
    expect(after.grants).toContainEqual({
      page_id: page['default-page'],
      entity_type: 'team',
      entity_id: MEMBER,
    });
    expect(after.grants).toContainEqual({
      page_id: page['acme-page'],
      entity_type: 'user',
      entity_id: MEMBER,
    });
  });

  it('leaves what the account wrote and its roster row alone', async () => {
    await storage.removeOrganizationMember(defaultId, OWNER_A, MEMBER);
    expect(
      (await one(`SELECT count(*)::int AS n FROM wiki_pages WHERE author = $1`, [email(MEMBER)])).n
    ).toBe(1);
    expect(
      (await one(`SELECT count(*)::int AS n FROM members WHERE email = $1`, [email(MEMBER)])).n
    ).toBe(1);
    expect((await one(`SELECT is_active FROM users WHERE id = $1`, [MEMBER])).is_active).toBe(true);
  });

  it('reports the teams of the organization left without an owner', async () => {
    const result = await storage.removeOrganizationMember(defaultId, OWNER_A, MEMBER);
    // solo had MEMBER as its only owner; shared keeps OWNER_A; idle only listed MEMBER as member;
    // Acme's team is another organization's and is not reported.
    expect(result.value.teamsLeftWithoutOwner).toEqual([
      { id: team.solo, name: 'solo', displayName: 'solo' },
    ]);
  });

  it('an admin removes a member; the removed account then has no organization', async () => {
    const result = await storage.removeOrganizationMember(defaultId, ADMIN, MEMBER);
    expect(result.ok).toBe(true);
    expect(await storage.getOrganizationMembership(MEMBER)).toBeNull();
    expect(await storage.getUserOrganizationId(MEMBER)).toBeNull();
  });

  const REFUSALS: Array<[string, number, number, number]> = [
    ['an owner removes itself', OWNER_A, OWNER_A, 403],
    ['an admin removes an admin', ADMIN, ADMIN, 403],
    ['an admin removes an owner', ADMIN, OWNER_A, 403],
    ['an owner removes an account of another organization', OWNER_A, ACME_USER, 404],
    ['an owner removes an account without an organization', OWNER_A, GHOST, 404],
    ['an owner removes an unknown id', OWNER_A, 9999, 404],
  ];
  for (const [label, actor, target, status] of REFUSALS) {
    it(`${label}: ${status} and nothing changes`, async () => {
      const before = await snapshot();
      const result = await storage.removeOrganizationMember(defaultId, actor, target);
      expect(result).toMatchObject({ ok: false, status });
      expect(await snapshot()).toEqual(before);
    });
  }

  it("an owner of another organization cannot remove this organization's account", async () => {
    const before = await snapshot();
    const result = await storage.removeOrganizationMember(acmeId, ACME_USER, MEMBER);
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(await snapshot()).toEqual(before);
  });

  it('the last owner cannot be removed, even by an owner whose own row is gone', async () => {
    await scoped.query(`UPDATE organization_members SET role = 'member' WHERE user_id = $1`, [
      OWNER_B,
    ]);
    // OWNER_A is the only owner. It cannot remove itself; nobody else may remove an owner.
    expect(await storage.removeOrganizationMember(defaultId, OWNER_A, OWNER_A)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await storage.removeOrganizationMember(defaultId, ADMIN, OWNER_A)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await roleOf(OWNER_A)).toBe('owner');
  });

  it('an owner removes another owner while two exist', async () => {
    const result = await storage.removeOrganizationMember(defaultId, OWNER_A, OWNER_B);
    expect(result.ok).toBe(true);
    expect(await roleOf(OWNER_B)).toBeNull();
  });
});

describe('changeOrganizationMemberRole', () => {
  it('writes the role of the target and no other row', async () => {
    const result = await storage.changeOrganizationMemberRole(defaultId, ADMIN, MEMBER, 'admin');
    expect(result).toEqual({ ok: true, value: { userId: MEMBER, role: 'admin' } });
    expect(await roleOf(MEMBER)).toBe('admin');
    expect(await roleOf(ADMIN)).toBe('admin');
    expect(await roleOf(OWNER_A)).toBe('owner');
  });

  it('an admin cannot make a member an owner, nor itself', async () => {
    expect(
      await storage.changeOrganizationMemberRole(defaultId, ADMIN, MEMBER, 'owner')
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      await storage.changeOrganizationMemberRole(defaultId, ADMIN, ADMIN, 'owner')
    ).toMatchObject({ ok: false, status: 403 });
    expect(await roleOf(MEMBER)).toBe('member');
    expect(await roleOf(ADMIN)).toBe('admin');
  });

  it('another organization addressed by a foreign owner is 404 and writes nothing', async () => {
    const result = await storage.changeOrganizationMemberRole(acmeId, ACME_USER, MEMBER, 'admin');
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(await roleOf(MEMBER)).toBe('member');
  });

  it('a stored role outside the enum counts as member', async () => {
    await scoped.query(`UPDATE organization_members SET role = 'superuser' WHERE user_id = $1`, [
      MEMBER,
    ]);
    // A member-ranked account cannot manage: refused as not an owner or admin.
    const actor = await storage.changeOrganizationMemberRole(defaultId, MEMBER, ADMIN, 'member');
    expect(actor).toMatchObject({ ok: false, status: 403 });
    // As a target it can be promoted like a member.
    expect(
      await storage.changeOrganizationMemberRole(defaultId, ADMIN, MEMBER, 'admin')
    ).toMatchObject({ ok: true });
  });

  it('two owners each demoting the other: exactly one commits, the organization keeps an owner', async () => {
    for (let round = 0; round < 8; round++) {
      await seed();
      const results = await Promise.all([
        storage.changeOrganizationMemberRole(defaultId, OWNER_A, OWNER_B, 'member'),
        storage.changeOrganizationMemberRole(defaultId, OWNER_B, OWNER_A, 'member'),
      ]);
      const committed = results.filter((r: any) => r.ok);
      const refused = results.filter((r: any) => !r.ok);
      expect(committed).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect(refused[0].status).toBeGreaterThanOrEqual(403);
      const owners = await rows(
        `SELECT user_id FROM organization_members WHERE role = 'owner' AND organization_id = $1`,
        [defaultId]
      );
      expect(owners).toHaveLength(1);
    }
  });

  it('two owners each lowering itself: exactly one commits, the other gets the last-owner refusal', async () => {
    for (let round = 0; round < 8; round++) {
      await seed();
      const results = await Promise.all([
        storage.changeOrganizationMemberRole(defaultId, OWNER_A, OWNER_A, 'admin'),
        storage.changeOrganizationMemberRole(defaultId, OWNER_B, OWNER_B, 'admin'),
      ]);
      expect(results.filter((r: any) => r.ok)).toHaveLength(1);
      const refused = results.find((r: any) => !r.ok);
      expect(refused).toMatchObject({
        ok: false,
        status: 409,
        body: { message: 'Cannot remove the last organization owner' },
      });
      const owners = await rows(
        `SELECT user_id FROM organization_members WHERE role = 'owner' AND organization_id = $1`,
        [defaultId]
      );
      expect(owners).toHaveLength(1);
    }
  });

  it('an owner removal and a demotion of the same owner cannot both leave the organization ownerless', async () => {
    for (let round = 0; round < 8; round++) {
      await seed();
      await Promise.all([
        storage.removeOrganizationMember(defaultId, OWNER_A, OWNER_B),
        storage.changeOrganizationMemberRole(defaultId, OWNER_B, OWNER_A, 'member'),
      ]);
      const owners = await rows(
        `SELECT user_id FROM organization_members WHERE role = 'owner' AND organization_id = $1`,
        [defaultId]
      );
      expect(owners.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("waits while another transaction holds the organization's lock", async () => {
    const holder = await scoped.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `organization-members:${defaultId}`,
      ]);
      let settled = false;
      const pending = storage
        .changeOrganizationMemberRole(defaultId, OWNER_A, MEMBER, 'admin')
        .then((r: any) => {
          settled = true;
          return r;
        });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(settled).toBe(false);
      expect(await roleOf(MEMBER)).toBe('member');
      await holder.query('COMMIT');
      expect(await pending).toMatchObject({ ok: true });
      expect(await roleOf(MEMBER)).toBe('admin');
    } finally {
      holder.release();
    }
  });
});

describe('listings', () => {
  it('lists the organization members only, highest role first then by name', async () => {
    const list = await storage.listOrganizationMembers(defaultId);
    expect(list.map((m: any) => [m.userId, m.role])).toEqual([
      [OWNER_A, 'owner'],
      [OWNER_B, 'owner'],
      [ADMIN, 'admin'],
      [MEMBER, 'member'],
    ]);
    expect(list[0]).toEqual(
      expect.objectContaining({ name: 'User 1', email: email(OWNER_A), isActive: true })
    );
    expect(list[0].joinedAt).toBeInstanceOf(Date);
    expect((await storage.listOrganizationMembers(acmeId)).map((m: any) => m.userId)).toEqual([
      ACME_USER,
    ]);
  });

  it('lists every team of the organization with member and owner counts, inactive ones included', async () => {
    const list = await storage.listOrganizationTeams(defaultId);
    expect(list).toEqual([
      {
        id: team.solo,
        name: 'solo',
        displayName: 'solo',
        isActive: true,
        memberCount: 1,
        ownerCount: 1,
      },
      {
        id: team.shared,
        name: 'shared',
        displayName: 'shared',
        isActive: true,
        memberCount: 2,
        ownerCount: 2,
      },
      {
        id: team.idle,
        name: 'idle',
        displayName: 'idle',
        isActive: false,
        memberCount: 2,
        ownerCount: 1,
      },
    ]);
  });
});

describe('updateOrganizationSettings', () => {
  const nameOf = async (id: number) =>
    (await one(`SELECT name FROM organizations WHERE id = $1`, [id])).name;

  it('renames and switches AI for the named organization only', async () => {
    const updated = await storage.updateOrganizationSettings(defaultId, ADMIN, {
      name: 'Renamed',
      aiEnabled: false,
    });
    expect(updated).toMatchObject({
      ok: true,
      value: { role: 'admin', organization: { id: defaultId, name: 'Renamed', aiEnabled: false } },
    });
    expect(await nameOf(acmeId)).toBe('Acme');
    await storage.updateOrganizationSettings(defaultId, OWNER_A, { name: 'Default' });
    expect(
      (await one(`SELECT ai_enabled FROM organizations WHERE id = $1`, [defaultId])).ai_enabled
    ).toBe(false);
  });

  it('refuses a plain member, an account of another organization and an unknown account', async () => {
    for (const actor of [MEMBER, ACME_USER, GHOST, 9999]) {
      const result = await storage.updateOrganizationSettings(defaultId, actor, { name: 'Nope' });
      expect(result).toMatchObject({ ok: false, status: 403 });
    }
    expect(await nameOf(defaultId)).toBe('Default');
    expect(await nameOf(acmeId)).toBe('Acme');
  });

  it('a demotion committed while the update waits for the lock refuses the update', async () => {
    const holder = await scoped.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `organization-members:${defaultId}`,
      ]);
      const pending = storage.updateOrganizationSettings(defaultId, ADMIN, { name: 'Late' });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await holder.query(`UPDATE organization_members SET role = 'member' WHERE user_id = $1`, [
        ADMIN,
      ]);
      await holder.query('COMMIT');
      expect(await pending).toMatchObject({ ok: false, status: 403 });
      expect(await nameOf(defaultId)).toBe('Default');
    } finally {
      holder.release();
    }
  });
});

describe('a deactivated owner does not count as an owner', () => {
  beforeEach(async () => {
    await scoped.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [OWNER_B]);
  });

  it('the active owner lowering itself is the last-owner refusal', async () => {
    const result = await storage.changeOrganizationMemberRole(defaultId, OWNER_A, OWNER_A, 'admin');
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(await roleOf(OWNER_A)).toBe('owner');
  });

  it('the active owner lowers the deactivated owner', async () => {
    const result = await storage.changeOrganizationMemberRole(
      defaultId,
      OWNER_A,
      OWNER_B,
      'member'
    );
    expect(result).toMatchObject({ ok: true });
    expect(await roleOf(OWNER_B)).toBe('member');
  });

  it('the active owner removes the deactivated owner', async () => {
    const result = await storage.removeOrganizationMember(defaultId, OWNER_A, OWNER_B);
    expect(result).toMatchObject({ ok: true });
    expect(await roleOf(OWNER_B)).toBeNull();
  });

  it('the deactivated owner cannot act', async () => {
    expect(
      await storage.changeOrganizationMemberRole(defaultId, OWNER_B, MEMBER, 'admin')
    ).toMatchObject({ ok: false, status: 403 });
    expect(await storage.removeOrganizationMember(defaultId, OWNER_B, MEMBER)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(
      await storage.updateOrganizationSettings(defaultId, OWNER_B, { name: 'x' })
    ).toMatchObject({ ok: false, status: 403 });
    expect(await roleOf(MEMBER)).toBe('member');
  });
});

describe('getMemberOrganizationId', () => {
  it("is the account's organization when the account has one", async () => {
    const row = await one(`SELECT id FROM members WHERE email = $1`, [email(MEMBER)]);
    expect(await storage.getMemberOrganizationId(row.id)).toBe(defaultId);
  });

  it('is null for a roster row whose account belongs to no organization, even in a team of one', async () => {
    const row = await one(`SELECT id FROM members WHERE email = $1`, [email(GHOST)]);
    // The row sits in a default-organization team; the account has been removed from every one.
    expect(await storage.getMemberOrganizationId(row.id)).toBeNull();
  });

  it('after removal, the roster row of the removed account is in no organization', async () => {
    const row = await one(`SELECT id FROM members WHERE email = $1`, [email(MEMBER)]);
    await storage.removeOrganizationMember(defaultId, OWNER_A, MEMBER);
    expect(await storage.getMemberOrganizationId(row.id)).toBeNull();
  });

  it('a row with no account at all is placed by its team, or by nothing without one', async () => {
    const nobody = await one(`SELECT id FROM members WHERE email = 'nobody@example.com'`);
    const orphan = await one(`SELECT id FROM members WHERE email = 'orphan@example.com'`);
    expect(await storage.getMemberOrganizationId(nobody.id)).toBe(acmeId);
    expect(await storage.getMemberOrganizationId(orphan.id)).toBeNull();
    expect(await storage.getMemberOrganizationId(999999)).toBeNull();
  });
});

describe('updateTeam and the route schema', () => {
  const organizationOf = async (id: number) =>
    (await one(`SELECT organization_id FROM teams WHERE id = $1`, [id])).organization_id;

  it('the raw call writes any column of the body, organizationId included (why the route parses)', async () => {
    await storage.updateTeam(team.solo, { organizationId: acmeId, displayName: 'raw' } as any);
    expect(await organizationOf(team.solo)).toBe(acmeId);
  });

  it('after updateTeamSchema the organization and id of the team are unchanged', async () => {
    const body = {
      organizationId: acmeId,
      id: 99999,
      createdAt: '2001-01-01',
      displayName: 'parsed',
    };
    const parsed = updateTeamSchema.parse(body);
    expect(parsed).toEqual({ displayName: 'parsed' });
    const updated = await storage.updateTeam(team.solo, parsed);
    expect(updated.displayName).toBe('parsed');
    expect(await organizationOf(team.solo)).toBe(defaultId);
    expect(updated.id).toBe(team.solo);
  });
});
