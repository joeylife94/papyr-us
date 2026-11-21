/**
 * Layer 4: the per-team setting "members can edit team pages" against real Postgres (WP7).
 *
 * The rule: on a page of a team whose `members_can_edit` is on, a current plain member of that
 * team is an editor (read, comment, edit). Owners and admins of the team stay owners of its
 * pages; explicit grants still count and the stronger level wins; the setting never gives page
 * owner rights (permissions, delete, moving a page to another team). It never reaches beyond the
 * team: a member of another team, an account of another organization, a signed-out caller and a
 * team of another organization are unaffected, whatever their own setting says.
 *
 * Every reader of team-page access says the same: checkPagePermission (REST), the realtime level
 * (getUserPagePermission), the in-memory reader of comment recipients
 * (getReadableOrganizationMembers) and the sharing view's baseline. Teams are created with the
 * setting on by createTeam and createTeamWithOwner, the only two inserts of the application.
 * A change of the setting runs under the team's lock and is made by an owner or admin of the team
 * only.
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

const SCHEMA = 'l4_wp7_members_can_edit';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

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

type Level = 'viewer' | 'commenter' | 'editor' | 'owner';
type Seen = Level | 'none';
const LEVELS: Level[] = ['owner', 'editor', 'commenter', 'viewer'];

let admin: Pool;
let scoped: Pool;
let storage: any;
let defaultOrg = 0;
let acmeOrg = 0;
let counter = 0;

const one = async (text: string, params: unknown[] = []) =>
  (await scoped.query(text, params)).rows[0];

interface Person {
  id: number;
  email: string;
}
async function newUser(label: string, organization: 'default' | 'acme' | 'none' = 'default') {
  counter += 1;
  const email = `${label}-${counter}@example.com`;
  const row = await one(`INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`, [
    `${label} ${counter}`,
    email,
  ]);
  const id = Number(row.id);
  if (organization === 'acme') {
    await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
      acmeOrg,
      id,
    ]);
  } else if (organization === 'none') {
    await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [id]);
  }
  return { id, email } as Person;
}
async function newTeam(label: string, organization: number, membersCanEdit: boolean) {
  counter += 1;
  const row = await one(
    `INSERT INTO teams (name, display_name, organization_id, members_can_edit)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`${label}-${counter}`, `${label} ${counter}`, organization, membersCanEdit]
  );
  return Number(row.id);
}
const join = (teamId: number, who: Person, role = 'member') =>
  scoped.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)`, [
    teamId,
    who.id,
    role,
  ]);
async function newPage(
  teamId: number | null,
  grants: Array<[string, number | null, string]> = [],
  organization = defaultOrg
) {
  counter += 1;
  // A recorded creator, so the author text decides nothing
  const row = await one(
    `INSERT INTO wiki_pages (title, slug, content, author, organization_id, team_id, created_by_user_id)
     VALUES ($1, $2, '', 'Automation', $3, $4, NULL) RETURNING id`,
    [`Page ${counter}`, `wp7-page-${counter}`, organization, teamId]
  );
  const id = Number(row.id);
  for (const [type, entityId, permission] of grants) {
    await scoped.query(
      `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission) VALUES ($1, $2, $3, $4)`,
      [id, type, entityId, permission]
    );
  }
  return id;
}
const setting = (teamId: number, value: boolean) =>
  scoped.query(`UPDATE teams SET members_can_edit = $1 WHERE id = $2`, [value, teamId]);

/** The highest level checkPagePermission grants, or 'none'. */
async function levelOf(userId: number | undefined, pageId: number): Promise<Seen> {
  for (const level of LEVELS) {
    if (await storage.checkPagePermission(userId, pageId, level)) return level;
  }
  return 'none';
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(TABLES);
  defaultOrg = await addOrganizations(scoped);
  acmeOrg = Number(
    (await one(`INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`)).id
  );
  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

/** One team T (owner, admin, two members), a second team T2, and people outside them. */
interface World {
  T: number;
  T2: number;
  owner: Person;
  admin: Person;
  member: Person;
  member2: Person;
  otherTeamMember: Person; // member of T2 only
  orgOnly: Person; // in the organization, in no team
  outsider: Person; // other organization
}
async function world(settingT: boolean, settingT2 = false): Promise<World> {
  const w = {
    T: await newTeam('t', defaultOrg, settingT),
    T2: await newTeam('t2', defaultOrg, settingT2),
    owner: await newUser('owner'),
    admin: await newUser('admin'),
    member: await newUser('member'),
    member2: await newUser('member2'),
    otherTeamMember: await newUser('otherteam'),
    orgOnly: await newUser('orgonly'),
    outsider: await newUser('outsider', 'acme'),
  };
  await join(w.T, w.owner, 'owner');
  await join(w.T, w.admin, 'admin');
  await join(w.T, w.member);
  await join(w.T, w.member2);
  await join(w.T2, w.otherTeamMember);
  return w;
}

/** The shapes of a team page; each says who holds what before the setting is considered. */
function shapes(w: World): Record<string, Array<[string, number | null, string]>> {
  return {
    'no grants': [],
    'member created it (owner grant)': [['user', w.member.id, 'owner']],
    'member viewer grant': [['user', w.member.id, 'viewer']],
    'member2 commenter grant': [['user', w.member2.id, 'commenter']],
    'member2 editor grant': [['user', w.member2.id, 'editor']],
    'team grant to T2 (editor)': [['team', w.T2, 'editor']],
    'public commenter': [['public', null, 'commenter']],
  };
}

describe('a plain member of a team with the setting on edits the team pages', () => {
  it('off: viewer; on: editor, never owner; managers stay owners; nobody else changes', async () => {
    for (const on of [false, true]) {
      const w = await world(on);
      const page = await newPage(w.T);
      expect(await levelOf(w.owner.id, page), 'team owner').toBe('owner');
      expect(await levelOf(w.admin.id, page), 'team admin').toBe('owner');
      expect(await levelOf(w.member.id, page), `member, setting ${on}`).toBe(
        on ? 'editor' : 'viewer'
      );
      expect(await levelOf(w.member2.id, page), `member2, setting ${on}`).toBe(
        on ? 'editor' : 'viewer'
      );
      expect(await storage.checkPagePermission(w.member.id, page, 'owner')).toBe(false);
      for (const [who, label] of [
        [w.otherTeamMember, 'member of another team'],
        [w.orgOnly, 'organization member in no team'],
        [w.outsider, 'account of another organization'],
        [undefined, 'signed out'],
      ] as Array<[Person | undefined, string]>) {
        expect(await levelOf(who?.id, page), `${label}, setting ${on}`).toBe('none');
      }
    }
  });

  it('commenter and editor are granted exactly when the setting is on', async () => {
    const off = await world(false);
    const on = await world(true);
    const pageOff = await newPage(off.T);
    const pageOn = await newPage(on.T);
    for (const level of ['viewer', 'commenter', 'editor', 'owner'] as Level[]) {
      expect(await storage.checkPagePermission(off.member.id, pageOff, level), `off ${level}`).toBe(
        level === 'viewer'
      );
      expect(await storage.checkPagePermission(on.member.id, pageOn, level), `on ${level}`).toBe(
        level !== 'owner'
      );
    }
  });

  it('the setting is read when asked: turning it off or on changes the next answer', async () => {
    const w = await world(true);
    const page = await newPage(w.T);
    expect(await levelOf(w.member.id, page)).toBe('editor');
    await setting(w.T, false);
    expect(await levelOf(w.member.id, page)).toBe('viewer');
    await setting(w.T, true);
    expect(await levelOf(w.member.id, page)).toBe('editor');
  });

  it('a member who left the team, and a deleted membership row, hold nothing from it', async () => {
    const w = await world(true);
    const page = await newPage(w.T);
    await scoped.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [
      w.T,
      w.member.id,
    ]);
    expect(await levelOf(w.member.id, page)).toBe('none');
  });
});

