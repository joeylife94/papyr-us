/**
 * Layer 4: the popular pages list against real Postgres (#141).
 *
 * GET /api/analytics/popular ranked the most viewed pages of the whole instance for any caller.
 * It now reads DBStorage.getPopularPages, which applies the listing rule of the page lists:
 *   - a page is ranked only when it is live and the caller may list it (their teams' pages and
 *     team-less pages they can read, inside their organization);
 *   - another team's page (even with a grant to the caller), a private page with explicit
 *     permissions for someone else, another organization's page (even a public one) and trashed
 *     pages are never ranked, however many views they have;
 *   - the ranking among the remaining pages is unchanged: most views first, inside the window;
 *   - leaving a team removes its pages at once; without a session nothing is ranked.
 *
 * Callers are resolved from real users, team_members and organization_members rows
 * (DBStorage.getPageViewer). The tables live in their own schema so this file can run next to
 * the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'popular_pages_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TEAM_A = 61;
const TEAM_B = 62;
const ALICE = { id: 1, email: 'alice@example.com' }; // Team A
const BOB = { id: 2, email: 'bob@example.com' }; // Team B
const CAROL = { id: 3, email: 'carol@example.com' }; // no team
const DAVE = { id: 4, email: 'dave@example.com' }; // another organization

let admin: Pool;
let scoped: Pool;
let storage: any;

async function insertPage(
  slug: string,
  values: {
    teamId?: number | null;
    author?: string;
    trashed?: boolean;
    organizationId?: number;
  } = {}
): Promise<number> {
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, team_id, deleted_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN NOW() ELSE NULL END) RETURNING id`,
    [
      `Title of ${slug}`,
      slug,
      `body of ${slug}`,
      values.author ?? 'someone@example.com',
      values.teamId ?? null,
      values.trashed ?? false,
    ]
  );
  if (values.organizationId !== undefined) {
    await scoped.query(`UPDATE wiki_pages SET organization_id = $1 WHERE id = $2`, [
      values.organizationId,
      rows[0].id,
    ]);
  }
  return rows[0].id;
}

async function grant(pageId: number, entityType: string, entityId: number | null, level: string) {
  await scoped.query(
    `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
     VALUES ($1, $2, $3, $4)`,
    [pageId, entityType, entityId, level]
  );
}

/** Records one view per entry of `viewers` (null = a signed-out view), `daysAgo` days back. */
async function view(pageId: number, viewers: Array<number | null>, daysAgo = 0) {
  for (const userId of viewers) {
    await scoped.query(
      `INSERT INTO page_views (page_id, user_id, viewed_at)
       VALUES ($1, $2, NOW() - MAKE_INTERVAL(days => $3))`,
      [pageId, userId, daysAgo]
    );
  }
}

