/**
 * Layer 4: who may edit a page, on every surface, against real Postgres (WP5).
 *
 * `DBStorage.canEditPage` is the one decision behind the page UI's edit mode, the REST write
 * routes and the realtime `/yjs` channel. It must equal `checkPagePermission(…, 'editor')` for
 * every grant shape: it may neither grant what that denies nor deny what that grants.
 *
 * `/yjs` used to decide with `getUserPagePermission` (owner or editor). `CHANGED_ON_YJS` lists
 * every case where that rule and the shared one differ, so a change of the `/yjs` answer is a
 * visible, reviewed line and nothing else moves.
 *
 * Teams, memberships, grants and organizations are real rows; nothing is stubbed. The tables live
 * in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'yjs_edit_permission_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let storage: any;

// People. `email` matters only for authorship.
const U = {
  author: 11, // wrote the pages below (implicit owner)
  grantee: 12, // user grant 'editor'
  commenter: 13, // user grant 'commenter'
  teamEditor: 14, // member of team A; team A holds an 'editor' grant on some pages
  teamViewer: 15, // member of team B; team B holds a 'viewer' grant
  manager: 16, // admin of team A
  member: 17, // plain member of team A, no grant of their own
  removed: 18, // used to be in team A: user grants remain, membership row is gone
  outsider: 19, // same organization, no team, no grant
  stranger: 20, // member of team C; team C holds an 'editor' grant on team A's page
  cross: 21, // another organization, with grants on default-organization pages
  publicUser: 22, // same organization, no team
} as const;
type Who = keyof typeof U | 'signedOut';
const WHO: Who[] = [...(Object.keys(U) as Array<keyof typeof U>), 'signedOut'];
const email = (name: string) => `${name}@example.com`;

let teamA: number;
let teamB: number;
let teamC: number;
const page: Record<string, number> = {};

async function insertPage(slug: string, teamId: number | null, author: string, orgId?: number) {
  const { rows } = await admin.query(
    `INSERT INTO ${SCHEMA}.wiki_pages (title, slug, content, folder, author, team_id, organization_id)
     VALUES ($1, $1, 'x', 'perm', $2, $3, COALESCE($4, (SELECT id FROM ${SCHEMA}.organizations WHERE slug = 'default')))
     RETURNING id`,
    [slug, author, teamId, orgId ?? null]
  );
  page[slug] = rows[0].id;
}

async function grant(
  slug: string,
  entityType: 'user' | 'team' | 'public',
  entityId: number | null,
  permission: string
) {
  await admin.query(
    `INSERT INTO ${SCHEMA}.page_permissions (page_id, entity_type, entity_id, permission)
     VALUES ($1, $2, $3, $4)`,
    [page[slug], entityType, entityId, permission]
  );
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  await admin.query(`SET search_path TO ${SCHEMA}`);
  const c = await admin.connect();
  try {
    await c.query(`SET search_path TO ${SCHEMA}`);
    await c.query(`
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
        blocks JSONB DEFAULT '[]', folder TEXT NOT NULL, tags TEXT[] NOT NULL DEFAULT '{}',
        author TEXT NOT NULL, parent_id INTEGER, position INTEGER,
        team_id INTEGER CONSTRAINT wiki_pages_team_id_teams_id_fk REFERENCES teams(id) ON DELETE RESTRICT,
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
    `);
  } finally {
    c.release();
  }
  await admin.query(`RESET search_path`);
  const defaultOrg = await addOrganizations(admin, SCHEMA, {
    users: Object.entries(U).map(([name, id]) => ({ id, email: email(name) })),
  });
  const q = (sql: string, params: unknown[] = []) =>
    admin.query(sql.replaceAll('@', `${SCHEMA}.`), params);

  // A second organization: `cross` belongs to it, not to the default one
  const acme = (
    await q(`INSERT INTO @organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`)
  ).rows[0].id;
  await q(`UPDATE @organization_members SET organization_id = $1 WHERE user_id = $2`, [
    acme,
    U.cross,
  ]);

  const team = async (name: string) =>
    (
      await q(
        `INSERT INTO @teams (name, display_name, organization_id) VALUES ($1, $1, $2) RETURNING id`,
        [name, defaultOrg]
      )
    ).rows[0].id as number;
  teamA = await team('perm-a');
  teamB = await team('perm-b');
  teamC = await team('perm-c');
  const join = (teamId: number, user: number, role = 'member') =>
    q(`INSERT INTO @team_members (team_id, user_id, role) VALUES ($1, $2, $3)`, [
      teamId,
      user,
      role,
    ]);
  await join(teamA, U.author);
  await join(teamA, U.grantee);
  await join(teamA, U.commenter);
  await join(teamA, U.teamEditor);
  await join(teamA, U.manager, 'admin');
  await join(teamA, U.member);
  await join(teamB, U.teamViewer);
  await join(teamC, U.stranger);
  // `removed` has no team_members row: a former member whose user grants were never deleted

  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();

  // --- pages -------------------------------------------------------------------------------
  // A legacy page: no team, no permission rows
  await insertPage('legacy-open', null, 'nobody@example.com');
  // Team-less, written by `author`, shared to others by rows (so it is not "open")
  await insertPage('authored', null, email('author'));
  await grant('authored', 'user', U.grantee, 'editor');
  await grant('authored', 'user', U.commenter, 'commenter');
  await grant('authored', 'team', teamB, 'viewer');
  // Team-less, written by someone else, nobody here owns it: only explicit rows apply
  await insertPage('rows-only', null, 'nobody@example.com');
  await grant('rows-only', 'user', U.grantee, 'owner');
  await grant('rows-only', 'user', U.commenter, 'commenter');
  await grant('rows-only', 'team', teamB, 'viewer');
  // A team page of team A with grants of every kind
  await insertPage('team-a-rows', teamA, email('author'));
  await grant('team-a-rows', 'user', U.grantee, 'editor');
  await grant('team-a-rows', 'user', U.commenter, 'commenter');
  await grant('team-a-rows', 'user', U.removed, 'editor');
  await grant('team-a-rows', 'team', teamC, 'editor'); // a team other than the page's own
  // A team page of team A with no rows at all
  await insertPage('team-a-bare', teamA, 'nobody@example.com');
  // A team page whose own team holds the editor grant
  await insertPage('team-a-team-grant', teamA, 'nobody@example.com');
  await grant('team-a-team-grant', 'team', teamA, 'editor');
  // Public grants
  await insertPage('public-editor', null, 'nobody@example.com');
  await grant('public-editor', 'public', null, 'editor');
  await insertPage('public-viewer', null, 'nobody@example.com');
  await grant('public-viewer', 'public', null, 'viewer');
  await grant('public-viewer', 'user', U.grantee, 'editor');
  // Another organization's page, with and without a stray grant for a default-organization user
  await insertPage('acme-open', null, 'nobody@example.com', acme);
  await insertPage('acme-rows', null, 'nobody@example.com', acme);
  await grant('acme-rows', 'user', U.grantee, 'editor');
  // A default-organization page that names the other organization's user
  await insertPage('default-names-cross', null, 'nobody@example.com');
  await grant('default-names-cross', 'user', U.cross, 'editor');
  await grant('default-names-cross', 'user', U.grantee, 'viewer');
});

afterAll(async () => {
  await storage?.pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

const id = (who: Who) => (who === 'signedOut' ? undefined : U[who]);

/** What `/yjs` decided before WP5: the user's highest permission row (or manager) is owner/editor. */
async function editOnYjsBefore(who: Who, slug: string): Promise<boolean> {
  const userId = id(who);
  if (userId === undefined) return false;
  const permission = await storage.getUserPagePermission(userId, page[slug]);
  return permission === 'owner' || permission === 'editor';
}

