/**
 * Layer 4: page sharing against real Postgres (WP4).
 *
 * Public grants carry at most `commenter`. Every reader of public grants honours a stored
 * `editor` or `owner` public grant as `viewer`:
 * - `checkPagePermission` (signed out and signed in, any organization);
 * - the page lists and by-id reads (`readableBy`/`listableBy`, through search and link
 *   resolution);
 * - the in-memory reader of comment recipients (`getReadableOrganizationMembers`, extended in
 *   comment-notifications.test.ts).
 * No stored row is rewritten.
 *
 * The sharing view names the people and teams of the page's organization and nobody else, shows
 * no emails and no ids unless the caller manages the page, and the candidate search lists active
 * members and teams of the page's organization only: two characters, ten results.
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

const SCHEMA = 'l4_wp4_sharing';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let scoped: Pool;
let storage: any;
let defaultOrg = 0;
let otherOrg = 0;
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
`;

interface Person {
  id: number;
  name: string;
  email: string;
}

type Where = 'default' | 'other' | 'none';

async function newUser(
  label: string,
  options: { name?: string; active?: boolean; organization?: Where } = {}
): Promise<Person> {
  counter += 1;
  const email = `${label}-${counter}@example.com`;
  const name = options.name ?? `${label} Person ${counter}`;
  const { rows } = await scoped.query(
    `INSERT INTO users (name, email, is_active) VALUES ($1, $2, $3) RETURNING id`,
    [name, email, options.active ?? true]
  );
  const id = Number(rows[0].id);
  if (options.organization === 'other') {
    await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
      otherOrg,
      id,
    ]);
  } else if (options.organization === 'none') {
    await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [id]);
  }
  return { id, name, email };
}

async function newTeam(label: string, organization = defaultOrg, displayName?: string) {
  counter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO teams (name, display_name, organization_id) VALUES ($1, $2, $3) RETURNING id`,
    [`${label}-${counter}`, displayName ?? `${label} ${counter}`, organization]
  );
  return Number(rows[0].id);
}

async function joinTeam(teamId: number, person: Person, role = 'member') {
  await scoped.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)`, [
    teamId,
    person.id,
    role,
  ]);
}

async function newPage(
  options: {
    creator?: Person | null;
    organization?: number;
    teamId?: number | null;
    grants?: Array<[string, number | null, string]>;
  } = {}
) {
  counter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, organization_id, team_id, created_by_user_id)
     VALUES ($1, $2, '', $3, $4, $5, $6) RETURNING id`,
    [
      `Page ${counter}`,
      `page-${counter}`,
      options.creator?.email ?? 'Automation',
      options.organization ?? defaultOrg,
      options.teamId ?? null,
      options.creator?.id ?? null,
    ]
  );
  const id = Number(rows[0].id);
  for (const [type, entityId, permission] of options.grants ?? []) {
    await scoped.query(
      `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission) VALUES ($1, $2, $3, $4)`,
      [id, type, entityId, permission]
    );
  }
  return { id, slug: `page-${counter}` };
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(TABLES);
  defaultOrg = await addOrganizations(scoped);
  const { rows } = await scoped.query(
    `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
  );
  otherOrg = Number(rows[0].id);

  process.env.DATABASE_URL = scopedUrl;
  const storageModule = await import('../../server/storage.js');
  storage = new storageModule.DBStorage();
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

type Level = 'viewer' | 'commenter' | 'editor' | 'owner';
const LEVELS: Level[] = ['viewer', 'commenter', 'editor', 'owner'];

/** What a public grant stored at each level gives: the level it is honoured as. */
const HONOURED: Record<string, Level | null> = {
  viewer: 'viewer',
  commenter: 'commenter',
  editor: 'viewer',
  owner: 'viewer',
  bogus: null,
};

const RANK: Record<Level, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