describe('the setting belongs to its team only', () => {
  it('the setting of another team of the same organization does not reach this team’s pages', async () => {
    const w = await world(false, true); // T off, T2 on
    const pageT = await newPage(w.T);
    const pageT2 = await newPage(w.T2);
    expect(await levelOf(w.member.id, pageT)).toBe('viewer');
    expect(await levelOf(w.otherTeamMember.id, pageT2)).toBe('editor');
    expect(await levelOf(w.otherTeamMember.id, pageT)).toBe('none');
    // a member of both teams holds each team's own setting
    await join(w.T2, w.member);
    expect(await levelOf(w.member.id, pageT)).toBe('viewer');
    expect(await levelOf(w.member.id, pageT2)).toBe('editor');
  });

  it('a team of another organization has no effect on this organization, in either direction', async () => {
    const w = await world(false);
    const acmeTeam = await newTeam('acme-t', acmeOrg, true);
    const acmeMember = await newUser('acme-member', 'acme');
    await join(acmeTeam, acmeMember, 'owner');
    const acmePage = await newPage(acmeTeam, [], acmeOrg);
    const homePage = await newPage(w.T);
    // The team's own organization is served as usual
    expect(await levelOf(acmeMember.id, acmePage)).toBe('owner');
    const acmePlain = await newUser('acme-plain', 'acme');
    await join(acmeTeam, acmePlain);
    expect(await levelOf(acmePlain.id, acmePage)).toBe('editor');
    // Nothing crosses: not into the other organization's team page, not out of it
    expect(await levelOf(w.member.id, acmePage)).toBe('none');
    expect(await levelOf(acmePlain.id, homePage)).toBe('none');
    // A membership row left in a team of another organization gives nothing there
    await join(acmeTeam, w.orgOnly);
    expect(await levelOf(w.orgOnly.id, acmePage)).toBe('none');
    expect(await storage.getUserPagePermission(w.orgOnly.id, acmePage)).toBeNull();
  });

  it('team-less pages are not touched by any setting', async () => {
    const w = await world(true, true);
    const open = await newPage(null);
    const restricted = await newPage(null, [['user', w.owner.id, 'owner']]);
    expect(await levelOf(w.member.id, open)).toBe('owner'); // legacy open page, as before
    expect(await levelOf(w.member.id, restricted)).toBe('none');
  });
});

