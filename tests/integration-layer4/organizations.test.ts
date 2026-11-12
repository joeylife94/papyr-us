/**
 * Layer 4: organizations against real Postgres (issue #124 X1a).
 *
 * Migration, drizzle/0022_add_organizations.sql on tables in their pre-organization shape:
 * - additive: every existing account, team and page lands in one "default" organization, no row
 *   or existing column changes, and the new columns are NOT NULL under the constraint names
 *   shared/schema.ts gives them;
 * - idempotent: a second run changes nothing;
 * - a team page cannot hold another organization than its team's (wiki_pages_team_org_fk);
 * - reversible: drizzle/0022_add_organizations.down.sql refuses while two organizations exist,
 *   otherwise removes only the organization tables and columns, and 0022 applies again after it.
 *
 * Boundary, DBStorage on the migrated tables with a second organization:
 * - single-page checks: nothing but a public grant reaches across organizations, and a
 *   team-less page without permissions opens only to signed-in members of its organization;
 * - listings never show another organization's pages, publicly shared ones included;
 * - team membership and roles only count inside the account's organization;
 * - a new page takes its team's organization or its creator's, and never none; a new team its
 *   creator's; grants only name users and teams of the page's organization;
 * - new accounts join the default organization; an account keeps the one it has.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'organizations_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const read = (file: string) =>
  readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8');
const UP = read('0022_add_organizations.sql');
const DOWN = read('0022_add_organizations.down.sql');
// The storage tests below run on the upgraded shape: 0024 (#124 X1c) adds organizations.ai_enabled.
const AI_SETTING = read('0024_add_organization_ai_setting.sql');

let admin: Pool;
let scoped: Pool;
let storage: any;

const PRE_ORGANIZATION_TABLES = `
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
`;

async function columnsOf(table: string) {
  const { rows } = await scoped.query(
    `SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name`,
    [SCHEMA, table]
  );
  return rows as Array<{ column_name: string; is_nullable: string }>;
}

async function constraintNames() {
  const { rows } = await scoped.query(
    `SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = $1 ORDER BY c.conname`,
    [SCHEMA]
  );
  return rows.map((row: any) => row.conname as string);
}

/** Rows as they were before 0022, in the columns that existed then. */
async function snapshot() {
  const users = await scoped.query(`SELECT id, name, email, is_active FROM users ORDER BY id`);
  const teams = await scoped.query(`SELECT id, name, display_name FROM teams ORDER BY id`);
  const pages = await scoped.query(
    `SELECT id, title, slug, content, folder, author, team_id, deleted_at FROM wiki_pages ORDER BY id`
  );
  return { users: users.rows, teams: teams.rows, pages: pages.rows };
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(PRE_ORGANIZATION_TABLES);
  // A deployment before X1: two accounts, a team, a team page, a trashed team page and a
  // team-less page.
  await scoped.query(`
    INSERT INTO users (id, name, email) VALUES (1, 'Ann', 'ann@example.com'),
                                               (2, 'Ben', 'ben@example.com');
    INSERT INTO teams (id, name, display_name) VALUES (1, 'old-team', 'Old Team');
    INSERT INTO team_members (team_id, user_id, role) VALUES (1, 1, 'owner');
    INSERT INTO wiki_pages (id, title, slug, content, folder, author, team_id, deleted_at)
    VALUES (1, 'Team page', 'team-page', 'x', 'docs', 'ann@example.com', 1, NULL),
           (2, 'Trashed', 'trashed', 'x', 'docs', 'ann@example.com', 1, NOW()),
           (3, 'Personal', 'personal', 'x', 'docs', 'ben@example.com', NULL, NULL);
    SELECT setval(pg_get_serial_sequence('users', 'id'), 2);
    SELECT setval(pg_get_serial_sequence('teams', 'id'), 1);
    SELECT setval(pg_get_serial_sequence('wiki_pages', 'id'), 3);
  `);
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('0022 organizations migration (real Postgres)', () => {
  it('moves every account, team and page into the default organization; idempotent', async () => {
    const before = await snapshot();
    await scoped.query(UP);
    await scoped.query(UP);

    const { rows: organizations } = await scoped.query(`SELECT id, slug FROM organizations`);
    expect(organizations).toEqual([{ id: expect.any(Number), slug: 'default' }]);
    const defaultId = organizations[0].id;
    const { rows: memberships } = await scoped.query(
      `SELECT user_id, organization_id, role FROM organization_members ORDER BY user_id`
    );
    expect(memberships).toEqual([
      { user_id: 1, organization_id: defaultId, role: 'member' },
      { user_id: 2, organization_id: defaultId, role: 'member' },
    ]);
    const { rows: teamOrgs } = await scoped.query(`SELECT DISTINCT organization_id FROM teams`);
    expect(teamOrgs).toEqual([{ organization_id: defaultId }]);
    const { rows: pageOrgs } = await scoped.query(
      `SELECT id, organization_id FROM wiki_pages ORDER BY id`
    );
    expect(pageOrgs).toEqual([1, 2, 3].map((id) => ({ id, organization_id: defaultId })));

    // Nothing that existed before changed
    expect(await snapshot()).toEqual(before);

    expect((await columnsOf('teams')).find((c) => c.column_name === 'organization_id')).toEqual({
      column_name: 'organization_id',
      is_nullable: 'NO',
    });
    expect(
      (await columnsOf('wiki_pages')).find((c) => c.column_name === 'organization_id')
    ).toEqual({ column_name: 'organization_id', is_nullable: 'NO' });
    expect(await constraintNames()).toEqual(
      expect.arrayContaining([
        'organizations_slug_unique',
        'organization_members_organization_id_organizations_id_fk',
        'organization_members_user_id_users_id_fk',
        'teams_organization_id_organizations_id_fk',
        'teams_id_organization_id_unique',
        'wiki_pages_organization_id_organizations_id_fk',
        'wiki_pages_team_org_fk',
      ])
    );
    const { rows: indexes } = await scoped.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 ORDER BY indexname`,
      [SCHEMA]
    );
    expect(indexes.map((i: any) => i.indexname)).toEqual(
      expect.arrayContaining([
        'organization_members_user_id_unique',
        'idx_wiki_pages_organization_id',
      ])
    );
  });

  it("keeps a team page in its team's organization", async () => {
    await scoped.query(`
      INSERT INTO organizations (id, slug, name) VALUES (900, 'probe', 'Probe');
      INSERT INTO teams (id, name, display_name, organization_id)
      VALUES (900, 'probe-team', 'Probe Team', 900);
    `);
    // Moving the default organization's team page into the probe organization's team
    const moved = await scoped
      .query(`UPDATE wiki_pages SET team_id = 900 WHERE id = 1`)
      .catch((error: any) => error);
    expect(moved.code).toBe('23503');
    expect(moved.constraint).toBe('wiki_pages_team_org_fk');
    // An account belongs to one organization at most
    const second = await scoped
      .query(`INSERT INTO organization_members (organization_id, user_id) VALUES (900, 1)`)
      .catch((error: any) => error);
    expect(second.code).toBe('23505');
  });

  it('reverts only while one organization exists, then applies again', async () => {
    await expect(scoped.query(DOWN)).rejects.toThrow(/more than one organization/);
    expect((await columnsOf('wiki_pages')).map((c) => c.column_name)).toContain('organization_id');

    await scoped.query(
      `DELETE FROM teams WHERE id = 900; DELETE FROM organizations WHERE id = 900`
    );
    const before = await snapshot();
    await scoped.query(DOWN);
    expect((await columnsOf('wiki_pages')).map((c) => c.column_name)).not.toContain(
      'organization_id'
    );
    expect((await columnsOf('teams')).map((c) => c.column_name)).not.toContain('organization_id');
    expect(await columnsOf('organizations')).toEqual([]);
    expect(await columnsOf('organization_members')).toEqual([]);
    expect(await snapshot()).toEqual(before);

    await scoped.query(UP);
    expect(await snapshot()).toEqual(before);
    expect(
      (await scoped.query(`SELECT count(*)::int AS n FROM organization_members`)).rows[0].n
    ).toBe(2);
    await scoped.query(AI_SETTING);
  });
});

describe('organization boundary in DBStorage (real Postgres)', () => {
  // Default organization: Ann (owner of Old Team), Ben (no team). Second organization "acme":
  // Cy (member of Acme Team).
  let defaultOrg: number;
  let acme: number;
  const ANN = 1;
  const BEN = 2;
  const CY = 3;
  const OLD_TEAM = 1;
  let acmeTeam: number;
  const page: Record<string, number> = {};

  const viewerOf = (userId?: number) => storage.getPageViewer(userId);
  const insertPage = async (
    slug: string,
    organizationId: number,
    teamId: number | null,
    author = 'nobody@example.com'
  ) => {
    const { rows } = await scoped.query(
      `INSERT INTO wiki_pages (title, slug, content, folder, author, team_id, organization_id)
       VALUES ($1, $1, 'x', 'orgs', $2, $3, $4) RETURNING id`,
      [slug, author, teamId, organizationId]
    );
    page[slug] = rows[0].id;
    return rows[0].id as number;
  };

  beforeAll(async () => {
    defaultOrg = (await scoped.query(`SELECT id FROM organizations WHERE slug = 'default'`)).rows[0]
      .id;
    acme = (
      await scoped.query(
        `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
      )
    ).rows[0].id;
    await scoped.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Cy', 'cy@example.com')`, [
      CY,
    ]);
    await scoped.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), 10)`);
    await scoped.query(
      `INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2)`,
      [acme, CY]
    );
    acmeTeam = (
      await scoped.query(
        `INSERT INTO teams (name, display_name, organization_id)
         VALUES ('acme-team', 'Acme Team', $1) RETURNING id`,
        [acme]
      )
    ).rows[0].id;
    await scoped.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [
      acmeTeam,
      CY,
    ]);

    await insertPage('default-team', defaultOrg, OLD_TEAM, 'ann@example.com');
    await insertPage('default-open', defaultOrg, null);
    await insertPage('default-private', defaultOrg, null, 'ann@example.com');
    await insertPage('default-public', defaultOrg, null, 'ann@example.com');
    await insertPage('acme-team', acme, acmeTeam, 'cy@example.com');
    await insertPage('acme-open', acme, null);
    await scoped.query(
      `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission) VALUES
         ($1, 'user', $3, 'owner'),
         ($2, 'user', $3, 'owner'),
         ($2, 'public', NULL, 'viewer')`,
      [page['default-private'], page['default-public'], ANN]
    );

    process.env.DATABASE_URL = scopedUrl;
    const { DBStorage } = await import('../../server/storage.js');
    storage = new DBStorage();
  });

  it("reports each viewer's organization and only its teams", async () => {
    expect(await viewerOf(ANN)).toMatchObject({ organizationId: defaultOrg, teamIds: [OLD_TEAM] });
    expect(await viewerOf(CY)).toMatchObject({ organizationId: acme, teamIds: [acmeTeam] });
    expect(await viewerOf(undefined)).toEqual({ teamIds: [] });

    // A stray membership row in another organization's team counts for nothing
    await scoped.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [OLD_TEAM, CY]
    );
    expect(await storage.getUserTeamIds(CY)).toEqual([acmeTeam]);
    expect(await storage.getUserTeamRole(CY, OLD_TEAM)).toBeNull();
    expect(await storage.getUserTeamRole(ANN, OLD_TEAM)).toBe('owner');
  });

  it('lets nothing but a public grant cross organizations on a single page', async () => {
    const can = (userId: number | undefined, slug: string, level = 'viewer') =>
      storage.checkPagePermission(userId, page[slug], level);

    for (const slug of ['default-team', 'default-open', 'default-private']) {
      expect(await can(CY, slug), slug).toBe(false);
      expect(await storage.getUserPagePermission(CY, page[slug]), slug).toBeNull();
    }
    expect(await can(CY, 'default-public')).toBe(true);
    expect(await can(CY, 'default-public', 'editor')).toBe(false);
    for (const slug of ['acme-team', 'acme-open']) {
      expect(await can(ANN, slug), slug).toBe(false);
      expect(await can(BEN, slug), slug).toBe(false);
    }

    // A team-less page without permissions: signed-in members of its organization only
    expect(await can(BEN, 'default-open', 'owner')).toBe(true);
    expect(await can(CY, 'acme-open', 'owner')).toBe(true);
    expect(await can(undefined, 'default-open')).toBe(false);
    expect(await can(undefined, 'default-public')).toBe(true);

    // Unchanged inside the organization
    expect(await can(ANN, 'default-team', 'owner')).toBe(true);
    expect(await can(BEN, 'default-private')).toBe(false);
    expect(await can(CY, 'acme-team')).toBe(true);
  });

  it("never lists another organization's pages, publicly shared ones included", async () => {
    const folderPages = async (userId: number) =>
      (await storage.getReadableWikiPagesByFolder('orgs', userId))
        .map((p: { slug: string }) => p.slug)
        .sort();
    expect(await folderPages(ANN)).toEqual([
      'default-open',
      'default-private',
      'default-public',
      'default-team',
    ]);
    expect(await folderPages(BEN)).toEqual(['default-open', 'default-public']);
    expect(await folderPages(CY)).toEqual(['acme-open', 'acme-team']);

    const teamless = async (userId?: number) =>
      (
        await storage.searchWikiPages(
          { teamId: 'null', folder: 'orgs', limit: 50, offset: 0 },
          { readableBy: await viewerOf(userId) }
        )
      ).pages
        .map((p: { slug: string }) => p.slug)
        .sort();
    expect(await teamless(CY)).toEqual(['acme-open']);
    expect(await teamless(BEN)).toEqual(['default-open', 'default-public']);
    // Signed out, nothing is listed; a public page still opens by link
    expect(await teamless(undefined)).toEqual([]);
    const linked = await storage.resolveReadablePageLinks(await viewerOf(undefined), [
      page['default-public'],
      page['default-open'],
    ]);
    expect(linked.map((p: { slug: string }) => p.slug)).toEqual(['default-public']);
    expect(await storage.getReadableFolders(CY)).toEqual(['orgs']);
  });

  it("places new pages and teams in their team's or creator's organization", async () => {
    const created = async (teamId: number | null, creator?: number) =>
      storage.createWikiPage(
        {
          title: 'n',
          slug: `new-${teamId}-${creator}`,
          content: '',
          folder: 'orgs-new',
          tags: [],
          author: 'x@example.com',
          teamId,
        },
        creator
      );
    expect((await created(null, CY)).organizationId).toBe(acme);
    expect((await created(acmeTeam, CY)).organizationId).toBe(acme);
    expect((await created(OLD_TEAM)).organizationId).toBe(defaultOrg);
    const { OrganizationRequiredError } = await import('../../server/storage.js');
    await expect(created(null)).rejects.toBeInstanceOf(OrganizationRequiredError);

    const team = await storage.createTeamWithOwner({ name: 'cy-new', displayName: 'Cy New' }, CY);
    expect(team.organizationId).toBe(acme);
    expect(await storage.getUserTeamRole(CY, team.id)).toBe('owner');
  });

  it("only lets grants name users and teams of the page's organization", async () => {
    const id = page['default-team'];
    expect(await storage.isGranteeInPageOrganization(id, 'user', BEN)).toBe(true);
    expect(await storage.isGranteeInPageOrganization(id, 'user', CY)).toBe(false);
    expect(await storage.isGranteeInPageOrganization(id, 'team', OLD_TEAM)).toBe(true);
    expect(await storage.isGranteeInPageOrganization(id, 'team', acmeTeam)).toBe(false);
    expect(await storage.isGranteeInPageOrganization(id, 'user', 999)).toBe(false);
    expect(await storage.isGranteeInPageOrganization(id, 'public', null)).toBe(true);
  });

  it('puts new accounts in the default organization and keeps an existing one', async () => {
    const { createUserInDefaultOrganization } = await import('../../server/organizations.js');
    const account = await createUserInDefaultOrganization(storage.db, {
      name: 'Dee',
      email: 'dee@example.com',
      provider: 'local',
    });
    expect(await storage.getUserOrganizationId(account.id)).toBe(defaultOrg);
    expect(await storage.joinDefaultOrganization(CY)).toBe(acme);
    expect(await storage.getUserOrganizationId(CY)).toBe(acme);
  });
});