describe('a public grant carries viewer or commenter at most, for every reader', () => {
  it('checkPagePermission honours a stored editor or owner public grant as viewer, for signed-out callers and accounts of other organizations', async () => {
    const creator = await newUser('pg-creator');
    const outsider = await newUser('pg-outsider', { organization: 'other' });
    const homeless = await newUser('pg-homeless', { organization: 'none' });
    const unrelatedMember = await newUser('pg-unrelated');
    for (const stored of Object.keys(HONOURED)) {
      const page = await newPage({
        creator,
        grants: [
          ['user', creator.id, 'owner'],
          ['public', null, stored],
        ],
      });
      const honoured = HONOURED[stored];
      for (const [who, userId] of [
        ['signed out', undefined],
        ['account of another organization', outsider.id],
        ['account without an organization', homeless.id],
        ['member without a grant', unrelatedMember.id],
      ] as Array<[string, number | undefined]>) {
        for (const required of LEVELS) {
          const expected = honoured !== null && RANK[honoured] >= RANK[required];
          const allowed = await storage.checkPagePermission(userId, page.id, required);
          // A member of the page's organization on a page with grants has no other way in, so
          // the public grant is all that decides for the member without a grant too.
          expect(allowed, `${who}, public ${stored}, needs ${required}`).toBe(expected);
        }
      }
    }
  });

  it('a stored public grant does not lower anyone who holds a grant of their own', async () => {
    const creator = await newUser('pl-creator');
    const editor = await newUser('pl-editor');
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['user', editor.id, 'editor'],
        ['public', null, 'viewer'],
      ],
    });
    expect(await storage.checkPagePermission(editor.id, page.id, 'editor')).toBe(true);
    expect(await storage.checkPagePermission(creator.id, page.id, 'owner')).toBe(true);
    expect(await storage.checkPagePermission(undefined, page.id, 'editor')).toBe(false);
  });

  it('page reads and lists agree: a stored editor or owner public grant is readable and listable exactly as a viewer grant is', async () => {
    const creator = await newUser('rl-creator');
    const member = await newUser('rl-member');
    const outsider = await newUser('rl-outsider', { organization: 'other' });
    const pages: Record<string, { id: number; slug: string }> = {};
    for (const stored of Object.keys(HONOURED)) {
      pages[stored] = await newPage({
        creator,
        grants: [
          ['user', creator.id, 'owner'],
          ['public', null, stored],
        ],
      });
    }
    const viewers = {
      member: await storage.getPageViewer(member.id),
      outsider: await storage.getPageViewer(outsider.id),
      anonymous: await storage.getPageViewer(undefined),
    };
    for (const stored of Object.keys(HONOURED)) {
      const page = pages[stored];
      const reads = HONOURED[stored] !== null;
      for (const [who, viewer] of Object.entries(viewers)) {
        // By id (the rule of GET /api/pages/:id): any honoured public grant reads
        const found = await storage.resolveReadablePageLinks(viewer, [page.id]);
        const readable = found.length === 1;
        expect(readable, `${who} reads a public ${stored} page by id`).toBe(reads);
        expect(
          readable,
          `${who}: by-id read agrees with checkPagePermission(viewer) on a public ${stored} page`
        ).toBe(
          await storage.checkPagePermission(
            who === 'member' ? member.id : who === 'outsider' ? outsider.id : undefined,
            page.id,
            'viewer'
          )
        );
        // In lists: only the page's own organization lists it, whatever the public grant says
        const listed = await storage.searchWikiPages({ query: '' }, { readableBy: viewer });
        const isListed = listed.pages.some((p: { id: number }) => p.id === page.id);
        expect(isListed, `${who} lists a public ${stored} page`).toBe(who === 'member' && reads);
      }
    }
  });

  it('writes no row: the stored level stays as it was', async () => {
    const creator = await newUser('nw-creator');
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['public', null, 'editor'],
      ],
    });
    await storage.checkPagePermission(undefined, page.id, 'viewer');
    await storage.getPageSharing(page.id, creator.id, true);
    const { rows } = await scoped.query(
      `SELECT permission FROM page_permissions WHERE page_id = $1 AND entity_type = 'public'`,
      [page.id]
    );
    expect(rows.map((row) => row.permission)).toEqual(['editor']);
  });
});