/** Who may edit each page (the REST rule, which the shared decision now equals). */
const EDITORS: Record<string, Who[]> = {
  // open to every signed-in member of the organization
  'legacy-open': [...WHO.filter((w) => w !== 'signedOut' && w !== 'cross')],
  // the author (implicit owner) and the user grant; a commenter grant and a team's viewer grant do not
  authored: ['author', 'grantee'],
  'rows-only': ['grantee'],
  // team A page: the author while a member, the grantee while a member, the team's manager, and
  // team C's editor grant reaches `stranger`; a removed member keeps nothing
  'team-a-rows': ['author', 'grantee', 'manager', 'stranger'],
  'team-a-bare': ['manager'],
  'team-a-team-grant': ['author', 'grantee', 'commenter', 'teamEditor', 'manager', 'member'],
  'public-editor': [...WHO],
  'public-viewer': ['grantee'],
  'acme-open': ['cross'],
  'acme-rows': [],
  'default-names-cross': [],
};
// 'default-names-cross' (a default-organization page naming another organization's user): the
// stray grant reaches nobody there, and the in-organization grantee has only 'viewer'.

/**
 * Cases where the shared decision and the old `/yjs` rule differ. 'granted': `/yjs` now accepts
 * edits it refused before; 'denied': it refused edits it used to accept.
 */
