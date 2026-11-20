/**
 * Layer 4: every page records the account that created it (WP0b), against real Postgres.
 *
 * DBStorage on tables in the shape of 0022/0024/0025 plus 0027:
 * - createWikiPage, duplicateWikiPage, findOrCreateDailyNote and insertImportedPages write
 *   `created_by_user_id` and the account's name as `author`, and the creator's owner grant;
 * - an automation page has no creator, the author "Automation" and no grant;
 * - an unknown or inactive creator writes nothing;
 * - the creator id grants nothing: a creator whose owner grant is gone cannot read, list or edit
 *   the page, and the author rule (an `author` equal to an account's email makes that account an
 *   owner) is exactly what it was.
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

const SCHEMA = 'l4_wp0b_creator';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let scoped: Pool;
let storage: any;
let PageCreatorUnavailableError: new () => Error;
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
  CREATE TABLE page_links (
    source_page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    target_page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    PRIMARY KEY (source_page_id, target_page_id)
  );
`;

async function newUser(label: string, options: { name?: string; active?: boolean } = {}) {
  counter += 1;
  const email = `${label}-${counter}@example.com`;
  const name = options.name ?? `${label} Display ${counter}`;
  const { rows } = await scoped.query(
    `INSERT INTO users (name, email, is_active) VALUES ($1, $2, $3) RETURNING id`,
    [name, email, options.active ?? true]
  );
  return { id: Number(rows[0].id), email, name };
}

async function newTeam() {
  counter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO teams (name, display_name, organization_id) VALUES ($1, $1, $2) RETURNING id`,
    [`team-${counter}`, defaultOrg]
  );
  return Number(rows[0].id);
}

const pageInput = (overrides: Record<string, unknown> = {}) => {
  counter += 1;
  return {
    title: `Page ${counter}`,
    slug: `page-${counter}`,
    content: '',
    folder: 'docs',
    tags: [],
    ...overrides,
  };
};

const rowOf = async (pageId: number) =>
  (await scoped.query(`SELECT * FROM wiki_pages WHERE id = $1`, [pageId])).rows[0];

const grantsOf = async (pageId: number) =>
  (
    await scoped.query(
      `SELECT entity_type, entity_id, permission, granted_by FROM page_permissions
        WHERE page_id = $1 ORDER BY id`,
      [pageId]
    )
  ).rows;

const pageCount = async () =>
  (await scoped.query(`SELECT count(*)::int AS n FROM wiki_pages`)).rows[0].n as number;

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(TABLES);
  defaultOrg = await addOrganizations(scoped);

  process.env.DATABASE_URL = scopedUrl;
  const storageModule = await import('../../server/storage.js');
  storage = new storageModule.DBStorage();
  PageCreatorUnavailableError = storageModule.PageCreatorUnavailableError;
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('createWikiPage', () => {
  it("records the creating account and its name as author, with the creator's owner grant", async () => {
    const ada = await newUser('ada', { name: 'Ada Lovelace' });
    const page = await storage.createWikiPage(pageInput(), { userId: ada.id });

    const row = await rowOf(page.id);
    expect(row.created_by_user_id).toBe(ada.id);
    expect(row.author).toBe('Ada Lovelace');
    expect(page.createdByUserId).toBe(ada.id);
    expect(page.author).toBe('Ada Lovelace');
    expect(await grantsOf(page.id)).toEqual([
      { entity_type: 'user', entity_id: ada.id, permission: 'owner', granted_by: ada.id },
    ]);
  });

  it('takes the creator and the author from the account, never from the page it is given', async () => {
    const ada = await newUser('ada-given');
    const other = await newUser('other-given');
    const page = await storage.createWikiPage(
      pageInput({ author: other.email, createdByUserId: other.id }),
      { userId: ada.id }
    );

    const row = await rowOf(page.id);
    expect(row.created_by_user_id).toBe(ada.id);
    expect(row.author).toBe(ada.name);
  });

  it('records automation with no creator, the author "Automation" and no grant', async () => {
    const team = await newTeam();
    const page = await storage.createWikiPage(pageInput({ teamId: team }), { automation: true });

    const row = await rowOf(page.id);
    expect(row.created_by_user_id).toBeNull();
    expect(row.author).toBe('Automation');
    expect(await grantsOf(page.id)).toEqual([]);
  });

  it('cannot create a team-less page for automation', async () => {
    const before = await pageCount();
    await expect(storage.createWikiPage(pageInput(), { automation: true })).rejects.toMatchObject({
      name: 'OrganizationRequiredError',
    });
    expect(await pageCount()).toBe(before);
  });

  it('writes nothing for an inactive or an unknown creator', async () => {
    const gone = await newUser('inactive', { active: false });
    const before = await pageCount();
    const grantsBefore = (await scoped.query(`SELECT count(*)::int AS n FROM page_permissions`))
      .rows[0].n;

    await expect(storage.createWikiPage(pageInput(), { userId: gone.id })).rejects.toBeInstanceOf(
      PageCreatorUnavailableError
    );
    await expect(storage.createWikiPage(pageInput(), { userId: 987654 })).rejects.toBeInstanceOf(
      PageCreatorUnavailableError
    );

    expect(await pageCount()).toBe(before);
    expect((await scoped.query(`SELECT count(*)::int AS n FROM page_permissions`)).rows[0].n).toBe(
      grantsBefore
    );
  });
});

describe('duplicateWikiPage, findOrCreateDailyNote and insertImportedPages', () => {
  it('duplicateWikiPage records the copying account', async () => {
    const ada = await newUser('dup-source');
    const bob = await newUser('dup-copier', { name: 'Bob Copier' });
    const source = await storage.createWikiPage(pageInput(), { userId: ada.id });

    const copy = await storage.duplicateWikiPage(
      source.id,
      pageInput({ title: 'Copy', content: source.content, isPublished: false }),
      { userId: bob.id }
    );

    const row = await rowOf(copy.id);
    expect(row.created_by_user_id).toBe(bob.id);
    expect(row.author).toBe('Bob Copier');
    expect(await grantsOf(copy.id)).toEqual([
      { entity_type: 'user', entity_id: bob.id, permission: 'owner', granted_by: bob.id },
    ]);
  });

  it('duplicateWikiPage writes nothing for an inactive creator', async () => {
    const ada = await newUser('dup-live');
    const gone = await newUser('dup-gone', { active: false });
    const source = await storage.createWikiPage(pageInput(), { userId: ada.id });
    const before = await pageCount();

    await expect(
      storage.duplicateWikiPage(source.id, pageInput(), { userId: gone.id })
    ).rejects.toBeInstanceOf(PageCreatorUnavailableError);
    expect(await pageCount()).toBe(before);
  });

  it('findOrCreateDailyNote records the account, and finding the note changes nothing', async () => {
    const ada = await newUser('daily', { name: 'Ada Daily' });
    const note = {
      slug: `daily-note-${counter}`,
      title: '2026-11-20',
      folder: 'daily',
      tags: ['daily'],
      teamId: null,
      userId: ada.id,
    };

    const created = await storage.findOrCreateDailyNote(note);
    expect(created.status).toBe('created');
    const row = await rowOf(created.page.id);
    expect(row.created_by_user_id).toBe(ada.id);
    expect(row.author).toBe('Ada Daily');

    const found = await storage.findOrCreateDailyNote(note);
    expect(found.status).toBe('found');
    expect((await rowOf(created.page.id)).created_by_user_id).toBe(ada.id);
  });

  it('findOrCreateDailyNote on a team records the account too', async () => {
    const ada = await newUser('daily-team', { name: 'Ada Team' });
    const team = await newTeam();
    const created = await storage.findOrCreateDailyNote({
      slug: `daily-team-note-${counter}`,
      title: '2026-11-21',
      folder: 'daily',
      tags: ['daily'],
      teamId: team,
      userId: ada.id,
    });

    const row = await rowOf(created.page.id);
    expect(row.created_by_user_id).toBe(ada.id);
    expect(row.author).toBe('Ada Team');
  });

  it('insertImportedPages records the importing account on every page', async () => {
    const ada = await newUser('import', { name: 'Ada Importer' });
    const ids: number[] = await storage.reservePageIds(2);
    counter += 1;
    const created = await storage.insertImportedPages({
      teamId: null,
      userId: ada.id,
      folder: 'imported',
      pages: ids.map((id, index) => ({
        id,
        title: `Imported ${counter}-${index}`,
        slug: `imported-${counter}-${index}`,
        content: 'body',
        tags: [],
        icon: null,
        cover: null,
        parentId: null,
        linkTargets: [],
      })),
    });

    expect(created).toHaveLength(2);
    for (const { id } of created) {
      const row = await rowOf(id);
      expect(row.created_by_user_id).toBe(ada.id);
      expect(row.author).toBe('Ada Importer');
    }
  });

  it('insertImportedPages writes nothing for an inactive creator', async () => {
    const gone = await newUser('import-gone', { active: false });
    const [id] = await storage.reservePageIds(1);
    const before = await pageCount();

    await expect(
      storage.insertImportedPages({
        teamId: null,
        userId: gone.id,
        folder: 'imported',
        pages: [
          {
            id,
            title: 'x',
            slug: `import-gone-${counter}`,
            content: '',
            tags: [],
            icon: null,
            cover: null,
            parentId: null,
            linkTargets: [],
          },
        ],
      })
    ).rejects.toBeInstanceOf(PageCreatorUnavailableError);
    expect(await pageCount()).toBe(before);
  });

  it('findOrCreateDailyNote writes nothing for an inactive creator', async () => {
    const gone = await newUser('daily-gone', { active: false });
    const before = await pageCount();
    await expect(
      storage.findOrCreateDailyNote({
        slug: `daily-gone-${counter}`,
        title: '2026-11-22',
        folder: 'daily',
        tags: [],
        teamId: null,
        userId: gone.id,
      })
    ).rejects.toBeInstanceOf(PageCreatorUnavailableError);
    expect(await pageCount()).toBe(before);
  });
});

describe('an account deactivated while it creates a page', () => {
  it('cannot create a page: the account is read under a lock held until the page is written', async () => {
    const ada = await newUser('deactivating');
    const before = await pageCount();
    // Another session deactivates the account and has not committed yet.
    const holder = await scoped.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [ada.id]);

      let settled = false;
      const attempt = storage
        .createWikiPage(pageInput(), { userId: ada.id })
        .then(
          () => 'created',
          (error: unknown) => error
        )
        .finally(() => {
          settled = true;
        });
      // The creation waits for the deactivation instead of reading the old, active row.
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(settled).toBe(false);

      await holder.query('COMMIT');
      expect(await attempt).toBeInstanceOf(PageCreatorUnavailableError);
    } finally {
      holder.release();
    }
    expect(await pageCount()).toBe(before);
  });
});

describe('the creator id grants nothing', () => {
  it('a creator whose owner grant is gone cannot read, list, resolve or edit a team-less page that has permissions', async () => {
    const ada = await newUser('revoked');
    const bob = await newUser('kept');
    const page = await storage.createWikiPage(pageInput({ title: 'Revoked creator page' }), {
      userId: ada.id,
    });
    await storage.addPagePermission({
      pageId: page.id,
      entityType: 'user',
      entityId: bob.id,
      permission: 'editor',
      grantedBy: ada.id,
    });
    // While the grant is there the creator owns the page.
    expect(await storage.checkPagePermission(ada.id, page.id, 'owner')).toBe(true);

    const adaGrant = (await storage.getPagePermissions(page.id)).find(
      (p: any) => p.entityType === 'user' && p.entityId === ada.id
    );
    expect(await storage.removePagePermission(page.id, adaGrant.id)).toBe(true);

    expect((await rowOf(page.id)).created_by_user_id).toBe(ada.id);
    expect(await storage.checkPagePermission(ada.id, page.id, 'viewer')).toBe(false);
    expect(await storage.checkPagePermission(ada.id, page.id, 'owner')).toBe(false);
    expect(await storage.getUserPagePermission(ada.id, page.id)).toBeNull();
    const listed = await storage.searchLinkTargets(
      ada.id,
      { personalOnly: true },
      'Revoked creator page'
    );
    expect(listed).toEqual([]);
    expect(
      await storage.resolveReadablePageLinks(await storage.getPageViewer(ada.id), [page.id])
    ).toEqual([]);
    // The other grant holder is unaffected.
    expect(await storage.checkPagePermission(bob.id, page.id, 'editor')).toBe(true);
    expect(
      (await storage.searchLinkTargets(bob.id, { personalOnly: true }, 'Revoked creator page'))
        .length
    ).toBe(1);
  });

  async function pageWithAuthor(title: string, author: string, creatorId: number | null) {
    const holder = await newUser(`holder-${counter}`);
    const { rows } = await scoped.query(
      `INSERT INTO wiki_pages (title, slug, content, author, created_by_user_id, organization_id)
       VALUES ($1, $2, '', $3, $4, $5) RETURNING id`,
      [
        title,
        `${title.toLowerCase().replace(/\W+/g, '-')}-${counter}`,
        author,
        creatorId,
        defaultOrg,
      ]
    );
    const pageId = Number(rows[0].id);
    // The page has a grant, so it is not an open legacy page.
    await scoped.query(
      `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission, granted_by)
       VALUES ($1, 'user', $2, 'viewer', $2)`,
      [pageId, holder.id]
    );
    return pageId;
  }

  it('a page without a recorded creator is owned by the account whose email is its author text', async () => {
    const ada = await newUser('legacy-author');
    const pageId = await pageWithAuthor('Legacy by email', ada.email, null);

    expect(await storage.checkPagePermission(ada.id, pageId, 'owner')).toBe(true);
    expect(
      (await storage.searchLinkTargets(ada.id, { personalOnly: true }, 'Legacy by email')).length
    ).toBe(1);
    expect(
      await storage.resolveReadablePageLinks(await storage.getPageViewer(ada.id), [pageId])
    ).toHaveLength(1);
  });

  it('on a page with a recorded creator the author text decides nothing, even when it is another account email', async () => {
    const creator = await newUser('real-creator');
    const named = await newUser('named-by-text');
    const pageId = await pageWithAuthor('Creator and email', named.email, creator.id);

    for (const level of ['viewer', 'commenter', 'editor', 'owner'] as const) {
      expect(await storage.checkPagePermission(named.id, pageId, level), level).toBe(false);
    }
    expect(await storage.getUserPagePermission(named.id, pageId)).toBeNull();
    expect(
      await storage.searchLinkTargets(named.id, { personalOnly: true }, 'Creator and email')
    ).toEqual([]);
    expect(
      await storage.resolveReadablePageLinks(await storage.getPageViewer(named.id), [pageId])
    ).toEqual([]);
    expect(await storage.getReadableBacklinks(named.id, pageId)).toEqual([]);
    expect(
      (await storage.getReadableWikiPagesByFolder('docs', named.id)).map((p: any) => p.id)
    ).not.toContain(pageId);
  });

  it('a page created by an account whose name equals another account email gives that account nothing', async () => {
    const stranger = await newUser('stranger-by-name');
    const odd = await newUser(`odd-${counter}`, { name: stranger.email });
    const page = await storage.createWikiPage(pageInput({ title: 'Named like an email' }), {
      userId: odd.id,
    });
    await storage.addPagePermission({
      pageId: page.id,
      entityType: 'user',
      entityId: (await newUser('other-holder')).id,
      permission: 'viewer',
      grantedBy: odd.id,
    });

    expect((await rowOf(page.id)).author).toBe(stranger.email);
    expect(await storage.checkPagePermission(stranger.id, page.id, 'viewer')).toBe(false);
    expect(await storage.checkPagePermission(stranger.id, page.id, 'owner')).toBe(false);
    expect(
      await storage.searchLinkTargets(stranger.id, { personalOnly: true }, 'Named like an email')
    ).toEqual([]);
    // The creator keeps its owner grant.
    expect(await storage.checkPagePermission(odd.id, page.id, 'owner')).toBe(true);
  });
});