describe('the caller’s own level on a page', () => {
  it('is the highest level the caller holds, and none without read access', async () => {
    const creator = await newUser('lv-creator');
    const viewer = await newUser('lv-viewer');
    const commenter = await newUser('lv-commenter');
    const editor = await newUser('lv-editor');
    const nobody = await newUser('lv-nobody');
    const outsider = await newUser('lv-outsider', { organization: 'other' });
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['user', viewer.id, 'viewer'],
        ['user', commenter.id, 'commenter'],
        ['user', editor.id, 'editor'],
      ],
    });
    expect(await storage.getPageLevel(creator.id, page.id)).toBe('owner');
    expect(await storage.getPageLevel(editor.id, page.id)).toBe('editor');
    expect(await storage.getPageLevel(commenter.id, page.id)).toBe('commenter');
    expect(await storage.getPageLevel(viewer.id, page.id)).toBe('viewer');
    expect(await storage.getPageLevel(nobody.id, page.id)).toBeNull();
    expect(await storage.getPageLevel(outsider.id, page.id)).toBeNull();
    expect(await storage.getPageLevel(undefined, page.id)).toBeNull();
  });

  it('on a publicly shared page, a signed-out caller and an outsider hold the honoured public level', async () => {
    const creator = await newUser('lp-creator');
    const outsider = await newUser('lp-outsider', { organization: 'other' });
    const commentable = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['public', null, 'commenter'],
      ],
    });
    const stored = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['public', null, 'editor'],
      ],
    });
    expect(await storage.getPageLevel(undefined, commentable.id)).toBe('commenter');
    expect(await storage.getPageLevel(outsider.id, commentable.id)).toBe('commenter');
    expect(await storage.getPageLevel(outsider.id, stored.id)).toBe('viewer');
    expect(await storage.getPageLevel(undefined, stored.id)).toBe('viewer');
  });
});

describe('the sharing view', () => {
  it('names people and teams of the page organization; a manager also gets ids and emails, others never', async () => {
    const creator = await newUser('sv-creator', { name: 'Ada Owner' });
    const editor = await newUser('sv-editor', { name: 'Grace Editor' });
    const viewer = await newUser('sv-viewer', { name: 'Linus Viewer' });
    const teamId = await newTeam('sv-team', defaultOrg, 'Design Team');
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['user', editor.id, 'editor'],
        ['user', viewer.id, 'viewer'],
        ['team', teamId, 'commenter'],
      ],
    });

    const asOwner = await storage.getPageSharing(page.id, creator.id, true);
    expect(asOwner.entries).toHaveLength(4);
    const byName = Object.fromEntries(asOwner.entries.map((e: any) => [e.name, e]));
    expect(byName['Grace Editor']).toMatchObject({
      entityType: 'user',
      permission: 'editor',
      email: editor.email,
      entityId: editor.id,
      isYou: false,
    });
    expect(typeof byName['Grace Editor'].grantId).toBe('number');
    expect(byName['Ada Owner'].isYou).toBe(true);
    expect(byName['Design Team']).toMatchObject({ entityType: 'team', permission: 'commenter' });

    const asReader = await storage.getPageSharing(page.id, viewer.id, false);
    expect(asReader.entries).toHaveLength(4);
    for (const entry of asReader.entries) {
      expect(Object.keys(entry).sort()).toEqual(['entityType', 'isYou', 'name', 'permission']);
    }
    const text = JSON.stringify(asReader);
    expect(text).not.toContain('@example.com');
    expect(asReader.entries.find((e: any) => e.name === 'Linus Viewer').isYou).toBe(true);
  });

  it('leaves out grants to accounts and teams outside the page organization, and shows a former member only to a manager, without name or email', async () => {
    const creator = await newUser('fm-creator');
    const stranger = await newUser('fm-stranger', { name: 'Stranger Name', organization: 'other' });
    const former = await newUser('fm-former', { name: 'Former Name', organization: 'none' });
    const deactivated = await newUser('fm-off', { name: 'Off Name', active: false });
    const foreignTeam = await newTeam('fm-foreign', otherOrg, 'Foreign Team');
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['user', stranger.id, 'editor'],
        ['user', former.id, 'viewer'],
        ['user', deactivated.id, 'viewer'],
        ['team', foreignTeam, 'viewer'],
      ],
    });
    const asOwner = await storage.getPageSharing(page.id, creator.id, true);
    const text = JSON.stringify(asOwner);
    for (const secret of ['Stranger Name', 'Former Name', 'Off Name', 'Foreign Team']) {
      expect(text, secret).not.toContain(secret);
    }
    expect(text).not.toContain(former.email);
    expect(text).not.toContain(deactivated.email);
    expect(text).not.toContain(stranger.email);
    // Accounts that are no longer active members are listed (so they can be removed), unnamed
    expect(asOwner.entries.filter((e: any) => e.former === true)).toHaveLength(2);
    for (const entry of asOwner.entries.filter((e: any) => e.former === true)) {
      expect(entry.email).toBeUndefined();
      expect(typeof entry.grantId).toBe('number');
    }
    // Grants to another organization's accounts and teams are not shown at all
    expect(asOwner.entries).toHaveLength(3);
    const asReader = await storage.getPageSharing(page.id, creator.id, false);
    expect(asReader.entries.map((e: any) => e.isYou)).toEqual([true]);
  });

  it('describes who can read without a grant: team members of a team page, the organization on an open page, nobody extra on a restricted page', async () => {
    const creator = await newUser('bl-creator');
    const teamId = await newTeam('bl-team', defaultOrg, 'Platform');
    const teamPage = await newPage({ creator, teamId, grants: [['user', creator.id, 'owner']] });
    const open = await newPage({ creator });
    const restricted = await newPage({ creator, grants: [['user', creator.id, 'owner']] });
    expect((await storage.getPageSharing(teamPage.id, creator.id, true)).baseline).toEqual({
      kind: 'team',
      name: 'Platform',
      level: 'viewer',
    });
    expect((await storage.getPageSharing(open.id, creator.id, true)).baseline).toEqual({
      kind: 'organization',
      level: 'viewer',
    });
    expect((await storage.getPageSharing(restricted.id, creator.id, true)).baseline).toEqual({
      kind: 'restricted',
    });
  });

  it('reports the public grant at the level it is honoured as; the stored level and the row id only to a manager', async () => {
    const creator = await newUser('pa-creator');
    const none = await newPage({ creator, grants: [['user', creator.id, 'owner']] });
    const capped = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['public', null, 'owner'],
      ],
    });
    const commenter = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['public', null, 'commenter'],
      ],
    });
    expect((await storage.getPageSharing(none.id, creator.id, true)).publicAccess).toBeNull();
    const ownerView = (await storage.getPageSharing(capped.id, creator.id, true)).publicAccess;
    expect(ownerView).toMatchObject({ level: 'viewer', storedLevel: 'owner' });
    expect(typeof ownerView.grantId).toBe('number');
    const readerView = (await storage.getPageSharing(capped.id, creator.id, false)).publicAccess;
    expect(readerView).toEqual({ level: 'viewer' });
    expect((await storage.getPageSharing(commenter.id, creator.id, false)).publicAccess).toEqual({
      level: 'commenter',
    });
  });

  it('answers nothing for an unknown or deleted page', async () => {
    const creator = await newUser('un-creator');
    const page = await newPage({ creator, grants: [['user', creator.id, 'owner']] });
    await scoped.query(`UPDATE wiki_pages SET deleted_at = NOW() WHERE id = $1`, [page.id]);
    expect(await storage.getPageSharing(page.id, creator.id, true)).toBeNull();
    expect(await storage.getPageSharing(999999, creator.id, true)).toBeNull();
  });
});

