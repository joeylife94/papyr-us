/**
 * Layer 4: the page link index (`page_links`, issue #103 E6) against real Postgres.
 *
 * Invariants proven here with DBStorage and the save pipeline:
 *   - manual saves, REST autosaves and blocks-only (Yjs) saves replace a page's outgoing links;
 *   - self-links, duplicates and ids of pages that do not exist are never stored;
 *   - page creation and version restore index the body they write;
 *   - concurrent syncs of one page never merge two link sets, and a sync for a body that a later
 *     write already replaced is skipped;
 *   - at most MAX_PAGE_LINK_TARGETS distinct targets are kept per page;
 *   - backlinks and link resolution only return live pages the viewer can read, whichever end
 *     of a link is unreadable or trashed;
 *   - deleting a page for good removes its rows (ON DELETE CASCADE).
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'page_links_l4_c';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let storage: any;
let pipeline: typeof import('../../server/services/page-save.js');
let store: import('../../server/services/page-save.js').PageSaveStore;

const TEAM_A = 101;
const TEAM_B = 202;
const memberOfA = { userId: 1, email: 'a@example.com', teamIds: [TEAM_A] };
const memberOfB = { userId: 2, email: 'b@example.com', teamIds: [TEAM_B] };

async function createSchema() {
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.wiki_pages (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,
      slug         TEXT NOT NULL UNIQUE,
      content      TEXT NOT NULL,
      blocks       JSONB DEFAULT '[]',
      folder       TEXT NOT NULL DEFAULT 'docs',
      tags         TEXT[] NOT NULL DEFAULT '{}',
      author       TEXT NOT NULL,
      parent_id    INTEGER,
      position     INTEGER,
      icon         TEXT,
      team_id      INTEGER,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      metadata     JSONB DEFAULT '{}',
      deleted_at   TIMESTAMP
    )
  `);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.page_versions (
      id                 SERIAL PRIMARY KEY,
      page_id            INTEGER NOT NULL REFERENCES ${SCHEMA}.wiki_pages(id) ON DELETE CASCADE,
      title              TEXT NOT NULL,
      content            TEXT NOT NULL,
      blocks             JSONB DEFAULT '[]',
      author             TEXT NOT NULL,
      version_number     INTEGER NOT NULL,
      change_description TEXT,
      created_at         TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Same shape as drizzle/0021_add_page_links.sql.
  await admin.query(`
    CREATE TABLE ${SCHEMA}.page_links (
      source_page_id INTEGER NOT NULL REFERENCES ${SCHEMA}.wiki_pages(id) ON DELETE CASCADE,
      target_page_id INTEGER NOT NULL REFERENCES ${SCHEMA}.wiki_pages(id) ON DELETE CASCADE,
      created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (source_page_id, target_page_id)
    )
  `);
  await admin.query(`CREATE INDEX ON ${SCHEMA}.page_links (target_page_id)`);
  // Read by readablePageCondition (explicit page grants).
  await admin.query(`
    CREATE TABLE ${SCHEMA}.page_permissions (
      id          SERIAL PRIMARY KEY,
      page_id     INTEGER NOT NULL REFERENCES ${SCHEMA}.wiki_pages(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id   INTEGER,
      permission  TEXT NOT NULL,
      granted_by  INTEGER,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

const paragraph = (content: string) => ({ id: `b-${content}`, type: 'paragraph', content });

async function createPage(
  slug: string,
  options: { content?: string; teamId?: number | null; author?: string } = {}
): Promise<number> {
  const content = options.content ?? `Body of ${slug}`;
  const { rows } = await admin.query(
    `INSERT INTO ${SCHEMA}.wiki_pages (title, slug, content, blocks, author, team_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      `Page ${slug}`,
      slug,
      content,
      JSON.stringify([paragraph(content)]),
      options.author ?? 'author@example.com',
      options.teamId ?? null,
    ]
  );
  return rows[0].id;
}

async function linksFrom(pageId: number): Promise<number[]> {
  const { rows } = await admin.query(
    `SELECT target_page_id FROM ${SCHEMA}.page_links WHERE source_page_id = $1
      ORDER BY target_page_id`,
    [pageId]
  );
  return rows.map((row) => row.target_page_id);
}

const link = (id: number) => `[[page:${id}]]`;

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await createSchema();
  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
  pipeline = await import('../../server/services/page-save.js');
  store = pipeline.storagePageSaveStore(storage);
});

afterEach(() => {
  pipeline.resetEditSessions();
});

afterAll(async () => {
  await storage?.pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('page link index (real Postgres)', () => {
  it('manual saves, autosaves and blocks-only saves replace the outgoing links', async () => {
    const source = await createPage('src-saves');
    const t1 = await createPage('t1-saves');
    const t2 = await createPage('t2-saves');
    const t3 = await createPage('t3-saves');

    await pipeline.savePage(
      store,
      source,
      { blocks: [paragraph(`${link(t1)} ${link(t2)}`)] },
      'manual'
    );
    expect(await linksFrom(source)).toEqual([t1, t2]);

    await pipeline.savePage(store, source, { blocks: [paragraph(`only ${link(t3)}`)] }, 'autosave');
    expect(await linksFrom(source)).toEqual([t3]);

    // What the Yjs server writes: blocks only, through the autosave pipeline.
    await pipeline.savePage(
      store,
      source,
      { blocks: [paragraph(`${link(t2)}`), paragraph(`${link(t1)} again ${link(t2)}`)] },
      'autosave'
    );
    expect(await linksFrom(source)).toEqual([t1, t2]);

    await pipeline.savePage(store, source, { content: 'no links any more' }, 'manual');
    expect(await linksFrom(source)).toEqual([]);
  });

  it('never stores self-links, duplicates or ids of pages that do not exist', async () => {
    const source = await createPage('src-filter');
    const target = await createPage('t-filter');
    await pipeline.savePage(
      store,
      source,
      {
        blocks: [paragraph(`${link(source)} ${link(target)} ${link(target)} ${link(999999)}`)],
      },
      'autosave'
    );
    expect(await linksFrom(source)).toEqual([target]);

    // The storage method filters on its own as well.
    await storage.replacePageLinks(source, [source, target, target, 999998]);
    expect(await linksFrom(source)).toEqual([target]);
  });

  it('indexes a created page and a restored version', async () => {
    const target = await createPage('t-create');
    const other = await createPage('o-create');
    const created = await storage.createWikiPage({
      title: 'Created',
      slug: 'created-with-links',
      content: link(target),
      blocks: [paragraph(`see ${link(target)}`)],
      folder: 'docs',
      tags: [],
      author: 'author@example.com',
    });
    await pipeline.indexNewPageLinks(store, created);
    expect(await linksFrom(created.id)).toEqual([target]);

    await pipeline.savePage(store, created.id, { blocks: [paragraph(link(other))] }, 'manual');
    expect(await linksFrom(created.id)).toEqual([other]);

    await pipeline.snapshotBeforeRestore(store, created.id);
    await pipeline.writeRestoredPage(store, created.id, {
      title: 'Created',
      content: `see ${link(target)}`,
      blocks: [paragraph(`see ${link(target)}`)],
    });
    expect(await linksFrom(created.id)).toEqual([target]);
  });

  it('serializes concurrent syncs of one page, so link sets never merge', async () => {
    const source = await createPage('src-race');
    const targets: number[] = [];
    for (const name of ['a', 'b', 'c', 'd']) targets.push(await createPage(`t-race-${name}`));
    const first = targets.slice(0, 2);
    const second = targets.slice(2);
    for (let round = 0; round < 5; round += 1) {
      await Promise.all([
        storage.replacePageLinks(source, first),
        storage.replacePageLinks(source, second),
      ]);
      const stored = await linksFrom(source);
      expect([first, second]).toContainEqual(stored);
    }
  });

  it('skips a sync whose write a later write already replaced', async () => {
    const source = await createPage('src-stale', { content: 'newer body' });
    const older = await createPage('t-stale-older');
    const newer = await createPage('t-stale-newer');
    await storage.replacePageLinks(source, [newer], { expectedContent: 'newer body' });

    // An older save syncing late (its body is no longer the row's) leaves the newer links alone.
    await storage.replacePageLinks(source, [older], { expectedContent: 'older body' });
    expect(await linksFrom(source)).toEqual([newer]);
  });

  it('keeps at most MAX_PAGE_LINK_TARGETS distinct targets', async () => {
    const { MAX_PAGE_LINK_TARGETS } = await import('../../shared/page-links.js');
    const source = await createPage('src-cap');
    const target = await createPage('t-cap');
    const missing = Array.from({ length: MAX_PAGE_LINK_TARGETS }, (_, i) => 900000 + i);

    await storage.replacePageLinks(source, [...missing, target]);
    expect(await linksFrom(source)).toEqual([]);

    await storage.replacePageLinks(source, [target, ...missing]);
    expect(await linksFrom(source)).toEqual([target]);
  });

  it('backlinks list only live sources the viewer can read', async () => {
    const target = await createPage('t-back', { teamId: TEAM_A });
    const teamSource = await createPage('s-team-a', { teamId: TEAM_A });
    const otherTeamSource = await createPage('s-team-b', { teamId: TEAM_B });
    const trashedSource = await createPage('s-trashed', { teamId: TEAM_A });
    const openSource = await createPage('s-open');
    for (const source of [teamSource, otherTeamSource, trashedSource, openSource]) {
      await storage.replacePageLinks(source, [target]);
    }
    await admin.query(`UPDATE ${SCHEMA}.wiki_pages SET deleted_at = NOW() WHERE id = $1`, [
      trashedSource,
    ]);

    const forA = await storage.getReadableBacklinks(memberOfA, target);
    expect(forA.map((page: any) => page.id).sort()).toEqual([teamSource, openSource].sort());
    expect(Object.keys(forA[0]).sort()).toEqual(['icon', 'id', 'slug', 'title', 'updatedAt']);

    // A Team B member reaching the same target id only sees what they can read on their side.
    const forB = await storage.getReadableBacklinks(memberOfB, target);
    expect(forB.map((page: any) => page.id).sort()).toEqual([otherTeamSource, openSource].sort());
  });

  it('link resolution returns only live targets the viewer can read', async () => {
    const readable = await createPage('r-ok', { teamId: TEAM_A });
    const otherTeam = await createPage('r-team-b', { teamId: TEAM_B });
    const trashed = await createPage('r-trashed', { teamId: TEAM_A });
    const restricted = await createPage('r-restricted', { author: 'owner@example.com' });
    await admin.query(
      `INSERT INTO ${SCHEMA}.page_permissions (page_id, entity_type, entity_id, permission)
       VALUES ($1, 'user', 77, 'owner')`,
      [restricted]
    );
    await admin.query(`UPDATE ${SCHEMA}.wiki_pages SET deleted_at = NOW() WHERE id = $1`, [
      trashed,
    ]);

    const resolved = await storage.resolveReadablePageLinks(memberOfA, [
      readable,
      otherTeam,
      trashed,
      restricted,
      999997,
    ]);
    expect(resolved).toEqual([{ id: readable, title: 'Page r-ok', slug: 'r-ok', icon: null }]);
    expect(await storage.resolveReadablePageLinks({ teamIds: [] }, [readable])).toEqual([]);
  });

  it('link resolution follows the open-by-id rule: a public team page resolves for outsiders', async () => {
    const publicTeamPage = await createPage('r-public-team-b', { teamId: TEAM_B });
    const privateTeamPage = await createPage('r-private-team-b', { teamId: TEAM_B });
    await admin.query(
      `INSERT INTO ${SCHEMA}.page_permissions (page_id, entity_type, entity_id, permission)
       VALUES ($1, 'public', NULL, 'viewer')`,
      [publicTeamPage]
    );

    const forA = await storage.resolveReadablePageLinks(memberOfA, [
      publicTeamPage,
      privateTeamPage,
    ]);
    expect(forA.map((page: any) => page.id)).toEqual([publicTeamPage]);
    const anonymous = await storage.resolveReadablePageLinks({ teamIds: [] }, [
      publicTeamPage,
      privateTeamPage,
    ]);
    expect(anonymous.map((page: any) => page.id)).toEqual([publicTeamPage]);
  });

  it('removes the rows of a page deleted for good', async () => {
    const source = await createPage('src-gone');
    const target = await createPage('t-gone');
    await storage.replacePageLinks(source, [target]);
    await admin.query(`DELETE FROM ${SCHEMA}.wiki_pages WHERE id = $1`, [target]);
    expect(await linksFrom(source)).toEqual([]);
  });
});
