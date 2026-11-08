/**
 * Layer 4: page covers against real Postgres (issue #134). No new column: a cover lives in the
 * existing `wiki_pages.metadata` jsonb as `metadata.cover`.
 *
 * Proven here with DBStorage:
 *   - a cover autosave (the save pipeline) writes `metadata.cover`, keeps the other metadata keys,
 *     and removing the cover deletes the key; it records no page version;
 *   - a vault import stores a planned cover in `metadata`, and the vault export reads it back into
 *     the frontmatter.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'page_cover_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const PAGE_LINKS_MIGRATION = readFileSync(
  new URL('../../drizzle/0021_add_page_links.sql', import.meta.url),
  'utf8'
);

const ALICE = { userId: 1, email: 'alice@example.com', teamIds: [] as number[] };
const IMAGE = '/api/uploads/images/1730000000000-0123456789abcdef-photo.png';

let admin: Pool;
let scoped: Pool;
let storage: any;
let pipeline: typeof import('../../server/services/page-save.js');

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(`
    CREATE TABLE page_permissions (
      id SERIAL PRIMARY KEY, page_id INTEGER NOT NULL, entity_type TEXT NOT NULL,
      entity_id INTEGER, permission TEXT NOT NULL, granted_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE wiki_pages (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
      blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs',
      tags TEXT[] NOT NULL DEFAULT '{}', author TEXT NOT NULL,
      parent_id INTEGER REFERENCES wiki_pages(id) ON DELETE SET NULL, team_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE, metadata JSONB DEFAULT '{}',
      deleted_at TIMESTAMP, icon TEXT, position INTEGER
    );
    CREATE TABLE page_versions (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      title TEXT NOT NULL, content TEXT NOT NULL, blocks JSONB DEFAULT '[]', author TEXT NOT NULL,
      version_number INTEGER NOT NULL, change_description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await scoped.query(PAGE_LINKS_MIGRATION);
  process.env.DATABASE_URL = scopedUrl;
  // Organizations (issue #124 X1a): the tables as 0022 leaves them, data in the default one
  const organizationId = await addOrganizations(scoped, undefined, {
    users: [{ id: ALICE.userId, email: ALICE.email }],
  });
  // The signed-in viewers belong to it, as getPageViewer would report
  for (const viewer of [ALICE]) Object.assign(viewer, { organizationId });
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
  pipeline = await import('../../server/services/page-save.js');
});

afterEach(() => {
  pipeline?.resetEditSessions();
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

async function storedMetadata(id: number) {
  const { rows } = await scoped.query(
    `SELECT metadata, metadata ? 'cover' AS has_cover FROM wiki_pages WHERE id = $1`,
    [id]
  );
  return rows[0] as { metadata: Record<string, unknown>; has_cover: boolean };
}

describe('page covers (real Postgres)', () => {
  it('a cover autosave writes metadata.cover, keeps other keys, and removal deletes the key', async () => {
    const { rows } = await scoped.query(
      `INSERT INTO wiki_pages (title, slug, content, author, metadata)
       VALUES ('Plan', 'plan', 'body', 'alice', '{"source": "frontmatter"}') RETURNING id`
    );
    const id = rows[0].id as number;
    const store = pipeline.storagePageSaveStore(storage);

    await pipeline.savePage(store, id, { cover: { type: 'preset', id: 'ocean' } }, 'autosave');
    expect(await storedMetadata(id)).toEqual({
      metadata: { source: 'frontmatter', cover: { type: 'preset', id: 'ocean' } },
      has_cover: true,
    });

    const image = { type: 'image' as const, path: IMAGE, offsetY: 35 };
    await pipeline.savePage(store, id, { cover: image }, 'autosave');
    expect((await storedMetadata(id)).metadata).toEqual({ source: 'frontmatter', cover: image });
    // The page API returns it as stored.
    expect((await storage.getWikiPage(id)).metadata.cover).toEqual(image);

    await pipeline.savePage(store, id, { cover: null }, 'autosave');
    expect(await storedMetadata(id)).toEqual({
      metadata: { source: 'frontmatter' },
      has_cover: false,
    });

    // Like the icon, the cover is not part of a version.
    const versions = await scoped.query('SELECT 1 FROM page_versions WHERE page_id = $1', [id]);
    expect(versions.rowCount).toBe(0);
  });

  it('a vault import stores the cover, and the export reads it back', async () => {
    const ids: number[] = await storage.reservePageIds(2);
    const cover = { type: 'image' as const, path: IMAGE, offsetY: 80 };
    await storage.insertImportedPages({
      teamId: null,
      userId: ALICE.userId,
      author: ALICE.email,
      folder: 'docs',
      pages: [
        {
          id: ids[0],
          title: 'With cover',
          slug: 'with-cover',
          content: 'a',
          tags: [],
          icon: null,
          cover,
          parentId: null,
          linkTargets: [],
        },
        {
          id: ids[1],
          title: 'Without cover',
          slug: 'without-cover',
          content: 'b',
          tags: [],
          icon: null,
          cover: null,
          parentId: null,
          linkTargets: [],
        },
      ],
    });
    expect((await storedMetadata(ids[0])).metadata).toEqual({ cover });
    expect(await storedMetadata(ids[1])).toEqual({ metadata: {}, has_cover: false });

    const rows = await storage.getVaultExportPages(ALICE, null);
    const byTitle = new Map(rows.map((row: any) => [row.title, row]));
    expect((byTitle.get('With cover') as any).metadata).toEqual({ cover });
    expect((byTitle.get('Without cover') as any).metadata).toEqual({});

    const { buildVaultEntries } = await import('../../server/services/vault-export.js');
    const { parseFrontmatter } = await import('../../server/services/vault-format.js');
    const entries = buildVaultEntries(rows, new Map());
    const file = entries.find((entry) => entry.name === 'With cover.md')!;
    expect(parseFrontmatter(String(file.data)).data).toMatchObject({
      cover: IMAGE,
      cover_offset_y: '80',
    });
  });
});