describe('the candidate search of the sharing dialog', () => {
  it('lists active members and teams of the page organization, from two characters, never the caller or another organization', async () => {
    const creator = await newUser('cs-creator', { name: 'Zed Caller' });
    const member = await newUser('cs-member', { name: 'Zed Member' });
    const inactive = await newUser('cs-inactive', { name: 'Zed Inactive', active: false });
    const outsider = await newUser('cs-outsider', { name: 'Zed Outsider', organization: 'other' });
    const homeless = await newUser('cs-homeless', { name: 'Zed Homeless', organization: 'none' });
    const team = await newTeam('cs-team', defaultOrg, 'Zed Squad');
    const foreign = await newTeam('cs-foreign', otherOrg, 'Zed Foreign');
    const page = await newPage({ creator, grants: [['user', creator.id, 'owner']] });

    const found = await storage.listPageShareCandidates(page.id, creator.id, 'zed');
    expect(found.people.map((p: any) => p.userId)).toEqual([member.id]);
    expect(found.people[0]).toEqual({ userId: member.id, name: 'Zed Member', email: member.email });
    expect(found.teams).toEqual([{ teamId: team, name: 'Zed Squad' }]);
    const text = JSON.stringify(found);
    for (const hidden of [inactive, outsider, homeless]) expect(text).not.toContain(hidden.email);
    expect(text).not.toContain('Zed Foreign');
    expect(found.morePeople).toBe(false);
    expect(foreign).toBeGreaterThan(0);

    // An email matches too, so the owner can find a person by it
    const byEmail = await storage.listPageShareCandidates(page.id, creator.id, member.email);
    expect(byEmail.people.map((p: any) => p.userId)).toEqual([member.id]);
  });

  it('returns nothing under two characters, ten at most with a flag for more, and takes % and _ literally', async () => {
    const creator = await newUser('c2-creator', { name: 'Mia Caller' });
    for (let i = 0; i < 12; i++)
      await newUser(`c2-${i}`, { name: `Quill ${String(i).padStart(2, '0')}` });
    await newUser('c2-pct', { name: 'Fifty%Off' });
    await newUser('c2-under', { name: 'Under_Score' });
    await newUser('c2-plain', { name: 'UnderXScore' });
    const page = await newPage({ creator, grants: [['user', creator.id, 'owner']] });

    expect(await storage.listPageShareCandidates(page.id, creator.id, 'q')).toEqual({
      people: [],
      teams: [],
      morePeople: false,
      moreTeams: false,
    });
    expect(await storage.listPageShareCandidates(page.id, creator.id, ' q ')).toMatchObject({
      people: [],
    });
    const many = await storage.listPageShareCandidates(page.id, creator.id, 'Quill');
    expect(many.people).toHaveLength(10);
    expect(many.morePeople).toBe(true);
    expect((await storage.listPageShareCandidates(page.id, creator.id, '%')).people).toHaveLength(
      0
    );
    const pct = await storage.listPageShareCandidates(page.id, creator.id, 'y%');
    expect(pct.people.map((p: any) => p.name)).toEqual(['Fifty%Off']);
    const under = await storage.listPageShareCandidates(page.id, creator.id, 'r_s');
    expect(under.people.map((p: any) => p.name)).toEqual(['Under_Score']);
  });

  it('answers nothing for a page of another organization than the caller’s', async () => {
    const outsider = await newUser('co-outsider', { organization: 'other' });
    await newUser('co-target', { name: 'Target Person' });
    const page = await newPage({ creator: null });
    expect(await storage.listPageShareCandidates(page.id, outsider.id, 'Target')).toEqual({
      people: [],
      teams: [],
      morePeople: false,
      moreTeams: false,
    });
  });
});