describe('explicit grants still apply, the stronger one wins', () => {
  it('on: an owner grant stays owner, a viewer or commenter grant is lifted to editor', async () => {
    const w = await world(true);
    const owned = await newPage(w.T, [['user', w.member.id, 'owner']]);
    const viewer = await newPage(w.T, [['user', w.member.id, 'viewer']]);
    const commenter = await newPage(w.T, [['user', w.member.id, 'commenter']]);
    const teamGrant = await newPage(w.T, [['team', w.T2, 'owner']]);
    await join(w.T2, w.member);
    expect(await levelOf(w.member.id, owned)).toBe('owner');
    expect(await levelOf(w.member.id, viewer)).toBe('editor');
    expect(await levelOf(w.member.id, commenter)).toBe('editor');
    // a team grant to another team the member belongs to is stronger than the setting
    expect(await levelOf(w.member.id, teamGrant)).toBe('owner');
  });

  it('off: grants alone decide, as before', async () => {
    const w = await world(false);
    const editorGrant = await newPage(w.T, [['user', w.member.id, 'editor']]);
    const viewerGrant = await newPage(w.T, [['user', w.member.id, 'viewer']]);
    expect(await levelOf(w.member.id, editorGrant)).toBe('editor');
    expect(await levelOf(w.member.id, viewerGrant)).toBe('viewer');
  });

  it('a person grant to someone outside the team still gives nothing, with the setting on', async () => {
    const w = await world(true);
    const page = await newPage(w.T, [['user', w.orgOnly.id, 'editor']]);
    expect(await levelOf(w.orgOnly.id, page)).toBe('none');
  });
});