const signedInOfOrganization = WHO.filter((w) => w !== 'signedOut' && w !== 'cross');
const CHANGED_ON_YJS: Array<[string, Who, 'granted' | 'denied']> = [
  // legacy team-less page without permission rows: every signed-in member of the organization
  ...signedInOfOrganization.map((w): [string, Who, 'granted'] => ['legacy-open', w, 'granted']),
  // implicit author ownership, without a permission row
  ['authored', 'author', 'granted'],
  ['team-a-rows', 'author', 'granted'],
  // a grant to a team other than the page's own team
  ['team-a-rows', 'stranger', 'granted'],
  // a public editor grant, for signed-in people of any organization and for signed-out callers
  ...WHO.map((w): [string, Who, 'granted'] => ['public-editor', w, 'granted']),
  // a legacy open page of the person's own (second) organization
  ['acme-open', 'cross', 'granted'],
];

describe('canEditPage equals checkPagePermission(…, editor) (real Postgres)', () => {
  const slugs = Object.keys(EDITORS);

  it('pins who may edit each page, for every kind of grant', async () => {
    const actual: Record<string, Who[]> = {};
    for (const slug of slugs) {
      const editors: Who[] = [];
      for (const who of WHO) {
        if (await storage.canEditPage(id(who), page[slug])) editors.push(who);
      }
      actual[slug] = editors.sort();
    }
    const expected = Object.fromEntries(
      slugs.map((slug) => [slug, [...EDITORS[slug]].sort()])
    ) as Record<string, Who[]>;
    expect(actual).toEqual(expected);
  });

  it('never differs from checkPagePermission(…, editor), for any person on any page', async () => {
    for (const slug of slugs) {
      for (const who of WHO) {
        const shared = await storage.canEditPage(id(who), page[slug]);
        const rest = await storage.checkPagePermission(id(who), page[slug], 'editor');
        expect(shared, `${who} on ${slug}`).toBe(rest);
      }
    }
  });

  it('follows the permission order: whoever may own may edit, whoever may edit may comment', async () => {
    for (const slug of slugs) {
      for (const who of WHO) {
        const owner = await storage.checkPagePermission(id(who), page[slug], 'owner');
        const commenter = await storage.checkPagePermission(id(who), page[slug], 'commenter');
        const editor = await storage.canEditPage(id(who), page[slug]);
        // anyone who may own may edit; anyone who may edit may comment
        if (owner) expect(editor, `${who} owns ${slug}`).toBe(true);
        if (editor) expect(commenter, `${who} edits ${slug}`).toBe(true);
      }
    }
  });

  it('lists exactly the cases where /yjs answers differently than before', async () => {
    const changed: Array<[string, Who, 'granted' | 'denied']> = [];
    for (const slug of slugs) {
      for (const who of WHO) {
        const before = await editOnYjsBefore(who, slug);
        const now = await storage.canEditPage(id(who), page[slug]);
        if (before !== now) changed.push([slug, who, now ? 'granted' : 'denied']);
      }
    }
    // Record the table for the pull request description
    console.log(`YJS_EDIT_CHANGES ${JSON.stringify(changed)}`);
    expect(changed).toEqual(CHANGED_ON_YJS);
  });

  it('a page that does not exist answers like the REST rule (the join answers PAGE_NOT_FOUND)', async () => {
    const missing = 2_000_000_000;
    expect(await storage.canEditPage(U.grantee, missing)).toBe(
      await storage.checkPagePermission(U.grantee, missing, 'editor')
    );
  });
});