type PublicRow = [number | null, string];
const LEVEL_OF: Record<string, Level | null> = {
  viewer: 'viewer',
  commenter: 'commenter',
  editor: 'viewer',
  owner: 'viewer',
  bogus: null,
};
/** What several public rows give together: the strongest honoured level. */
const together = (rows: PublicRow[]): Level | null => {
  let best: Level | null = null;
  for (const [, permission] of rows) {
    const level = LEVEL_OF[permission] ?? null;
    if (level !== null && (best === null || RANK[level] > RANK[best])) best = level;
  }
  return best;
};

describe('several public rows of one page are decided the same way by every reader', () => {
  const SETS: PublicRow[][] = [
    [
      [null, 'bogus'],
      [null, 'viewer'],
    ],
    [
      [null, 'viewer'],
      [null, 'bogus'],
    ],
    [
      [null, 'owner'],
      [null, 'commenter'],
    ],
    [
      [null, 'commenter'],
      [null, 'owner'],
    ],
    [
      [7, 'viewer'],
      [null, 'commenter'],
    ],
    [[7, 'commenter']],
    [
      [null, 'bogus'],
      [null, 'bogus'],
    ],
    [
      [null, 'editor'],
      [null, 'bogus'],
      [null, 'viewer'],
    ],
  ];

  it('checkPagePermission, the by-id read, the page list and the recipient reader all use the strongest honoured level', async () => {
    const creator = await newUser('mr-creator');
    const member = await newUser('mr-member');
    const outsider = await newUser('mr-outsider', { organization: 'other' });
    const viewers = {
      member: await storage.getPageViewer(member.id),
      outsider: await storage.getPageViewer(outsider.id),
      anonymous: await storage.getPageViewer(undefined),
    };
    for (const set of SETS) {
      const page = await newPage({
        creator,
        grants: [
          ['user', creator.id, 'owner'],
          ...set.map(
            ([entityId, permission]) =>
              ['public', entityId, permission] as [string, number | null, string]
          ),
        ],
      });
      const honoured = together(set);
      const label = JSON.stringify(set);
      for (const [who, userId] of [
        ['signed out', undefined],
        ['outsider', outsider.id],
        ['member', member.id],
      ] as Array<[string, number | undefined]>) {
        for (const required of LEVELS) {
          const expected = honoured !== null && RANK[honoured] >= RANK[required];
          expect(
            await storage.checkPagePermission(userId, page.id, required),
            `${label}: ${who} needs ${required}`
          ).toBe(expected);
        }
      }
      for (const [who, viewer] of Object.entries(viewers)) {
        const readable = (await storage.resolveReadablePageLinks(viewer, [page.id])).length === 1;
        expect(readable, `${label}: ${who} reads by id (readableBy)`).toBe(honoured !== null);
        const listed = (
          await storage.searchWikiPages({ query: '' }, { readableBy: viewer })
        ).pages.some((p: { id: number }) => p.id === page.id);
        expect(listed, `${label}: ${who} lists (listableBy)`).toBe(
          who === 'member' && honoured !== null
        );
      }
      const readers = await storage.getReadableOrganizationMembers(defaultOrg, page.id, [
        member.id,
      ]);
      expect(readers.has(member.id), `${label}: recipient reader`).toBe(honoured !== null);
      const sharing = await storage.getPageSharing(page.id, creator.id, true);
      expect(sharing.publicAccess?.level ?? null, `${label}: sharing view`).toBe(honoured);
    }
  });

  it('setting the public level replaces every public row with one that names nobody; off removes them all; other grants stay', async () => {
    const creator = await newUser('sp-creator');
    const friend = await newUser('sp-friend');
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['user', friend.id, 'viewer'],
        ['public', null, 'owner'],
        ['public', 7, 'viewer'],
        ['public', null, 'bogus'],
      ],
    });
    const rows = async () =>
      (
        await scoped.query(
          `SELECT entity_type, entity_id, permission FROM page_permissions WHERE page_id = $1 ORDER BY id`,
          [page.id]
        )
      ).rows;
    await storage.setPagePublicAccess(page.id, 'commenter', creator.id);
    const after = await rows();
    expect(after.filter((r: any) => r.entity_type === 'public')).toEqual([
      { entity_type: 'public', entity_id: null, permission: 'commenter' },
    ]);
    expect(after.filter((r: any) => r.entity_type === 'user')).toHaveLength(2);
    expect(await storage.checkPagePermission(undefined, page.id, 'commenter')).toBe(true);

    await storage.setPagePublicAccess(page.id, 'viewer', creator.id);
    expect((await rows()).filter((r: any) => r.entity_type === 'public')).toEqual([
      { entity_type: 'public', entity_id: null, permission: 'viewer' },
    ]);
    await storage.setPagePublicAccess(page.id, null, creator.id);
    expect((await rows()).filter((r: any) => r.entity_type === 'public')).toEqual([]);
    expect(await storage.checkPagePermission(undefined, page.id, 'viewer')).toBe(false);
    expect((await rows()).filter((r: any) => r.entity_type === 'user')).toHaveLength(2);
  });
});