describe('every reader of team-page access says the same', () => {
  it('realtime: a member gets editor with the setting on, nothing more, and the same as REST for the team’s people', async () => {
    for (const on of [false, true]) {
      const w = await world(on);
      for (const [label, grants] of Object.entries(shapes(w))) {
        const page = await newPage(w.T, grants);
        for (const [who, name] of [
          [w.owner, 'owner'],
          [w.admin, 'admin'],
          [w.member, 'member'],
          [w.member2, 'member2'],
        ] as Array<[Person, string]>) {
          const realtime = await storage.getUserPagePermission(who.id, page);
          const canEditRealtime = realtime === 'owner' || realtime === 'editor';
          const canEditRest = await storage.checkPagePermission(who.id, page, 'editor');
          expect(canEditRealtime, `${name} on "${label}", setting ${on}: realtime edit`).toBe(
            canEditRest
          );
        }
      }
      const plain = await newPage(w.T);
      expect(await storage.getUserPagePermission(w.member.id, plain)).toBe(on ? 'editor' : null);
      expect(await storage.getUserPagePermission(w.admin.id, plain)).toBe('owner');
      // someone outside the team holds nothing in realtime either
      expect(await storage.getUserPagePermission(w.otherTeamMember.id, plain)).toBeNull();
      expect(await storage.getUserPagePermission(w.outsider.id, plain)).toBeNull();
    }
  });

  it('the in-memory reader of comment recipients agrees with checkPagePermission(viewer) with the setting on and off', async () => {
    for (const on of [false, true]) {
      const w = await world(on);
      const everyone = [w.owner, w.admin, w.member, w.member2, w.otherTeamMember, w.orgOnly];
      for (const [label, grants] of Object.entries(shapes(w))) {
        const page = await newPage(w.T, grants);
        const readers = await storage.getReadableOrganizationMembers(
          defaultOrg,
          page,
          everyone.map((p) => p.id)
        );
        for (const person of everyone) {
          const expected = await storage.checkPagePermission(person.id, page, 'viewer');
          expect(readers.has(person.id), `${person.email} on "${label}", setting ${on}`).toBe(
            Boolean(expected)
          );
        }
      }
    }
  });
});

describe('the sharing view says what members get without a grant', () => {
  it('the team baseline names the setting', async () => {
    const w = await world(false);
    const page = await newPage(w.T);
    const view = await storage.getPageSharing(page, w.owner.id, true);
    expect(view.baseline).toMatchObject({ kind: 'team', level: 'viewer' });
    await setting(w.T, true);
    const after = await storage.getPageSharing(page, w.owner.id, true);
    expect(after.baseline).toMatchObject({ kind: 'team', level: 'editor' });
    // the same for a reader who does not manage the page
    const asMember = await storage.getPageSharing(page, w.member.id, false);
    expect(asMember.baseline).toMatchObject({ kind: 'team', level: 'editor' });
  });
});

describe('teams are created with the setting on', () => {
  it('createTeamWithOwner (the team create route) and createTeam both create it on, whatever the input says', async () => {
    const creator = await newUser('creator');
    const viaOwner = await storage.createTeamWithOwner(
      { name: 'wp7-created-1', displayName: 'Created 1', membersCanEdit: false },
      creator.id
    );
    expect(viaOwner.membersCanEdit).toBe(true);
    const viaPlain = await storage.createTeam(
      { name: 'wp7-created-2', displayName: 'Created 2', membersCanEdit: false },
      defaultOrg
    );
    expect(viaPlain.membersCanEdit).toBe(true);
    const stored = await scoped.query(
      `SELECT name, members_can_edit FROM teams WHERE name IN ('wp7-created-1', 'wp7-created-2')`
    );
    expect(stored.rows.map((row) => row.members_can_edit)).toEqual([true, true]);
    // and the creator, the owner of the new team, hands the setting out as asked: a member edits
    const member = await newUser('created-member');
    await join(viaOwner.id, member);
    const page = await newPage(viaOwner.id);
    expect(await levelOf(member.id, page)).toBe('editor');
  });

  it('a team row inserted without the column (any other path) is off, so it never widens by accident', async () => {
    const row = await one(
      `INSERT INTO teams (name, display_name, organization_id) VALUES ('wp7-raw', 'raw', $1)
       RETURNING members_can_edit`,
      [defaultOrg]
    );
    expect(row.members_can_edit).toBe(false);
  });
});