const everyone = [ALICE.id, BOB.id, CAROL.id, DAVE.id];

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
    CREATE TABLE page_views (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      user_id INTEGER, viewed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await scoped.query(
    `INSERT INTO users (id, name, email)
     VALUES ($1, 'Alice', $2), ($3, 'Bob', $4), ($5, 'Carol', $6), ($7, 'Dave', $8)`,
    [ALICE.id, ALICE.email, BOB.id, BOB.email, CAROL.id, CAROL.email, DAVE.id, DAVE.email]
  );
  await scoped.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [TEAM_A, ALICE.id, TEAM_B, BOB.id]
  );

  // Organizations (issue #124 X1a): the tables as 0022 leaves them, data in the default one.
  await addOrganizations(scoped, undefined, { teams: [TEAM_A, TEAM_B] });
  // A second organization, with Dave as its only member.
  const { rows: acme } = await scoped.query(
    `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
  );
  const ACME = Number(acme[0].id);
  await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
    ACME,
    DAVE.id,
  ]);

  // Team pages. Team B's is the second most viewed live page of the instance.
  const aTop = await insertPage('a-top', { teamId: TEAM_A, author: ALICE.email });
  await view(aTop, [ALICE.id, ALICE.id, ALICE.id, BOB.id, null]);
  const bTop = await insertPage('b-top', { teamId: TEAM_B, author: BOB.email });
  await view(bTop, [BOB.id, BOB.id, BOB.id, BOB.id, ALICE.id, CAROL.id]);
  // A Team A page granted to Bob and to Team B: readable by id, but outside Bob's listing scope.
  const aGranted = await insertPage('a-granted', { teamId: TEAM_A, author: ALICE.email });
  await grant(aGranted, 'user', BOB.id, 'viewer');
  await grant(aGranted, 'team', TEAM_B, 'viewer');
  await view(aGranted, [ALICE.id, BOB.id, BOB.id, BOB.id]);
  // A private personal page: its explicit permissions deny everyone but Bob.
  const bPrivate = await insertPage('b-private', { author: BOB.email });
  await grant(bPrivate, 'user', BOB.id, 'owner');
  await view(bPrivate, [BOB.id, BOB.id, ALICE.id, CAROL.id]);
  // A personal page shared with the public.
  const bPublic = await insertPage('b-public', { author: BOB.email });
  await grant(bPublic, 'public', null, 'viewer');
  await view(bPublic, [ALICE.id, CAROL.id, DAVE.id]);
  // An open team-less page (no permissions): readable by anyone signed in, in its organization.
  const open = await insertPage('open');
  await view(open, [CAROL.id, null]);
  // Trashed pages, even the caller's own team's, with more views than any live page of theirs.
  const aTrashed = await insertPage('a-trashed', {
    teamId: TEAM_A,
    author: ALICE.email,
    trashed: true,
  });
  await view(aTrashed, [ALICE.id, ALICE.id, ALICE.id, ALICE.id, ALICE.id, ALICE.id, ALICE.id]);
  const openTrashed = await insertPage('open-trashed', { trashed: true });
  await view(openTrashed, [ALICE.id, BOB.id, CAROL.id]);
  // Another organization's pages: the most viewed page of the instance, and a public one.
  const acmeOpen = await insertPage('acme-open', { author: DAVE.email, organizationId: ACME });
  await view(acmeOpen, [...everyone, ...everyone]);
  const acmePublic = await insertPage('acme-public', { author: DAVE.email, organizationId: ACME });
  await grant(acmePublic, 'public', null, 'viewer');
  await view(acmePublic, [ALICE.id, DAVE.id]);
  // Views outside the default 30-day window.
  const aOld = await insertPage('a-old', { teamId: TEAM_A, author: ALICE.email });
  await view(aOld, [ALICE.id, ALICE.id, ALICE.id, ALICE.id, ALICE.id, ALICE.id], 40);
  // Two Team A pages with the same count, and one nobody viewed.
  const aTie1 = await insertPage('a-tie-1', { teamId: TEAM_A, author: ALICE.email });
  const aTie2 = await insertPage('a-tie-2', { teamId: TEAM_A, author: ALICE.email });
  await view(aTie2, [ALICE.id]);
  await view(aTie1, [ALICE.id]);
  await insertPage('a-unviewed', { teamId: TEAM_A, author: ALICE.email });

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

type Ranked = { slug: string; views: number; unique: number };

async function popular(
  userId: number | undefined,
  options: { days?: number; limit?: number } = {}
): Promise<Ranked[]> {
  const viewer = await storage.getPageViewer(userId);
  const rows = await storage.getPopularPages(viewer, {
    days: options.days ?? 30,
    limit: options.limit ?? 20,
  });
  return rows.map((row: any) => ({
    slug: row.pageSlug,
    views: Number(row.viewCount),
    unique: Number(row.uniqueViewers),
  }));
}

const slugs = (rows: Ranked[]) => rows.map((row) => row.slug);

describe('popular pages (real Postgres)', () => {
  it('the fixture ranks hidden pages first when nothing is filtered', async () => {
    const { rows } = await scoped.query(
      `SELECT p.slug FROM page_views v JOIN wiki_pages p ON p.id = v.page_id
       WHERE v.viewed_at > NOW() - INTERVAL '30 days'
       GROUP BY p.slug ORDER BY COUNT(*) DESC LIMIT 3`
    );
    expect(rows.map((row: { slug: string }) => row.slug)).toEqual([
      'acme-open',
      'a-trashed',
      'b-top',
    ]);
  });

  it('ranks only live pages the caller may list, most views first', async () => {
    expect(slugs(await popular(ALICE.id))).toEqual([
      'a-top',
      'a-granted',
      'b-public',
      'open',
      'a-tie-1',
      'a-tie-2',
    ]);
    expect(slugs(await popular(BOB.id))).toEqual(['b-top', 'b-private', 'b-public', 'open']);
    expect(slugs(await popular(CAROL.id))).toEqual(['b-public', 'open']);
  });

  it('never ranks another team, a private page, a grant outside the listing scope or trash', async () => {
    const bob = slugs(await popular(BOB.id, { days: 365, limit: 100 }));
    for (const hidden of ['a-top', 'a-granted', 'a-trashed', 'a-old', 'open-trashed']) {
      expect(bob).not.toContain(hidden);
    }
    const alice = slugs(await popular(ALICE.id, { days: 365, limit: 100 }));
    for (const hidden of ['b-top', 'b-private', 'a-trashed', 'open-trashed']) {
      expect(alice).not.toContain(hidden);
    }
    const carol = slugs(await popular(CAROL.id, { days: 365, limit: 100 }));
    for (const hidden of ['a-top', 'b-top', 'a-granted', 'b-private', 'a-trashed']) {
      expect(carol).not.toContain(hidden);
    }
  });

  it('stays inside the organization: no page of another one, not even a public one', async () => {
    for (const user of [ALICE, BOB, CAROL]) {
      const listed = slugs(await popular(user.id, { days: 365, limit: 100 }));
      expect(listed, `user ${user.id}`).not.toContain('acme-open');
      expect(listed, `user ${user.id}`).not.toContain('acme-public');
    }
    expect(slugs(await popular(DAVE.id))).toEqual(['acme-open', 'acme-public']);
  });

  it('ranks nothing without a session', async () => {
    expect(await popular(undefined, { days: 365, limit: 100 })).toEqual([]);
  });

  it('keeps the counts of a listed page: all its views, distinct signed-in viewers', async () => {
    const alice = await popular(ALICE.id);
    expect(alice[0]).toEqual({ slug: 'a-top', views: 5, unique: 2 });
    expect(alice[1]).toEqual({ slug: 'a-granted', views: 4, unique: 2 });
    expect((await popular(DAVE.id))[0]).toEqual({ slug: 'acme-open', views: 8, unique: 4 });
  });

  it('applies the window and the limit after the filter', async () => {
    expect(slugs(await popular(ALICE.id, { limit: 2 }))).toEqual(['a-top', 'a-granted']);
    expect(slugs(await popular(BOB.id, { limit: 1 }))).toEqual(['b-top']);
    expect(slugs(await popular(ALICE.id, { days: 365 }))).toEqual([
      'a-old',
      'a-top',
      'a-granted',
      'b-public',
      'open',
      'a-tie-1',
      'a-tie-2',
    ]);
    // Out-of-range values fall back to the smallest valid ones instead of failing.
    expect(slugs(await popular(ALICE.id, { limit: 0 }))).toEqual(['a-top']);
    expect(slugs(await popular(ALICE.id, { days: -5, limit: 1 }))).toEqual(['a-top']);
  });

  it('every ranked page is one the caller can read by id', async () => {
    for (const user of [ALICE, BOB, CAROL, DAVE]) {
      const viewer = await storage.getPageViewer(user.id);
      const { rows } = await scoped.query(`SELECT id, slug FROM wiki_pages`);
      const ranked = slugs(await popular(user.id, { days: 365, limit: 100 }));
      for (const page of rows as Array<{ id: number; slug: string }>) {
        if (!ranked.includes(page.slug)) continue;
        const resolved = await storage.resolveReadablePageLinks(viewer, [page.id]);
        expect(resolved.length, `user ${user.id} page ${page.slug}`).toBe(1);
      }
    }
  });

  it('drops a team page as soon as the caller leaves the team', async () => {
    await scoped.query('DELETE FROM team_members WHERE user_id = $1', [ALICE.id]);
    try {
      expect(slugs(await popular(ALICE.id))).toEqual(['b-public', 'open']);
    } finally {
      await scoped.query(
        `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [TEAM_A, ALICE.id]
      );
    }
  });
});