describe('a share link is deleted only through the page it belongs to', () => {
  it('deletes the link of that page and nothing else, and says whether it did', async () => {
    const creator = await newUser('dl-creator');
    const mine = await newPage({ creator, grants: [['user', creator.id, 'owner']] });
    const other = await newPage({ creator, grants: [['user', creator.id, 'owner']] });
    const link = async (pageId: number, token: string) =>
      scoped.query(
        `INSERT INTO public_links (page_id, token, permission) VALUES ($1, $2, 'viewer')`,
        [pageId, token]
      );
    await scoped.query(`CREATE TABLE IF NOT EXISTS public_links (
      id SERIAL PRIMARY KEY, page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE, password TEXT, permission TEXT NOT NULL DEFAULT 'viewer',
      expires_at TIMESTAMP, created_by INTEGER, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_accessed_at TIMESTAMP, access_count INTEGER NOT NULL DEFAULT 0)`);
    await link(mine.id, `mine-${mine.id}`);
    await link(other.id, `other-${other.id}`);
    expect(await storage.deletePublicLinkForPage(mine.id, `other-${other.id}`)).toBe(false);
    expect(await storage.deletePublicLinkForPage(999999, `other-${other.id}`)).toBe(false);
    expect(await storage.getPublicLink(`other-${other.id}`)).toBeDefined();
    expect(await storage.deletePublicLinkForPage(other.id, `other-${other.id}`)).toBe(true);
    expect(await storage.getPublicLink(`other-${other.id}`)).toBeUndefined();
    expect(await storage.getPublicLink(`mine-${mine.id}`)).toBeDefined();
    expect(await storage.deletePublicLinkForPage(other.id, `other-${other.id}`)).toBe(false);
  });
});