describe('setTeamMembersCanEdit runs under the team lock and only for owners and admins', () => {
  let w: World;
  beforeEach(async () => {
    w = await world(false);
  });
  const stored = async (teamId: number) =>
    (await one(`SELECT members_can_edit FROM teams WHERE id = $1`, [teamId])).members_can_edit;

  it('an owner and an admin change it, and the answer names who must re-check', async () => {
    const byOwner = await storage.setTeamMembersCanEdit(w.T, w.owner.id, true);
    expect(byOwner.ok).toBe(true);
    expect(byOwner.value.changed).toBe(true);
    expect(byOwner.value.team.membersCanEdit).toBe(true);
    expect([...byOwner.value.memberIds].sort()).toEqual(
      [w.owner.id, w.admin.id, w.member.id, w.member2.id].sort()
    );
    expect(await stored(w.T)).toBe(true);
    const byAdmin = await storage.setTeamMembersCanEdit(w.T, w.admin.id, false);
    expect(byAdmin.ok).toBe(true);
    expect(await stored(w.T)).toBe(false);
  });

  it('saying the same value again changes nothing and says so', async () => {
    const again = await storage.setTeamMembersCanEdit(w.T, w.owner.id, false);
    expect(again.ok).toBe(true);
    expect(again.value.changed).toBe(false);
  });

  it('a plain member, a member of another team, an organization member outside the team, another organization and an unknown team are refused and nothing changes', async () => {
    for (const [who, label] of [
      [w.member, 'plain member'],
      [w.otherTeamMember, 'member of another team'],
      [w.orgOnly, 'organization member in no team'],
      [w.outsider, 'account of another organization'],
    ] as Array<[Person, string]>) {
      const result = await storage.setTeamMembersCanEdit(w.T, who.id, true);
      expect(result.ok, label).toBe(false);
      expect(result.status, label).toBe(403);
      expect(await stored(w.T), label).toBe(false);
    }
    const unknown = await storage.setTeamMembersCanEdit(999999, w.owner.id, true);
    expect(unknown.ok).toBe(false);
  });

  it('an owner of a team of another organization cannot change this team', async () => {
    const acmeTeam = await newTeam('acme-own', acmeOrg, false);
    const acmeOwner = await newUser('acme-owner', 'acme');
    await join(acmeTeam, acmeOwner, 'owner');
    expect((await storage.setTeamMembersCanEdit(w.T, acmeOwner.id, true)).ok).toBe(false);
    // a row of that owner in this team (left over across organizations) counts for nothing
    await join(w.T, acmeOwner, 'owner');
    expect((await storage.setTeamMembersCanEdit(w.T, acmeOwner.id, true)).ok).toBe(false);
    expect(await stored(w.T)).toBe(false);
  });

  it('a deactivated owner cannot change it', async () => {
    await scoped.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [w.owner.id]);
    const result = await storage.setTeamMembersCanEdit(w.T, w.owner.id, true);
    expect(result.ok).toBe(false);
    expect(await stored(w.T)).toBe(false);
  });

  it('waits for the team lock and reads the actor again afterwards: an admin demoted meanwhile is refused', async () => {
    const holder = await scoped.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `team-members:${w.T}`,
      ]);
      const pending = storage.setTeamMembersCanEdit(w.T, w.admin.id, true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      await holder.query(
        `UPDATE team_members SET role = 'member' WHERE team_id = $1 AND user_id = $2`,
        [w.T, w.admin.id]
      );
      await holder.query('COMMIT');
      const result = await pending;
      expect(result.ok).toBe(false);
      expect(await stored(w.T)).toBe(false);
    } finally {
      holder.release();
    }
  });

  it('a wait past the lock timeout is a TeamBusyError, not a write', async () => {
    const holder = await scoped.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `team-members:${w.T}`,
      ]);
      await expect(
        storage.setTeamMembersCanEdit(w.T, w.owner.id, true, { lockTimeoutMs: 100 })
      ).rejects.toMatchObject({ name: 'TeamBusyError' });
      expect(await stored(w.T)).toBe(false);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });
});
