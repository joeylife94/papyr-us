/**
 * Layer 4: synced block storage against real Postgres.
 *
 * Creating a synced block failed on every call: DBStorage wrote a `created_by` column the table
 * does not have and never set the required `page_id`, and reads used a query API this storage
 * does not configure. Invariants proven here with DBStorage:
 *   - creating a block writes its page; an id already in use returns nothing and changes
 *     nothing; a missing page is a foreign key violation (the route answers 404 for it);
 *   - updating replaces the content and moves `updated_at`; deleting removes the block and its
 *     references;
 *   - the picker list only holds blocks whose page is live and listable by the viewer (the page
 *     list rule), and `referenceCount` only counts references on pages the viewer may list;
 *   - deleting a page deletes its synced blocks and their references.
 *
 * The viewer is passed in directly, so only the page, permission and synced block tables are
 * needed. They live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { postgresErrorOf } from '../../server/db-errors';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'synced_blocks_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TEAM = 51;
const OTHER_TEAM = 52;
const MEMBER = { userId: 1, email: 'member@example.com', teamIds: [TEAM] };
const STRANGER = { userId: 2, email: 'stranger@example.com', teamIds: [] as number[] };
const ANONYMOUS = { teamIds: [] as number[] };

let admin: Pool;
let scoped: Pool;
let storage: any;
const pages: Record<string, number> = {};

async function insertPage(
  key: string,
  values: { teamId?: number | null; author?: string; trashed?: boolean } = {}
) {
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, team_id, deleted_at)
     VALUES ($1, $2, '', $3, $4, CASE WHEN $5 THEN NOW() ELSE NULL END) RETURNING id`,
    [
      key,
      `${key}-slug`,
      values.author ?? 'someone@example.com',
      values.teamId ?? null,
      !!values.trashed,
    ]
  );
  pages[key] = rows[0].id;
}

async function grant(key: string, entityType: string, entityId: number | null, level: string) {
  await scoped.query(
    `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission)
     VALUES ($1, $2, $3, $4)`,
    [pages[key], entityType, entityId, level]
  );
}

async function reference(originalBlockId: string, pageKey: string) {
  await scoped.query(
    `INSERT INTO synced_block_references (synced_block_id, page_id, block_id)
     SELECT id, $2, 'ref-' || $1 FROM synced_blocks WHERE original_block_id = $1`,
    [originalBlockId, pages[pageKey]]
  );
}

const count = async (sqlText: string, params: unknown[] = []) =>
  Number((await scoped.query(sqlText, params)).rows[0].count);

const content = (text: string) => [{ id: 'b1', type: 'paragraph', content: text }];

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  // wiki_pages and page_permissions as in shared/schema.ts; the synced block tables as in
  // drizzle/0012_add_advanced_blocks.sql.
  await scoped.query(`
    CREATE TABLE wiki_pages (
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
    );
    CREATE TABLE page_permissions (
      id          SERIAL PRIMARY KEY,
      page_id     INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id   INTEGER,
      permission  TEXT NOT NULL,
      granted_by  INTEGER,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE synced_blocks (
      id                SERIAL PRIMARY KEY,
      original_block_id TEXT NOT NULL UNIQUE,
      page_id           INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      content           JSONB NOT NULL,
      created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE synced_block_references (
      id              SERIAL PRIMARY KEY,
      synced_block_id INTEGER NOT NULL REFERENCES synced_blocks(id) ON DELETE CASCADE,
      page_id         INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      block_id        TEXT NOT NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await insertPage('team', { teamId: TEAM });
  await insertPage('team-second', { teamId: TEAM });
  await insertPage('team-trashed', { teamId: TEAM, trashed: true });
  await insertPage('other-team', { teamId: OTHER_TEAM });
  await grant('other-team', 'user', MEMBER.userId, 'owner'); // still outside the member's teams
  // team-less, no permissions: readable by the signed-in members of its organization (#124 X1)
  await insertPage('open-personal');
  await insertPage('private-personal', { author: STRANGER.email });
  await grant('private-personal', 'user', STRANGER.userId, 'owner');
  await insertPage('scratch');

  process.env.DATABASE_URL = scopedUrl;
  // Organizations (issue #124 X1a): the tables as 0022 leaves them, data in the default one
  const organizationId = await addOrganizations(scoped, undefined, {
    teams: [TEAM, OTHER_TEAM],
  });
  // The signed-in viewers belong to it, as getPageViewer would report
  for (const viewer of [MEMBER, STRANGER]) Object.assign(viewer, { organizationId });
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

const listed = async (viewer: object) =>
  (await storage.getReadableSyncedBlocks(viewer))
    .map((block: any) => [block.originalBlockId, block.referenceCount])
    .sort();

describe('synced block storage (real Postgres)', () => {
  it('creates a block on its page, and refuses an id already in use', async () => {
    const created = await storage.createSyncedBlock(pages.scratch, 'synced_create', content('a'));
    expect(created).toMatchObject({
      originalBlockId: 'synced_create',
      pageId: pages.scratch,
      content: content('a'),
    });
    const { rows } = await scoped.query(
      'SELECT page_id, content FROM synced_blocks WHERE original_block_id = $1',
      ['synced_create']
    );
    expect(rows).toEqual([{ page_id: pages.scratch, content: content('a') }]);
    expect(await storage.getSyncedBlock('synced_create')).toMatchObject({ pageId: pages.scratch });

    // The same id on another page: nothing is written and the first block is unchanged.
    expect(
      await storage.createSyncedBlock(pages['open-personal'], 'synced_create', content('b'))
    ).toBeUndefined();
    expect(
      await count('SELECT count(*) FROM synced_blocks WHERE original_block_id = $1', [
        'synced_create',
      ])
    ).toBe(1);
    expect((await storage.getSyncedBlock('synced_create')).content).toEqual(content('a'));
  });

  it('reports a missing page as a foreign key violation', async () => {
    const error = await storage
      .createSyncedBlock(2_000_000_000, 'synced_orphan', content('a'))
      .then(
        () => null,
        (thrown: unknown) => thrown
      );
    expect(postgresErrorOf(error)?.code).toBe('23503');
    expect(await storage.getSyncedBlock('synced_orphan')).toBeUndefined();
  });

  it('updates the content and moves updated_at', async () => {
    await storage.createSyncedBlock(pages.scratch, 'synced_update', content('before'));
    await scoped.query(
      `UPDATE synced_blocks SET updated_at = NOW() - INTERVAL '1 day' WHERE original_block_id = $1`,
      ['synced_update']
    );
    const before = await storage.getSyncedBlock('synced_update');
    const updated = await storage.updateSyncedBlockContent('synced_update', content('after'));
    expect(updated).toMatchObject({ pageId: pages.scratch, content: content('after') });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect((await storage.getSyncedBlock('synced_update')).content).toEqual(content('after'));
    expect(await storage.updateSyncedBlockContent('synced_missing', content('x'))).toBeUndefined();
  });

  it('deletes a block with its references', async () => {
    await storage.createSyncedBlock(pages.scratch, 'synced_delete', content('a'));
    await reference('synced_delete', 'open-personal');
    expect(await storage.deleteSyncedBlock('synced_delete')).toBe(true);
    expect(await storage.getSyncedBlock('synced_delete')).toBeUndefined();
    expect(
      await count(
        `SELECT count(*) FROM synced_block_references WHERE block_id = 'ref-synced_delete'`
      )
    ).toBe(0);
    expect(await storage.deleteSyncedBlock('synced_delete')).toBe(false);
  });

  it('lists only blocks on live pages the viewer may list, counting visible references', async () => {
    for (const key of ['team', 'team-trashed', 'other-team', 'open-personal', 'private-personal']) {
      await storage.createSyncedBlock(pages[key], `synced_on_${key}`, content(key));
    }
    // The team block is used on another team page and on the stranger's private page; the open
    // block is used on a team page and on the private page.
    await reference('synced_on_team', 'team-second');
    await reference('synced_on_team', 'private-personal');
    await reference('synced_on_open-personal', 'team-second');
    await reference('synced_on_open-personal', 'private-personal');
    await reference('synced_on_open-personal', 'team-trashed');
    // Leave the blocks made by the earlier tests out of this listing.
    await scoped.query(`DELETE FROM synced_blocks WHERE page_id = $1`, [pages.scratch]);

    expect(await listed(MEMBER)).toEqual([
      ['synced_on_open-personal', 1],
      ['synced_on_team', 1],
    ]);
    expect(await listed(STRANGER)).toEqual([
      ['synced_on_open-personal', 1],
      ['synced_on_private-personal', 0],
    ]);
    // Signed out, a team-less page without permissions is no longer open (issue #124 X1)
    expect(await listed(ANONYMOUS)).toEqual([]);

    const [row] = (await storage.getReadableSyncedBlocks(STRANGER)).filter(
      (block: { originalBlockId: string }) => block.originalBlockId === 'synced_on_open-personal'
    );
    expect(Object.keys(row).sort()).toEqual([
      'content',
      'createdAt',
      'id',
      'originalBlockId',
      'pageId',
      'referenceCount',
      'updatedAt',
    ]);
    expect(row.content).toEqual(content('open-personal'));
  });

  it('deleting a page deletes its synced blocks and their references', async () => {
    await insertPage('doomed');
    await storage.createSyncedBlock(pages.doomed, 'synced_doomed', content('doomed'));
    await reference('synced_doomed', 'open-personal');
    await reference('synced_on_open-personal', 'doomed');

    await scoped.query('DELETE FROM wiki_pages WHERE id = $1', [pages.doomed]);

    expect(await storage.getSyncedBlock('synced_doomed')).toBeUndefined();
    expect(
      await count(
        `SELECT count(*) FROM synced_block_references WHERE block_id = 'ref-synced_doomed'
         OR page_id = $1`,
        [pages.doomed]
      )
    ).toBe(0);
    // A block on another page that was used on the deleted page stays.
    expect(await storage.getSyncedBlock('synced_on_open-personal')).toBeDefined();
  });
});