describe('on a team page a person grant must be one that gives access', () => {
  it('only a current member of the page team can be granted; a deactivated account, another organization and an unknown id cannot, on any page', async () => {
    const creator = await newUser('tg-creator');
    const teamId = await newTeam('tg-team');
    const member = await newUser('tg-member');
    const outsider = await newUser('tg-outsider');
    const off = await newUser('tg-off', { active: false });
    const foreign = await newUser('tg-foreign', { organization: 'other' });
    await joinTeam(teamId, creator, 'owner');
    await joinTeam(teamId, member);
    await joinTeam(teamId, off);
    const teamPage = await newPage({ creator, teamId, grants: [['user', creator.id, 'owner']] });
    const plain = await newPage({ creator, grants: [['user', creator.id, 'owner']] });
    const ok = (pageId: number, id: number) =>
      storage.isGranteeInPageOrganization(pageId, 'user', id);
    expect(await ok(teamPage.id, member.id)).toBe(true);
    expect(await ok(teamPage.id, outsider.id)).toBe(false);
    expect(await ok(teamPage.id, off.id)).toBe(false);
    expect(await ok(teamPage.id, foreign.id)).toBe(false);
    expect(await ok(teamPage.id, 987654)).toBe(false);
    // A team-less page takes any active member of the organization
    expect(await ok(plain.id, outsider.id)).toBe(true);
    expect(await ok(plain.id, off.id)).toBe(false);
    expect(await ok(plain.id, foreign.id)).toBe(false);
    // Teams are decided as before
    const otherTeam = await newTeam('tg-other-team');
    expect(await storage.isGranteeInPageOrganization(teamPage.id, 'team', otherTeam)).toBe(true);
  });

  it('the person search of a team page lists current members of that team only; teams stay as they are', async () => {
    const creator = await newUser('ts-creator', { name: 'Tess Caller' });
    const teamId = await newTeam('ts-team', defaultOrg, 'Tess Squad');
    const member = await newUser('ts-member', { name: 'Tess Member' });
    await newUser('ts-other', { name: 'Tess Outside' });
    await joinTeam(teamId, creator, 'owner');
    await joinTeam(teamId, member);
    const page = await newPage({ creator, teamId, grants: [['user', creator.id, 'owner']] });
    const found = await storage.listPageShareCandidates(page.id, creator.id, 'tess');
    expect(found.people.map((p: any) => p.userId)).toEqual([member.id]);
    expect(found.teams.map((t: any) => t.name)).toEqual(['Tess Squad']);
  });

  it('an existing grant to a non-member is kept and marked as having no effect, for managers only', async () => {
    const creator = await newUser('ne-creator');
    const teamId = await newTeam('ne-team');
    const member = await newUser('ne-member', { name: 'Neo Member' });
    const stray = await newUser('ne-stray', { name: 'Neo Stray' });
    await joinTeam(teamId, creator, 'owner');
    await joinTeam(teamId, member);
    const page = await newPage({
      creator,
      teamId,
      grants: [
        ['user', creator.id, 'owner'],
        ['user', member.id, 'editor'],
        ['user', stray.id, 'editor'],
      ],
    });
    const asOwner = await storage.getPageSharing(page.id, creator.id, true);
    const byName = Object.fromEntries(asOwner.entries.map((e: any) => [e.name, e]));
    expect(byName['Neo Stray'].noEffect).toBe(true);
    expect(byName['Neo Member'].noEffect).toBeUndefined();
    expect(byName[creator.name].noEffect).toBeUndefined();
    const asReader = await storage.getPageSharing(page.id, member.id, false);
    for (const entry of asReader.entries) expect(entry).not.toHaveProperty('noEffect');
    expect(
      (
        await scoped.query(`SELECT 1 FROM page_permissions WHERE page_id = $1 AND entity_id = $2`, [
          page.id,
          stray.id,
        ])
      ).rowCount
    ).toBe(1);
  });
});
