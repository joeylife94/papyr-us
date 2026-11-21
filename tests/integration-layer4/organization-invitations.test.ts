/**
 * Layer 4: organization invitations against real Postgres (issue #124 X1d).
 *
 * DBStorage.createOrganizationInvitation / listOrganizationInvitations / revoke:
 *   - an owner invites members and admins, an admin members only, nobody an owner; decided from
 *     the actor's membership as it is under the organization lock;
 *   - only the SHA-256 of the token is stored: no column holds the token, and the list never
 *     carries a token or a hash;
 *   - an address that already belongs to a member is refused; pending invitations are capped.
 * DBStorage.acceptOrganizationInvitation (an existing account):
 *   - an active account without an organization joins with the invited role and WITHOUT AI access;
 *   - the invitation is single-use: the second use, an expired, a revoked and an unknown token all
 *     answer `invalid`, as do the invitations of an organization that was switched off and of a
 *     creator who was demoted or removed;
 *   - an account of another organization is refused and nothing changes (not even the invitation);
 *   - an account of the same organization uses the invitation up and nothing else changes;
 *   - an invitation for an address is accepted only by that address; a deactivated account is refused;
 *   - two accounts racing for one token: exactly one membership; the same account twice: one.
 * DBStorage.registerWithOrganizationInvitation (a new account):
 *   - the account, its membership (member or admin, no AI) and the use of the invitation commit
 *     together; a taken address, a wrong address or an unusable token create nothing and leave
 *     the invitation pending;
 *   - two sign-ups racing for one token: exactly one account.
 * A removed account that joins again by invitation gets no team access from its old directory row.
 * Migration 0029: creates the table with the names push expects, is idempotent, is left alone on a
 * database without organizations, and its down file refuses while an invitation is pending.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';
import {
  generateInvitationToken,
  hashInvitationToken,
} from '../../server/organization-invitations';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_x1d_invitations';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const UP = readFileSync(
  new URL('../../drizzle/0029_add_organization_invitations.sql', import.meta.url),
  'utf8'
);
const DOWN = readFileSync(
  new URL('../../drizzle/0029_add_organization_invitations.down.sql', import.meta.url),
  'utf8'
);

const OWNER = 1;
const ADMIN = 2;
const MEMBER = 3;
const LONER = 4; // no organization
const ACME_OWNER = 5;
const ACME_MEMBER = 6;
const email = (id: number) => `user${id}@example.com`;

let admin: Pool;
let scoped: Pool;
let storage: any;
let defaultId: number;
let acmeId: number;

const rows = async (text: string, params: unknown[] = []) =>
  (await scoped.query(text, params)).rows;
const one = async (text: string, params: unknown[] = []) => (await rows(text, params))[0];

async function seed() {
  await scoped.query(`
    TRUNCATE organization_invitations, team_members, members, wiki_pages, teams,
             organization_members, users RESTART IDENTITY CASCADE;
  `);
  // Accounts are placed explicitly: sign-up through DBStorage is what the routes do, and the
  // fixture's trigger that places every new account in the default organization would stand in
  // the way of registering with an invitation.
  await scoped.query(`DROP TRIGGER IF EXISTS l4_join_default_organization ON users`);
  const placements: Array<[number, number | null, string]> = [
    [OWNER, defaultId, 'owner'],
    [ADMIN, defaultId, 'admin'],
    [MEMBER, defaultId, 'member'],
    [LONER, null, 'member'],
    [ACME_OWNER, acmeId, 'owner'],
    [ACME_MEMBER, acmeId, 'member'],
  ];
  for (const [id, organizationId, role] of placements) {
    await scoped.query(`INSERT INTO users (id, name, email) VALUES ($1, $2, $3)`, [
      id,
      `User ${id}`,
      email(id),
    ]);
    if (organizationId !== null) {
      await scoped.query(
        `INSERT INTO organization_members (organization_id, user_id, role, ai_allowed) VALUES ($1, $2, $3, true)`,
        [organizationId, id, role]
      );
    }
  }
  await scoped.query(`UPDATE organizations SET ai_enabled = true, is_active = true`);
  await scoped.query(
    `SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT max(id) FROM users), 1))`
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
    CREATE TABLE comments (
      id SERIAL PRIMARY KEY, page_id INTEGER NOT NULL, author_user_id INTEGER
    );
  `);
  defaultId = await addOrganizations(scoped);
  acmeId = Number(
    (await one(`INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`)).id
  );
  await scoped.query(UP);
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

const create = async (
  actor: number,
  input: { email?: string | null; role?: 'member' | 'admin'; days?: number } = {},
  organizationId = defaultId
) => {
  const result = await storage.createOrganizationInvitation(organizationId, actor, {
    email: input.email ?? null,
    role: input.role ?? 'member',
    expiresInDays: input.days ?? 7,
  });
  if (!result.ok) throw new Error(`create refused: ${result.status} ${result.body.message}`);
  return result.value as { invitation: any; token: string };
};
const membershipOf = (userId: number) =>
  one(`SELECT organization_id, role, ai_allowed FROM organization_members WHERE user_id = $1`, [
    userId,
  ]);
const invitationRow = (id: number) =>
  one(`SELECT * FROM organization_invitations WHERE id = $1`, [id]);

describe('creating and listing', () => {
  it('stores only the SHA-256 of the token, and the list shows neither', async () => {
    const { invitation, token } = await create(OWNER, { email: 'New@Example.com' });
    const row = await invitationRow(invitation.id);
    expect(row.token_hash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.email).toBe('new@example.com');
    expect(row.created_by_user_id).toBe(OWNER);
    // no column of any invitation row holds the token
    const all = await rows(`SELECT t::text AS flat FROM organization_invitations t`);
    expect(all.some((r) => r.flat.includes(token))).toBe(false);

    const listed = await storage.listOrganizationInvitations(defaultId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: invitation.id,
      email: 'new@example.com',
      status: 'pending',
    });
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(JSON.stringify(listed)).not.toContain(row.token_hash);
    expect(Object.keys(listed[0])).not.toContain('tokenHash');
  });

  it('lists only the organization own invitations', async () => {
    await create(OWNER);
    await create(ACME_OWNER, {}, acmeId);
    expect(await storage.listOrganizationInvitations(defaultId)).toHaveLength(1);
    expect(await storage.listOrganizationInvitations(acmeId)).toHaveLength(1);
  });

  it('applies the role ceiling from the actor membership: owner members and admins, admin members, nobody an owner', async () => {
    expect(
      (
        await storage.createOrganizationInvitation(defaultId, OWNER, {
          email: null,
          role: 'admin',
          expiresInDays: 7,
        })
      ).ok
    ).toBe(true);
    expect(
      (
        await storage.createOrganizationInvitation(defaultId, ADMIN, {
          email: null,
          role: 'member',
          expiresInDays: 7,
        })
      ).ok
    ).toBe(true);
    const adminForAdmin = await storage.createOrganizationInvitation(defaultId, ADMIN, {
      email: null,
      role: 'admin',
      expiresInDays: 7,
    });
    expect(adminForAdmin).toMatchObject({ ok: false, status: 403 });
    const memberInvites = await storage.createOrganizationInvitation(defaultId, MEMBER, {
      email: null,
      role: 'member',
      expiresInDays: 7,
    });
    expect(memberInvites).toMatchObject({ ok: false, status: 403 });
    const ownerRole = await storage.createOrganizationInvitation(defaultId, OWNER, {
      email: null,
      role: 'owner' as any,
      expiresInDays: 7,
    });
    expect(ownerRole).toMatchObject({ ok: false, status: 403 });
    // an owner of another organization has no say here
    const outsider = await storage.createOrganizationInvitation(defaultId, ACME_OWNER, {
      email: null,
      role: 'member',
      expiresInDays: 7,
    });
    expect(outsider).toMatchObject({ ok: false, status: 403 });
    // a deactivated owner has none either
    await scoped.query(`UPDATE users SET is_active = false WHERE id = $1`, [OWNER]);
    const inactive = await storage.createOrganizationInvitation(defaultId, OWNER, {
      email: null,
      role: 'member',
      expiresInDays: 7,
    });
    expect(inactive).toMatchObject({ ok: false, status: 403 });
    expect(await rows(`SELECT 1 FROM organization_invitations`)).toHaveLength(2);
  });

  it('refuses an address that already belongs to a member of the organization, in any letter case', async () => {
    const refused = await storage.createOrganizationInvitation(defaultId, OWNER, {
      email: email(MEMBER).toUpperCase(),
      role: 'member',
      expiresInDays: 7,
    });
    expect(refused).toMatchObject({ ok: false, status: 409, body: { code: 'already_member' } });
    // an address that belongs to another organization is not refused and not revealed
    const other = await storage.createOrganizationInvitation(defaultId, OWNER, {
      email: email(ACME_MEMBER),
      role: 'member',
      expiresInDays: 7,
    });
    expect(other.ok).toBe(true);
  });

  it('caps the pending invitations of an organization', async () => {
    await scoped.query(
      `INSERT INTO organization_invitations (organization_id, role, token_hash, created_by_user_id, expires_at)
       SELECT $1, 'member', md5(g::text) || md5(g::text), $2, now() + interval '1 day' FROM generate_series(1, 200) g`,
      [defaultId, OWNER]
    );
    const over = await storage.createOrganizationInvitation(defaultId, OWNER, {
      email: null,
      role: 'member',
      expiresInDays: 7,
    });
    expect(over).toMatchObject({ ok: false, status: 409, body: { code: 'too_many_pending' } });
    // expired and revoked ones do not count
    await scoped.query(
      `UPDATE organization_invitations SET revoked_at = now() WHERE id = (SELECT min(id) FROM organization_invitations)`
    );
    expect(
      (
        await storage.createOrganizationInvitation(defaultId, OWNER, {
          email: null,
          role: 'member',
          expiresInDays: 7,
        })
      ).ok
    ).toBe(true);
  });

  it('expires after the number of days asked, measured by the database clock', async () => {
    const { invitation } = await create(OWNER, { days: 3 });
    const row = await one(
      `SELECT extract(epoch FROM (expires_at - created_at)) / 86400 AS days FROM organization_invitations WHERE id = $1`,
      [invitation.id]
    );
    expect(Math.round(Number(row.days))).toBe(3);
  });
});

describe('accepting as an existing account', () => {
  it('places an account without an organization with the invited role and without AI access', async () => {
    const { token, invitation } = await create(OWNER, { role: 'admin' });
    const result = await storage.acceptOrganizationInvitation(token, LONER);
    expect(result).toMatchObject({ kind: 'joined', organizationId: defaultId, role: 'admin' });
    expect(await membershipOf(LONER)).toMatchObject({
      organization_id: defaultId,
      role: 'admin',
      ai_allowed: false,
    });
    const row = await invitationRow(invitation.id);
    expect(row.accepted_by_user_id).toBe(LONER);
    expect(row.accepted_at).not.toBeNull();
    expect((await storage.listOrganizationInvitations(defaultId))[0].status).toBe('accepted');
  });

  it('is single-use: the second use of the same token is invalid and changes nothing', async () => {
    const { token } = await create(OWNER);
    await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [MEMBER]);
    expect((await storage.acceptOrganizationInvitation(token, LONER)).kind).toBe('joined');
    expect((await storage.acceptOrganizationInvitation(token, MEMBER)).kind).toBe('invalid');
    expect(await membershipOf(MEMBER)).toBeUndefined();
  });

  it('answers invalid, the same, for an unknown, malformed, expired and revoked token', async () => {
    const expired = await create(OWNER);
    await scoped.query(
      `UPDATE organization_invitations SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [expired.invitation.id]
    );
    const revoked = await create(OWNER);
    expect(
      (await storage.revokeOrganizationInvitation(defaultId, OWNER, revoked.invitation.id)).ok
    ).toBe(true);
    for (const token of [
      expired.token,
      revoked.token,
      generateInvitationToken(),
      'short',
      '',
      undefined,
      42,
      null,
    ]) {
      expect(await storage.acceptOrganizationInvitation(token as any, LONER)).toEqual({
        kind: 'invalid',
      });
    }
    expect(await membershipOf(LONER)).toBeUndefined();
    expect(
      (await storage.listOrganizationInvitations(defaultId)).map((r: any) => r.status).sort()
    ).toEqual(['expired', 'revoked']);
  });

  it('is invalid once its organization is switched off', async () => {
    const { token } = await create(OWNER);
    await scoped.query(`UPDATE organizations SET is_active = false WHERE id = $1`, [defaultId]);
    expect((await storage.acceptOrganizationInvitation(token, LONER)).kind).toBe('invalid');
  });

  it('stops working when its creator is demoted or removed, and an admin invitation when its creator stops being an owner', async () => {
    const byAdmin = await create(ADMIN);
    const adminInvite = await create(OWNER, { role: 'admin' });
    await scoped.query(`UPDATE organization_members SET role = 'member' WHERE user_id = $1`, [
      ADMIN,
    ]);
    expect((await storage.acceptOrganizationInvitation(byAdmin.token, LONER)).kind).toBe('invalid');
    // the owner's own invitation still works
    await scoped.query(`UPDATE organization_members SET role = 'admin' WHERE user_id = $1`, [
      OWNER,
    ]);
    await scoped.query(`UPDATE organization_members SET role = 'owner' WHERE user_id = $1`, [
      MEMBER,
    ]);
    expect((await storage.acceptOrganizationInvitation(adminInvite.token, LONER)).kind).toBe(
      'invalid'
    );
    await scoped.query(`UPDATE organization_members SET role = 'owner' WHERE user_id = $1`, [
      OWNER,
    ]);
    const afterRemoval = await create(OWNER);
    await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [OWNER]);
    expect((await storage.acceptOrganizationInvitation(afterRemoval.token, LONER)).kind).toBe(
      'invalid'
    );
    expect(await membershipOf(LONER)).toBeUndefined();
  });

  it('refuses an account of another organization, moves nothing and leaves the invitation pending', async () => {
    const { token, invitation } = await create(OWNER);
    const before = await membershipOf(ACME_MEMBER);
    expect(await storage.acceptOrganizationInvitation(token, ACME_MEMBER)).toEqual({
      kind: 'other_organization',
    });
    expect(await membershipOf(ACME_MEMBER)).toEqual(before);
    expect((await invitationRow(invitation.id)).accepted_at).toBeNull();
    // ... so the person it was meant for can still use it
    expect((await storage.acceptOrganizationInvitation(token, LONER)).kind).toBe('joined');
  });

  it('even an owner of another organization is not moved', async () => {
    const { token } = await create(OWNER);
    expect((await storage.acceptOrganizationInvitation(token, ACME_OWNER)).kind).toBe(
      'other_organization'
    );
    expect(await membershipOf(ACME_OWNER)).toMatchObject({
      organization_id: acmeId,
      role: 'owner',
    });
  });

  it('uses the invitation up for a member of the same organization and changes nothing else', async () => {
    const { token, invitation } = await create(OWNER, { role: 'admin' });
    const before = await membershipOf(MEMBER);
    const result = await storage.acceptOrganizationInvitation(token, MEMBER);
    expect(result).toMatchObject({ kind: 'already_member', organizationId: defaultId });
    expect(await membershipOf(MEMBER)).toEqual(before);
    expect((await invitationRow(invitation.id)).accepted_by_user_id).toBe(MEMBER);
    expect((await storage.acceptOrganizationInvitation(token, LONER)).kind).toBe('invalid');
  });

  it('an invitation for an address is accepted only by an account with that address, in any letter case', async () => {
    const { token } = await create(OWNER, { email: email(LONER).toUpperCase() });
    expect((await storage.acceptOrganizationInvitation(token, MEMBER)).kind).toBe('email_mismatch');
    expect((await storage.acceptOrganizationInvitation(token, ACME_MEMBER)).kind).toBe(
      'email_mismatch'
    );
    expect(
      await rows(`SELECT 1 FROM organization_invitations WHERE accepted_at IS NOT NULL`)
    ).toHaveLength(0);
    expect((await storage.acceptOrganizationInvitation(token, LONER)).kind).toBe('joined');
  });

  it('refuses a deactivated account without using the invitation up', async () => {
    const { token } = await create(OWNER);
    await scoped.query(`UPDATE users SET is_active = false WHERE id = $1`, [LONER]);
    expect((await storage.acceptOrganizationInvitation(token, LONER)).kind).toBe(
      'account_inactive'
    );
    expect(await membershipOf(LONER)).toBeUndefined();
    expect(
      await rows(`SELECT 1 FROM organization_invitations WHERE accepted_at IS NOT NULL`)
    ).toHaveLength(0);
  });

  it('two accounts racing for one token: exactly one membership', async () => {
    const second = Number(
      (
        await one(
          `INSERT INTO users (name, email) VALUES ('Second', 'second@example.com') RETURNING id`
        )
      ).id
    );
    await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [second]);
    for (let round = 0; round < 5; round += 1) {
      await scoped.query(`DELETE FROM organization_members WHERE user_id = ANY($1)`, [
        [LONER, second],
      ]);
      const { token } = await create(OWNER);
      const results = await Promise.all([
        storage.acceptOrganizationInvitation(token, LONER),
        storage.acceptOrganizationInvitation(token, second),
        storage.acceptOrganizationInvitation(token, LONER),
      ]);
      expect(results.filter((r: any) => r.kind === 'joined')).toHaveLength(1);
      expect(results.filter((r: any) => r.kind === 'invalid')).toHaveLength(2);
      const placed = await rows(
        `SELECT user_id FROM organization_members WHERE user_id = ANY($1)`,
        [[LONER, second]]
      );
      expect(placed).toHaveLength(1);
    }
  });

  it('is serialized with the organization lock: it waits while another change holds it', async () => {
    const { token } = await create(OWNER);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const holder = storage.withOrganizationLocks([defaultId], async () => {
      await held;
    });
    await new Promise((r) => setTimeout(r, 100));
    let finished = false;
    const waiting = storage.acceptOrganizationInvitation(token, LONER).then((r: any) => {
      finished = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(finished).toBe(false);
    release();
    await holder;
    expect((await waiting).kind).toBe('joined');
  });
});

describe('registering with an invitation', () => {
  const values = (over: object = {}) => ({
    name: 'Brand New',
    email: 'brand.new@example.com',
    hashedPassword: 'x',
    provider: 'local',
    ...over,
  });

  it('creates the account, its membership without AI access and the use of the invitation together', async () => {
    const { token, invitation } = await create(OWNER, { role: 'admin' });
    const result = await storage.registerWithOrganizationInvitation(token, values());
    expect(result).toMatchObject({ kind: 'registered', organizationId: defaultId, role: 'admin' });
    expect(await membershipOf(result.user.id)).toMatchObject({
      organization_id: defaultId,
      role: 'admin',
      ai_allowed: false,
    });
    expect((await invitationRow(invitation.id)).accepted_by_user_id).toBe(result.user.id);
    expect(
      (
        await storage.registerWithOrganizationInvitation(
          token,
          values({ email: 'again@example.com' })
        )
      ).kind
    ).toBe('invalid');
    expect(await rows(`SELECT 1 FROM users WHERE email = 'again@example.com'`)).toHaveLength(0);
  });

  it('creates nothing for a token that cannot be used', async () => {
    const expired = await create(OWNER);
    await scoped.query(
      `UPDATE organization_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [expired.invitation.id]
    );
    const before = (await one(`SELECT count(*)::int AS n FROM users`)).n;
    for (const token of [expired.token, generateInvitationToken(), 'nope', undefined]) {
      expect(await storage.registerWithOrganizationInvitation(token, values())).toEqual({
        kind: 'invalid',
      });
    }
    expect((await one(`SELECT count(*)::int AS n FROM users`)).n).toBe(before);
  });

  it('refuses a taken address without using the invitation up', async () => {
    const { token, invitation } = await create(OWNER);
    const result = await storage.registerWithOrganizationInvitation(
      token,
      values({ email: email(MEMBER) })
    );
    expect(result).toEqual({ kind: 'email_taken' });
    expect((await invitationRow(invitation.id)).accepted_at).toBeNull();
    expect((await storage.registerWithOrganizationInvitation(token, values())).kind).toBe(
      'registered'
    );
  });

  it('an invitation for an address creates an account for that address only, in any letter case', async () => {
    const { token, invitation } = await create(OWNER, { email: 'Invited@Example.com' });
    expect(await storage.registerWithOrganizationInvitation(token, values())).toEqual({
      kind: 'email_mismatch',
    });
    expect((await invitationRow(invitation.id)).accepted_at).toBeNull();
    expect(
      (
        await storage.registerWithOrganizationInvitation(
          token,
          values({ email: 'INVITED@example.com' })
        )
      ).kind
    ).toBe('registered');
  });

  it('with a provider that did not verify the address, an invitation for an address is not accepted', async () => {
    const { token } = await create(OWNER, { email: 'invited@example.com' });
    const unverified = await storage.registerWithOrganizationInvitation(
      token,
      values({ email: 'invited@example.com', provider: 'github' }),
      { emailVerified: false }
    );
    expect(unverified).toEqual({ kind: 'email_mismatch' });
    const verified = await storage.registerWithOrganizationInvitation(
      token,
      values({ email: 'invited@example.com', provider: 'github' }),
      { emailVerified: true }
    );
    expect(verified.kind).toBe('registered');
    // a link for anyone does not need the address to be verified
    const open = await create(OWNER);
    expect(
      (
        await storage.registerWithOrganizationInvitation(
          open.token,
          values({ email: 'x@example.com' }),
          { emailVerified: false }
        )
      ).kind
    ).toBe('registered');
  });

  it('two sign-ups racing for one token: exactly one account and one membership', async () => {
    for (let round = 0; round < 5; round += 1) {
      const { token } = await create(OWNER);
      const results = await Promise.all(
        [1, 2, 3].map((n) =>
          storage.registerWithOrganizationInvitation(
            token,
            values({ email: `racer${round}-${n}@example.com` })
          )
        )
      );
      expect(results.filter((r: any) => r.kind === 'registered')).toHaveLength(1);
      expect(results.filter((r: any) => r.kind === 'invalid')).toHaveLength(2);
      expect(
        await rows(`SELECT 1 FROM users WHERE email LIKE $1`, [`racer${round}-%`])
      ).toHaveLength(1);
    }
  });

  it('the same address twice at once creates one account, and the other attempt leaves the invitation pending', async () => {
    const first = await create(OWNER);
    const second = await create(OWNER);
    const results = await Promise.all([
      storage.registerWithOrganizationInvitation(first.token, values()),
      storage.registerWithOrganizationInvitation(second.token, values()),
    ]);
    expect(results.map((r: any) => r.kind).sort()).toEqual(['email_taken', 'registered']);
    const pending = await rows(`SELECT 1 FROM organization_invitations WHERE accepted_at IS NULL`);
    expect(pending).toHaveLength(1);
  });
});

describe('revoking', () => {
  it('makes the token unusable, and only owners may revoke an invitation for an admin', async () => {
    const memberInvite = await create(OWNER);
    const adminInvite = await create(OWNER, { role: 'admin' });
    expect(
      await storage.revokeOrganizationInvitation(defaultId, ADMIN, adminInvite.invitation.id)
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      (await storage.revokeOrganizationInvitation(defaultId, ADMIN, memberInvite.invitation.id)).ok
    ).toBe(true);
    expect((await storage.acceptOrganizationInvitation(memberInvite.token, LONER)).kind).toBe(
      'invalid'
    );
    expect(
      await storage.revokeOrganizationInvitation(defaultId, MEMBER, adminInvite.invitation.id)
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      (await storage.revokeOrganizationInvitation(defaultId, OWNER, adminInvite.invitation.id)).ok
    ).toBe(true);
  });

  it('answers 409 for one that is no longer pending and 404 for one of another organization or that does not exist', async () => {
    const used = await create(OWNER);
    await storage.acceptOrganizationInvitation(used.token, LONER);
    expect(
      await storage.revokeOrganizationInvitation(defaultId, OWNER, used.invitation.id)
    ).toMatchObject({ ok: false, status: 409 });
    const acme = await create(ACME_OWNER, {}, acmeId);
    expect(
      await storage.revokeOrganizationInvitation(defaultId, OWNER, acme.invitation.id)
    ).toMatchObject({ ok: false, status: 404 });
    expect(await storage.revokeOrganizationInvitation(defaultId, OWNER, 99999)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect((await invitationRow(acme.invitation.id)).revoked_at).toBeNull();
  });
});

describe('preview', () => {
  it('says what a usable token is for and nothing for any other', async () => {
    const { token } = await create(OWNER, { email: email(LONER), role: 'admin' });
    expect(await storage.previewOrganizationInvitation(token)).toEqual({
      organizationName: 'Default',
      role: 'admin',
      emailHint: 'u***@example.com',
    });
    expect(await storage.previewOrganizationInvitation(generateInvitationToken())).toBeNull();
    expect(await storage.previewOrganizationInvitation('short')).toBeNull();
    await storage.acceptOrganizationInvitation(token, LONER);
    expect(await storage.previewOrganizationInvitation(token)).toBeNull();
  });
});

describe('an account that was removed and joins again', () => {
  it('gets no team access from the directory row it left behind', async () => {
    const team = (
      await one(
        `INSERT INTO teams (name, display_name, organization_id) VALUES ('ops', 'Ops', $1) RETURNING id`,
        [defaultId]
      )
    ).id;
    const teamPage = (
      await one(
        `INSERT INTO wiki_pages (title, slug, content, author, team_id, organization_id)
         VALUES ('Ops page', 'ops-page', '', $1, $2, $3) RETURNING id`,
        [email(OWNER), team, defaultId]
      )
    ).id;
    await scoped.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [team, OWNER]
    );
    await scoped.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')`,
      [team, MEMBER]
    );
    // The directory row of MEMBER, the contact list entry that outlives its removal
    await scoped.query(
      `INSERT INTO members (name, email, role, team_id) VALUES ('Member', $1, 'dev', $2)`,
      [email(MEMBER), team]
    );
    expect(await storage.getUserTeamIds(MEMBER)).toEqual([team]);
    expect(await storage.checkPagePermission(MEMBER, teamPage, 'viewer')).toBe(true);

    expect((await storage.removeOrganizationMember(defaultId, OWNER, MEMBER)).ok).toBe(true);
    expect(await storage.getUserTeamIds(MEMBER)).toEqual([]);

    const { token } = await create(OWNER);
    expect((await storage.acceptOrganizationInvitation(token, MEMBER)).kind).toBe('joined');
    expect(await membershipOf(MEMBER)).toMatchObject({
      organization_id: defaultId,
      role: 'member',
      ai_allowed: false,
    });
    // back in the organization, with the directory row still there: no team access
    expect(
      await rows(`SELECT 1 FROM members WHERE email = $1 AND team_id = $2`, [email(MEMBER), team])
    ).toHaveLength(1);
    expect(await storage.getUserTeamIds(MEMBER)).toEqual([]);
    expect(await storage.getUserTeamRole(MEMBER, team)).toBeNull();
    expect(await storage.checkPagePermission(MEMBER, teamPage, 'viewer')).toBe(false);
  });
});

describe('an invitation goes with the role of the person who created it', () => {
  const statusOf = async (id: number) =>
    (await storage.listOrganizationInvitations(defaultId)).find((r: any) => r.id === id).status;

  it('lowering an admin revokes its pending invitations in the same step, and promoting it again does not revive them', async () => {
    const byAdmin = await create(ADMIN);
    const byOwner = await create(OWNER);
    expect((await storage.changeOrganizationMemberRole(defaultId, OWNER, ADMIN, 'member')).ok).toBe(
      true
    );
    expect(await statusOf(byAdmin.invitation.id)).toBe('revoked');
    expect(await statusOf(byOwner.invitation.id)).toBe('pending');
    expect((await storage.changeOrganizationMemberRole(defaultId, OWNER, ADMIN, 'admin')).ok).toBe(
      true
    );
    expect(await statusOf(byAdmin.invitation.id)).toBe('revoked');
    expect((await storage.acceptOrganizationInvitation(byAdmin.token, LONER)).kind).toBe('invalid');
  });

  it('lowering an owner to admin revokes its invitations for admins and keeps those for members', async () => {
    const second = await create(OWNER, { role: 'admin' });
    const member = await create(OWNER, { role: 'member' });
    await scoped.query(`UPDATE organization_members SET role = 'owner' WHERE user_id = $1`, [
      ADMIN,
    ]);
    expect((await storage.changeOrganizationMemberRole(defaultId, ADMIN, OWNER, 'admin')).ok).toBe(
      true
    );
    expect(await statusOf(second.invitation.id)).toBe('revoked');
    expect(await statusOf(member.invitation.id)).toBe('pending');
  });

  it("removing the creator revokes all of its pending invitations and leaves other people's alone", async () => {
    const byAdmin = await create(ADMIN);
    const byOwner = await create(OWNER);
    expect((await storage.removeOrganizationMember(defaultId, OWNER, ADMIN)).ok).toBe(true);
    expect(await statusOf(byAdmin.invitation.id)).toBe('revoked');
    expect(await statusOf(byOwner.invitation.id)).toBe('pending');
  });

  it('an invitation already accepted stays accepted when its creator is lowered', async () => {
    const used = await create(ADMIN);
    await storage.acceptOrganizationInvitation(used.token, LONER);
    await storage.changeOrganizationMemberRole(defaultId, OWNER, ADMIN, 'member');
    expect(await statusOf(used.invitation.id)).toBe('accepted');
  });

  it('the owner of a switched-off organization is told so', async () => {
    await scoped.query(`UPDATE organizations SET is_active = false WHERE id = $1`, [defaultId]);
    const refused = await storage.createOrganizationInvitation(defaultId, OWNER, {
      email: null,
      role: 'member',
      expiresInDays: 7,
    });
    expect(refused).toMatchObject({
      ok: false,
      status: 403,
      body: { code: 'organization_inactive', message: 'The organization is switched off' },
    });
  });
});

describe('an address is taken when an account has it ignoring case', () => {
  it('registering with an invitation under a case variant of an existing address creates nothing', async () => {
    const { token, invitation } = await create(OWNER);
    const result = await storage.registerWithOrganizationInvitation(token, {
      name: 'Variant',
      email: email(MEMBER).toUpperCase(),
      hashedPassword: 'x',
      provider: 'local',
    });
    expect(result).toEqual({ kind: 'email_taken' });
    expect((await invitationRow(invitation.id)).accepted_at).toBeNull();
    expect(await rows(`SELECT 1 FROM users WHERE lower(email) = $1`, [email(MEMBER)])).toHaveLength(
      1
    );
  });
});

describe('migration 0029', () => {
  const exists = async (client: Pool) =>
    (await client.query(`SELECT to_regclass('organization_invitations') AS t`)).rows[0].t !== null;

  it('creates the table with the names drizzle-kit derives, and is idempotent', async () => {
    await scoped.query(`TRUNCATE organization_invitations`);
    await scoped.query(UP);
    await scoped.query(UP);
    const constraints = (
      await rows(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'organization_invitations'::regclass ORDER BY conname`
      )
    ).map((r) => r.conname);
    expect(constraints).toEqual([
      'organization_invitations_accepted_by_user_id_users_id_fk',
      'organization_invitations_created_by_user_id_users_id_fk',
      'organization_invitations_organization_id_organizations_id_fk',
      'organization_invitations_pkey',
    ]);
    const indexes = (
      await rows(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'organization_invitations' AND schemaname = current_schema() ORDER BY indexname`
      )
    ).map((r) => r.indexname);
    expect(indexes).toEqual([
      'idx_organization_invitations_organization_id',
      'organization_invitations_pkey',
      'organization_invitations_token_hash_unique',
    ]);
    // a token hash is unique
    await scoped.query(
      `INSERT INTO organization_invitations (organization_id, token_hash, expires_at) VALUES ($1, 'h', now())`,
      [defaultId]
    );
    await expect(
      scoped.query(
        `INSERT INTO organization_invitations (organization_id, token_hash, expires_at) VALUES ($1, 'h', now())`,
        [defaultId]
      )
    ).rejects.toThrow(/unique/i);
    await scoped.query(`TRUNCATE organization_invitations`);
  });

  it('deleting the account that created an invitation leaves the invitation, without a creator (so it is unusable)', async () => {
    const { invitation } = await create(OWNER);
    await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [OWNER]);
    await scoped.query(`DELETE FROM users WHERE id = $1`, [OWNER]);
    expect((await invitationRow(invitation.id)).created_by_user_id).toBeNull();
  });

  it('down refuses while an invitation is pending, then drops the table; up again restores it', async () => {
    await seed();
    const { invitation } = await create(OWNER);
    await expect(scoped.query(DOWN)).rejects.toThrow(/still pending/);
    expect(await exists(scoped)).toBe(true);
    expect((await invitationRow(invitation.id)).id).toBe(invitation.id);
    await scoped.query(`UPDATE organization_invitations SET revoked_at = now()`);
    await scoped.query(DOWN);
    expect(await exists(scoped)).toBe(false);
    await scoped.query(DOWN); // nothing to do
    await scoped.query(UP);
    expect(await exists(scoped)).toBe(true);
  });

  it('is left alone on a database without organizations (a fresh install: push creates the table)', async () => {
    const fresh = 'l4_x1d_fresh';
    await admin.query(`DROP SCHEMA IF EXISTS ${fresh} CASCADE`);
    await admin.query(`CREATE SCHEMA ${fresh}`);
    const url = new URL(DATABASE_URL!);
    url.searchParams.set('options', `-c search_path=${fresh}`);
    const pool = new Pool({ connectionString: url.toString() });
    try {
      await pool.query(UP);
      expect(await exists(pool)).toBe(false);
      await pool.query(DOWN);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${fresh} CASCADE`);
    }
  });
});
