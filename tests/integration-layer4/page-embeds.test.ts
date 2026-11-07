/**
 * Layer 4: page embeds against real Postgres (issue #135, decision P3-D2).
 *
 * Proven here with DBStorage, drizzle/0021_add_page_links.sql and the save pipeline:
 *   - an embed block saves as its id-only token: the page's `content` (reader, search, AI) holds
 *     `![[page:<id>]]` and nothing of the target, and its versions hold nothing of it either;
 *   - embeds are indexed in page_links like links (create, update, autosave), so the target's
 *     backlinks and the knowledge graph include the embedding page;
 *   - the embed read rule (`readableLinkTarget`, shared with the link preview) answers an
 *     unreadable page exactly as an unknown or trashed one, with the real permission SQL.
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

const SCHEMA = 'page_embeds_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const MIGRATION = readFileSync(
  new URL('../../drizzle/0021_add_page_links.sql', import.meta.url),
  'utf8'
);

const ALICE = { id: 1, email: 'alice@example.com' };
const BOB = { id: 2, email: 'bob@example.com' };
const TEAM = 61;

let admin: Pool;
let scoped: Pool;
let storage: any;

const page = (title: string, author: string, content = '', extra: object = {}) => ({
  title,
  slug: `${title.toLowerCase().replace(/\W+/g, '-')}`,
  content,
  blocks: [],
  folder: 'docs',
  tags: [],
  author,
  ...extra,
});

const embedBlock = (pageId: number, id = 'embed') => ({
  id,
  type: 'page_embed',
  content: '',
  properties: { pageId },
  order: 0,
  children: [],
});

async function linksFrom(sourceId: number): Promise<number[]> {
  const { rows } = await scoped.query(
    'SELECT target_page_id FROM page_links WHERE source_page_id = $1 ORDER BY target_page_id',
    [sourceId]
  );
  return rows.map((r: any) => r.target_page_id);
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
      id SERIAL PRIMARY KEY, page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      title TEXT NOT NULL, content TEXT NOT NULL, blocks JSONB DEFAULT '[]', author TEXT NOT NULL,
      version_number INTEGER NOT NULL, change_description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await scoped.query(MIGRATION);
  await scoped.query(
    `INSERT INTO users (id, name, email) VALUES ($1, 'Alice', $2), ($3, 'Bob', $4)`,
    [ALICE.id, ALICE.email, BOB.id, BOB.email]
  );
  await scoped.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [
    TEAM,
    ALICE.id,
  ]);
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

describe('page embeds (real Postgres)', () => {
  it('saves an embed as its token only and indexes it like a link', async () => {
    const { savePage, storagePageSaveStore } = await import('../../server/services/page-save.js');
    const target = await storage.createWikiPage(
      page('Embed target', ALICE.email, 'Target secret text', { teamId: TEAM }),
      ALICE.id
    );
    const other = await storage.createWikiPage(
      page('Embed other', ALICE.email, 'other', { teamId: TEAM }),
      ALICE.id
    );
    // Created with an embed token in its content (API, import).
    const source = await storage.createWikiPage(
      page('Embed source', ALICE.email, `Intro\n\n![[page:${target.id}]]`, { teamId: TEAM }),
      ALICE.id
    );
    expect(await linksFrom(source.id)).toEqual([target.id]);

    // Edited as blocks: autosave derives the content, which holds only the token.
    const store = storagePageSaveStore(storage);
    await savePage(
      store,
      source.id,
      {
        blocks: [
          { id: 'p', type: 'paragraph', content: 'Intro', properties: {}, order: 0, children: [] },
          embedBlock(other.id),
          embedBlock(target.id, 'embed2'),
        ],
      },
      'autosave'
    );
    const saved = await storage.getWikiPage(source.id);
    expect(saved.content).toBe(`Intro\n\n![[page:${other.id}]]\n\n![[page:${target.id}]]`);
    expect(await linksFrom(source.id)).toEqual([other.id, target.id].sort((a, b) => a - b));

    // Nothing of the target in the page, its blocks or its versions.
    const { rows: versions } = await scoped.query(
      'SELECT content, blocks FROM page_versions WHERE page_id = $1',
      [source.id]
    );
    expect(versions.length).toBeGreaterThan(0);
    expect(JSON.stringify({ saved, versions })).not.toContain('Target secret text');

    // Removing the embed removes the index row.
    await savePage(store, source.id, { blocks: [embedBlock(other.id)] }, 'autosave');
    expect(await linksFrom(source.id)).toEqual([other.id]);
  });

  it('lists the embedding page in backlinks and the knowledge graph', async () => {
    const target = await storage.createWikiPage(
      page('Graph target', ALICE.email, 'x', { teamId: TEAM }),
      ALICE.id
    );
    const source = await storage.createWikiPage(
      page('Graph source', ALICE.email, `![[page:${target.id}]]`, { teamId: TEAM }),
      ALICE.id
    );
    const backlinks = await storage.getReadableBacklinks(ALICE.id, target.id);
    expect(backlinks.map((p: any) => p.id)).toEqual([source.id]);

    const viewer = await storage.getPageViewer(ALICE.id);
    const graph = await storage.getKnowledgeGraphSource(viewer, [TEAM]);
    expect(graph.links).toContainEqual({ sourcePageId: source.id, targetPageId: target.id });
  });

  it('answers an unreadable target exactly as an unknown or trashed one', async () => {
    const { readableLinkTarget } = await import('../../server/routes/page-embeds.js');
    // Bob's personal page: owner-only, so Alice may not read it.
    const secret = await storage.createWikiPage(page('Bob secret', BOB.email, 'hidden'), BOB.id);
    const mine = await storage.createWikiPage(page('Alice own', ALICE.email, 'mine'), ALICE.id);
    const trashed = await storage.createWikiPage(page('Alice old', ALICE.email, 'old'), ALICE.id);
    await storage.trashPages([trashed.id]);

    expect((await readableLinkTarget(storage, ALICE.id, mine.id))?.id).toBe(mine.id);
    expect((await readableLinkTarget(storage, BOB.id, secret.id))?.content).toBe('hidden');
    for (const id of [secret.id, trashed.id, 2_000_000_000]) {
      expect(await readableLinkTarget(storage, ALICE.id, id), `page ${id}`).toBeNull();
    }
    expect(await readableLinkTarget(storage, undefined, secret.id)).toBeNull();
  });
});
