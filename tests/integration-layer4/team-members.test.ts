/**
 * Layer 4: team membership against real Postgres (WP2).
 *
 * DBStorage.changeTeamMemberRole / removeTeamMember / admitTeamMember run under the team lock
 * and decide from what they read through the lock's handle:
 *   - the role rules hold on real rows (actor x target x requested role, last active owner);
 *   - a row of an account that is not in the team's organization is not a member (404);
 *   - an inactive owner does not count as an owner;
 *   - two owners each demoting, removing or lowering the other leave the team an owner, over
 *     many rounds; leaving and demoting at once cannot empty the owners either;
 *   - a change waits while another transaction holds the team's lock, reads the actor again
 *     after the wait (a demotion committed meanwhile refuses it), and a wait past the timeout
 *     is a TeamBusyError;
 *   - two admissions of one account leave one row.
 * DBStorage.listTeamMembers / listTeamMemberCandidates: only the organization's own accounts.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_wp2_team_members';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const OWNER_A = 1;
const OWNER_B = 2;
const ADMIN_A = 3;
const ADMIN_B = 4;
const MEMBER_A = 5;
const MEMBER_B = 6;
const ORG_ONLY = 7; // in the organization, not in the team
const ACME_USER = 8; // in another organization
const NOBODY = 9; // in no organization
const email = (id: number) => `user${id}@example.com`;

let admin: Pool;
let scoped: Pool;
let storage: any;
let defaultId: number;
let acmeId: number;
let TEAM: number;
let ACME_TEAM: number;
let OTHER_TEAM: number;

async function one<T = any>(text: string, params: unknown[] = []): Promise<T> {
  return (await scoped.query(text, params)).rows[0];
}
const rows = async (text: string, params: unknown[] = []) =>
  (await scoped.query(text, params)).rows;

async function seed() {
  await scoped.query(`
    TRUNCATE team_members, members, wiki_pages, teams, organization_members, users
      RESTART IDENTITY CASCADE;
  `);
  for (const id of [
    OWNER_A,
    OWNER_B,
    ADMIN_A,
    ADMIN_B,
    MEMBER_A,
    MEMBER_B,
    ORG_ONLY,
    ACME_USER,
    NOBODY,
  ]) {
    await scoped.query(`INSERT INTO users (id, name, email) VALUES ($1, $2, $3)`, [
      id,
      `User ${id}`,
      email(id),
    ]);
  }
  await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [NOBODY]);
  await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
    acmeId,
    ACME_USER,
  ]);
  const makeTeam = async (name: string, organizationId: number) =>
    Number(
      (
        await one(
          `INSERT INTO teams (name, display_name, organization_id) VALUES ($1, $1, $2) RETURNING id`,
          [name, organizationId]
        )
      ).id
    );
  TEAM = await makeTeam('main', defaultId);
  OTHER_TEAM = await makeTeam('other', defaultId);
  ACME_TEAM = await makeTeam('acme-team', acmeId);
  const joins: Array<[number, number, string]> = [
    [TEAM, OWNER_A, 'owner'],
    [TEAM, OWNER_B, 'owner'],
    [TEAM, ADMIN_A, 'admin'],
    [TEAM, ADMIN_B, 'admin'],
    [TEAM, MEMBER_A, 'member'],
    [TEAM, MEMBER_B, 'member'],
    [OTHER_TEAM, OWNER_A, 'owner'],
    [ACME_TEAM, ACME_USER, 'owner'],
  ];
  for (const [teamId, userId, role] of joins) {
    await scoped.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)`, [
      teamId,
      userId,
      role,
    ]);
  }
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

const roleOf = async (userId: number, teamId = TEAM) =>
  (await one(`SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]))
    ?.role ?? null;
const owners = async (teamId = TEAM) =>
  rows(`SELECT user_id FROM team_members WHERE team_id = $1 AND role = 'owner'`, [teamId]);
const snapshot = async () => rows(`SELECT team_id, user_id, role FROM team_members ORDER BY id`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('changeTeamMemberRole on real rows', () => {
  it('an owner sets any role on any member, and the row says so', async () => {
    const promote = await storage.changeTeamMemberRole(TEAM, OWNER_A, MEMBER_A, 'admin');
    expect(promote).toEqual({
      ok: true,
      value: { teamId: TEAM, userId: MEMBER_A, role: 'admin', demoted: false },
    });
    expect(await roleOf(MEMBER_A)).toBe('admin');
    const demote = await storage.changeTeamMemberRole(TEAM, OWNER_A, ADMIN_A, 'member');
    expect(demote.value).toMatchObject({ role: 'member', demoted: true });
    expect(await roleOf(ADMIN_A)).toBe('member');
    const grantOwner = await storage.changeTeamMemberRole(TEAM, OWNER_A, MEMBER_B, 'owner');
    expect(grantOwner.ok).toBe(true);
    expect(await roleOf(MEMBER_B)).toBe('owner');
  });

  it('an admin promotes a member and lowers itself, and nothing else', async () => {
    const before = await snapshot();
    for (const [target, requested] of [
      [MEMBER_A, 'owner'],
      [ADMIN_B, 'member'],
      [OWNER_A, 'member'],
      [OWNER_A, 'admin'],
      [ADMIN_A, 'owner'],
    ] as const) {
      const result = await storage.changeTeamMemberRole(TEAM, ADMIN_A, target, requested);
      expect(result, `${target} -> ${requested}`).toMatchObject({ ok: false, status: 403 });
    }
    expect(await snapshot()).toEqual(before);
    expect(await storage.changeTeamMemberRole(TEAM, ADMIN_A, MEMBER_A, 'admin')).toMatchObject({
      ok: true,
    });
    expect(await storage.changeTeamMemberRole(TEAM, ADMIN_A, ADMIN_A, 'member')).toMatchObject({
      ok: true,
      value: { demoted: true },
    });
  });

  it('a plain member and an account outside the team manage nothing', async () => {
    const before = await snapshot();
    for (const actor of [MEMBER_A, ORG_ONLY, ACME_USER, NOBODY]) {
      const result = await storage.changeTeamMemberRole(TEAM, actor, MEMBER_B, 'admin');
      expect(result, `actor ${actor}`).toMatchObject({
        ok: false,
        status: 403,
        body: { message: 'Owner or admin role required' },
      });
    }
    expect(await snapshot()).toEqual(before);
  });

  it('an unknown team and a team of another organization refuse like a team the actor is not in', async () => {
    const unknown = await storage.changeTeamMemberRole(99999, OWNER_A, MEMBER_A, 'admin');
    const foreign = await storage.changeTeamMemberRole(ACME_TEAM, OWNER_A, ACME_USER, 'admin');
    for (const result of [unknown, foreign]) {
      expect(result).toMatchObject({ ok: false, status: 403 });
    }
  });

  it('an account that is not in the team, in another organization or in none is 404', async () => {
    for (const target of [ORG_ONLY, ACME_USER, NOBODY, 99999]) {
      const result = await storage.changeTeamMemberRole(TEAM, OWNER_A, target, 'admin');
      expect(result, `target ${target}`).toMatchObject({
        ok: false,
        status: 404,
        body: { message: 'Membership not found' },
      });
    }
  });

  it('a row of an account that moved to another organization is not a member', async () => {
    await scoped.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')`,
      [TEAM, ACME_USER]
    );
    const result = await storage.changeTeamMemberRole(TEAM, OWNER_A, ACME_USER, 'admin');
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(await roleOf(ACME_USER)).toBe('member');
    expect((await storage.listTeamMembers(TEAM)).map((m: any) => m.userId)).not.toContain(
      ACME_USER
    );
    // And it does not count as an owner either.
    await scoped.query(
      `UPDATE team_members SET role = 'owner' WHERE user_id = $1 AND team_id = $2`,
      [ACME_USER, TEAM]
    );
    await scoped.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [
      TEAM,
      OWNER_B,
    ]);
    const lastOwner = await storage.changeTeamMemberRole(TEAM, OWNER_A, OWNER_A, 'member');
    expect(lastOwner).toMatchObject({ ok: false, status: 409 });
  });

  it('the last active owner cannot be demoted; an inactive owner does not count', async () => {
    await scoped.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [OWNER_B]);
    const refused = await storage.changeTeamMemberRole(TEAM, OWNER_A, OWNER_A, 'admin');
    expect(refused).toMatchObject({
      ok: false,
      status: 409,
      body: { message: 'Cannot demote the sole team owner' },
    });
    expect(await roleOf(OWNER_A)).toBe('owner');
    const inactive = await storage.changeTeamMemberRole(TEAM, OWNER_A, OWNER_B, 'member');
    expect(inactive).toMatchObject({ ok: true });
    expect(await roleOf(OWNER_B)).toBe('member');
  });

  it('an inactive actor manages nothing', async () => {
    await scoped.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [OWNER_A]);
    const result = await storage.changeTeamMemberRole(TEAM, OWNER_A, MEMBER_A, 'admin');
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});

describe('removeTeamMember on real rows', () => {
  it('removes exactly that row and no other team row of the account', async () => {
    const before = await snapshot();
    const result = await storage.removeTeamMember(TEAM, OWNER_A, ADMIN_A);
    expect(result).toEqual({ ok: true, value: { userId: ADMIN_A } });
    expect(await snapshot()).toEqual(
      before.filter((row: any) => !(row.team_id === TEAM && row.user_id === ADMIN_A))
    );
  });

  it('an admin removes a member only; an owner removes anyone but the last owner', async () => {
    expect(await storage.removeTeamMember(TEAM, ADMIN_A, ADMIN_B)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await storage.removeTeamMember(TEAM, ADMIN_A, OWNER_B)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await storage.removeTeamMember(TEAM, ADMIN_A, MEMBER_A)).toMatchObject({ ok: true });
    expect(await storage.removeTeamMember(TEAM, OWNER_A, OWNER_B)).toMatchObject({ ok: true });
    expect(await storage.removeTeamMember(TEAM, OWNER_A, OWNER_A)).toMatchObject({
      ok: false,
      status: 409,
      body: { message: 'Cannot remove the sole team owner' },
    });
    expect(await roleOf(OWNER_A)).toBe('owner');
  });

  it('leaving: any member may, the last active owner may not, a non-member is 404', async () => {
    expect(
      await storage.removeTeamMember(TEAM, MEMBER_A, MEMBER_A, { leaving: true })
    ).toMatchObject({ ok: true });
    expect(await roleOf(MEMBER_A)).toBeNull();
    expect(
      await storage.removeTeamMember(TEAM, ORG_ONLY, ORG_ONLY, { leaving: true })
    ).toMatchObject({ ok: false, status: 404 });
    expect(await storage.removeTeamMember(TEAM, OWNER_A, OWNER_A, { leaving: true })).toMatchObject(
      { ok: true }
    );
    expect(await storage.removeTeamMember(TEAM, OWNER_B, OWNER_B, { leaving: true })).toMatchObject(
      { ok: false, status: 409 }
    );
    expect(await owners()).toHaveLength(1);
  });

  it('leaving with a leftover row of another organization changes nothing for that account', async () => {
    const result = await storage.removeTeamMember(ACME_TEAM, OWNER_A, ACME_USER);
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(await roleOf(ACME_USER, ACME_TEAM)).toBe('owner');
  });
});

describe('admitTeamMember on real rows', () => {
  it('admits an organization member once, as a plain member invited by the actor', async () => {
    const first = await storage.admitTeamMember(TEAM, ADMIN_A, email(ORG_ONLY));
    expect(first).toEqual({
      ok: true,
      value: { created: true, membership: { teamId: TEAM, userId: ORG_ONLY, role: 'member' } },
    });
    expect(
      (
        await one(`SELECT invited_by FROM team_members WHERE team_id = $1 AND user_id = $2`, [
          TEAM,
          ORG_ONLY,
        ])
      ).invited_by
    ).toBe(ADMIN_A);
    const again = await storage.admitTeamMember(TEAM, OWNER_A, email(ORG_ONLY));
    expect(again).toMatchObject({ ok: true, value: { created: false } });
    // An existing admin is not turned into a member by being admitted again.
    const existing = await storage.admitTeamMember(TEAM, OWNER_A, email(ADMIN_A));
    expect(existing.value.membership.role).toBe('admin');
  });

  it('answers an account of another organization, one without an organization and an unknown email alike', async () => {
    const answers = await Promise.all(
      [email(ACME_USER), email(NOBODY), 'nobody-at-all@example.com'].map((address) =>
        storage.admitTeamMember(TEAM, OWNER_A, address)
      )
    );
    for (const answer of answers) {
      expect(answer).toEqual({
        ok: false,
        status: 404,
        body: { message: 'Registered user not found' },
      });
    }
    expect(await roleOf(ACME_USER)).toBeNull();
    expect(await roleOf(NOBODY)).toBeNull();
  });

  it('a plain member and an outsider cannot admit; an empty email is 400 for a manager', async () => {
    for (const actor of [MEMBER_A, ORG_ONLY, ACME_USER]) {
      expect(await storage.admitTeamMember(TEAM, actor, email(ORG_ONLY))).toMatchObject({
        ok: false,
        status: 403,
      });
    }
    expect(await storage.admitTeamMember(TEAM, OWNER_A, '')).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('two admissions of the same account at once leave one row', async () => {
    for (let round = 0; round < 6; round++) {
      await seed();
      const results = await Promise.all([
        storage.admitTeamMember(TEAM, OWNER_A, email(ORG_ONLY)),
        storage.admitTeamMember(TEAM, ADMIN_A, email(ORG_ONLY)),
      ]);
      expect(results.map((r: any) => r.value.created).sort()).toEqual([false, true]);
      expect(
        (
          await one(
            `SELECT count(*)::int AS n FROM team_members WHERE team_id = $1 AND user_id = $2`,
            [TEAM, ORG_ONLY]
          )
        ).n
      ).toBe(1);
    }
  });
});

describe('the team lock', () => {
  it('two owners each demoting the other: exactly one commits, the team keeps an owner', async () => {
    await scoped.query(`DELETE FROM team_members WHERE team_id = $1 AND role <> 'owner'`, [TEAM]);
    for (let round = 0; round < 10; round++) {
      await scoped.query(`UPDATE team_members SET role = 'owner' WHERE team_id = $1`, [TEAM]);
      const results = await Promise.all([
        storage.changeTeamMemberRole(TEAM, OWNER_A, OWNER_B, 'member'),
        storage.changeTeamMemberRole(TEAM, OWNER_B, OWNER_A, 'member'),
      ]);
      expect(results.filter((r: any) => r.ok)).toHaveLength(1);
      const refused = results.find((r: any) => !r.ok);
      expect(refused.status).toBeGreaterThanOrEqual(403);
      expect(await owners()).toHaveLength(1);
    }
  });

  it('two owners each lowering itself: exactly one commits, the other gets the last-owner refusal', async () => {
    for (let round = 0; round < 10; round++) {
      await seed();
      const results = await Promise.all([
        storage.changeTeamMemberRole(TEAM, OWNER_A, OWNER_A, 'admin'),
        storage.changeTeamMemberRole(TEAM, OWNER_B, OWNER_B, 'admin'),
      ]);
      expect(results.filter((r: any) => r.ok)).toHaveLength(1);
      expect(results.find((r: any) => !r.ok)).toMatchObject({ ok: false, status: 409 });
      expect(await owners()).toHaveLength(1);
    }
  });

  it('two owners each removing the other, leaving, or one removing while the other leaves: an owner is left', async () => {
    const attempts: Array<() => Promise<any>[]> = [
      () => [
        storage.removeTeamMember(TEAM, OWNER_A, OWNER_B),
        storage.removeTeamMember(TEAM, OWNER_B, OWNER_A),
      ],
      () => [
        storage.removeTeamMember(TEAM, OWNER_A, OWNER_A, { leaving: true }),
        storage.removeTeamMember(TEAM, OWNER_B, OWNER_B, { leaving: true }),
      ],
      () => [
        storage.removeTeamMember(TEAM, OWNER_A, OWNER_B),
        storage.removeTeamMember(TEAM, OWNER_B, OWNER_B, { leaving: true }),
      ],
      () => [
        storage.removeTeamMember(TEAM, OWNER_A, OWNER_B),
        storage.changeTeamMemberRole(TEAM, OWNER_B, OWNER_A, 'member'),
      ],
      () => [
        storage.changeTeamMemberRole(TEAM, OWNER_A, OWNER_A, 'member'),
        storage.removeTeamMember(TEAM, OWNER_B, OWNER_B, { leaving: true }),
      ],
    ];
    for (const [index, attempt] of attempts.entries()) {
      for (let round = 0; round < 8; round++) {
        await seed();
        const results = await Promise.all(attempt());
        expect(
          results.filter((r: any) => r.ok),
          `attempt ${index}`
        ).toHaveLength(1);
        expect(await owners(), `attempt ${index}, round ${round}`).toHaveLength(1);
      }
    }
  });

  it("waits while another transaction holds the team's lock", async () => {
    const holder = await scoped.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `team-members:${TEAM}`,
      ]);
      let settled = false;
      const pending = storage
        .changeTeamMemberRole(TEAM, OWNER_A, MEMBER_A, 'admin')
        .then((r: any) => {
          settled = true;
          return r;
        });
      await sleep(400);
      expect(settled).toBe(false);
      expect(await roleOf(MEMBER_A)).toBe('member');
      await holder.query('COMMIT');
      expect(await pending).toMatchObject({ ok: true });
      expect(await roleOf(MEMBER_A)).toBe('admin');
    } finally {
      holder.release();
    }
  });

  it('another team is not held up by it', async () => {
    const holder = await scoped.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `team-members:${TEAM}`,
      ]);
      const other = await storage.admitTeamMember(OTHER_TEAM, OWNER_A, email(ORG_ONLY));
      expect(other).toMatchObject({ ok: true });
      await holder.query('COMMIT');
    } finally {
      holder.release();
    }
  });

  it('a demotion committed while the change waits for the lock refuses the change (the actor is read after the wait)', async () => {
    const holder = await scoped.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `team-members:${TEAM}`,
      ]);
      const pending = storage.changeTeamMemberRole(TEAM, ADMIN_A, MEMBER_A, 'admin');
      await sleep(300);
      await holder.query(
        `UPDATE team_members SET role = 'member' WHERE team_id = $1 AND user_id = $2`,
        [TEAM, ADMIN_A]
      );
      await holder.query('COMMIT');
      expect(await pending).toMatchObject({ ok: false, status: 403 });
      expect(await roleOf(MEMBER_A)).toBe('member');
    } finally {
      holder.release();
    }
  });

  it('a wait past the timeout is a TeamBusyError', async () => {
    const { TeamBusyError } = await import('../../server/storage.js');
    const holder = await scoped.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `team-members:${TEAM}`,
      ]);
      await expect(
        storage.withTeamLock(TEAM, async () => 'never', { lockTimeoutMs: 200 })
      ).rejects.toBeInstanceOf(TeamBusyError);
      await holder.query('COMMIT');
    } finally {
      holder.release();
    }
  });
});

describe('listings', () => {
  it('lists the team members only, highest role first then by name, with who they are', async () => {
    const list = await storage.listTeamMembers(TEAM);
    expect(list.map((m: any) => [m.userId, m.role])).toEqual([
      [OWNER_A, 'owner'],
      [OWNER_B, 'owner'],
      [ADMIN_A, 'admin'],
      [ADMIN_B, 'admin'],
      [MEMBER_A, 'member'],
      [MEMBER_B, 'member'],
    ]);
    expect(list[0]).toEqual(
      expect.objectContaining({ name: 'User 1', email: email(OWNER_A), isActive: true })
    );
    expect(list[0].joinedAt).toBeInstanceOf(Date);
    expect(Object.keys(list[0]).sort()).toEqual(
      ['email', 'isActive', 'joinedAt', 'name', 'role', 'userId'].sort()
    );
    expect((await storage.listTeamMembers(ACME_TEAM)).map((m: any) => m.userId)).toEqual([
      ACME_USER,
    ]);
    expect(await storage.listTeamMembers(99999)).toEqual([]);
  });

  it('candidates are active members of the team organization who are not in the team', async () => {
    const candidates = await storage.listTeamMemberCandidates(TEAM, '');
    expect(candidates).toEqual([{ name: 'User 7', email: email(ORG_ONLY) }]);
    await scoped.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [ORG_ONLY]);
    expect(await storage.listTeamMemberCandidates(TEAM, '')).toEqual([]);
    // Other organizations never show: Acme's team offers only Acme's own accounts.
    expect(await storage.listTeamMemberCandidates(ACME_TEAM, '')).toEqual([]);
    expect(await storage.listTeamMemberCandidates(99999, '')).toEqual([]);
  });

  it('searches name or email, case-insensitively, treating % _ and a backslash as plain characters', async () => {
    await scoped.query(
      `INSERT INTO users (id, name, email) VALUES (20, 'Ada 100% Lovelace', 'ada@example.com'),
         (21, 'Under_score', 'under@example.com'), (22, 'Back\\slash', 'back@example.com'),
         (23, 'Zed', 'zed@example.com')`
    );
    const names = async (q: string) =>
      (await storage.listTeamMemberCandidates(TEAM, q)).map((c: any) => c.name);
    expect(await names('LOVELACE')).toEqual(['Ada 100% Lovelace']);
    expect(await names('zed@')).toEqual(['Zed']);
    expect(await names('%')).toEqual(['Ada 100% Lovelace']);
    expect(await names('_')).toEqual(['Under_score']);
    expect(await names('\\')).toEqual(['Back\\slash']);
    expect(await names('no such person')).toEqual([]);
  });

  it('returns at most the limit', async () => {
    for (let i = 0; i < 25; i++) {
      await scoped.query(`INSERT INTO users (id, name, email) VALUES ($1, $2, $3)`, [
        100 + i,
        `Extra ${String(i).padStart(2, '0')}`,
        `extra${i}@example.com`,
      ]);
    }
    expect(await storage.listTeamMemberCandidates(TEAM, '')).toHaveLength(20);
    expect(await storage.listTeamMemberCandidates(TEAM, '', 5)).toHaveLength(5);
  });
});
