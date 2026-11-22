/**
 * Layer 4: block anchors and resolved state of comment threads against real Postgres (WP15).
 *
 * drizzle/0032_add_comment_threads.sql, DBStorage and the thread fields on tables in the shape of
 * the previous release:
 * - the four columns are added nullable (resolved_at as timestamptz, resolved_by_user_id as a
 *   foreign key that sets null), and every comment that existed reads as page-level and open;
 * - applying the file again changes nothing; its down file refuses while a comment is anchored
 *   or resolved and otherwise drops the columns, and the file applies again after it;
 * - resolving writes who and when once: resolving a resolved thread keeps the first resolver and
 *   time, and reopening an open thread writes nothing; reopening clears both;
 * - a resolver whose account is deleted leaves the thread resolved with the resolver set to null,
 *   and a deactivated resolver is not named;
 * - a thread whose block is no longer among the page's blocks says so (`blockExists: false`), and
 *   its replies carry the thread's anchor and state.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';
import { withThreadFields } from '../../server/services/comment-threads';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_wp15_comment_threads';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const read = (file: string) =>
  readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8');
const UP = read('0032_add_comment_threads.sql');
const DOWN = read('0032_add_comment_threads.down.sql');

// The tables as the previous release had them: comments without the thread columns.
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
  CREATE TABLE wiki_pages (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
    blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs', tags TEXT[] NOT NULL DEFAULT '{}',
    author TEXT NOT NULL, parent_id INTEGER, position INTEGER,
    team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_published BOOLEAN NOT NULL DEFAULT TRUE, deleted_at TIMESTAMP,
    metadata JSONB DEFAULT '{}', icon TEXT
  );
  CREATE TABLE comments (
    id SERIAL PRIMARY KEY, content TEXT NOT NULL, author TEXT NOT NULL,
    author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    parent_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

let admin: Pool;
let scoped: Pool;
let storage: any;
let counter = 0;
let legacyPageId = 0;
let legacyCommentIds: number[] = [];

async function newUser(label: string, active = true) {
  counter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO users (name, email, is_active) VALUES ($1, $2, $3) RETURNING id`,
    [`${label} Person`, `${label}-${counter}@example.com`, active]
  );
  return Number(rows[0].id);
}

async function newPage(blocks: unknown[] = []) {
  counter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, blocks) VALUES ($1, $2, '', 'a', $3) RETURNING id`,
    [`Page ${counter}`, `page-${counter}`, JSON.stringify(blocks)]
  );
  return Number(rows[0].id);
}

async function newThread(pageId: number, authorId: number, blockId: string | null = null) {
  const { rows } = await scoped.query(
    `INSERT INTO comments (content, author, author_user_id, page_id, block_id, block_excerpt)
     VALUES ('c', 'a', $1, $2, $3, $4) RETURNING id`,
    [authorId, pageId, blockId, blockId ? 'excerpt' : null]
  );
  return Number(rows[0].id);
}

const columns = async () =>
  (
    await scoped.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'comments' ORDER BY ordinal_position`,
      [SCHEMA]
    )
  ).rows as Array<{ column_name: string; data_type: string; is_nullable: string }>;

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(TABLES);
  // Comments that exist before the upgrade: a top-level one and a reply.
  const author = await scoped.query(
    `INSERT INTO users (name, email) VALUES ('Old Author', 'old@example.com') RETURNING id`
  );
  legacyPageId = await newPage([{ id: 'b1', type: 'paragraph', content: 'x' }]);
  const top = await scoped.query(
    `INSERT INTO comments (content, author, author_user_id, page_id) VALUES ('old', 'Old Author', $1, $2) RETURNING id`,
    [author.rows[0].id, legacyPageId]
  );
  const reply = await scoped.query(
    `INSERT INTO comments (content, author, author_user_id, page_id, parent_id) VALUES ('old reply', 'Old Author', $1, $2, $3) RETURNING id`,
    [author.rows[0].id, legacyPageId, top.rows[0].id]
  );
  legacyCommentIds = [Number(top.rows[0].id), Number(reply.rows[0].id)];
  // The upgrade: addOrganizations applies the migrations, 0032 among them.
  await addOrganizations(scoped);

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

describe('the upgrade', () => {
  it('adds four nullable columns, resolved_at with a time zone', async () => {
    const added = (await columns()).filter((column) =>
      ['block_id', 'block_excerpt', 'resolved_at', 'resolved_by_user_id'].includes(
        column.column_name
      )
    );
    expect(added).toEqual([
      { column_name: 'block_id', data_type: 'text', is_nullable: 'YES' },
      { column_name: 'block_excerpt', data_type: 'text', is_nullable: 'YES' },
      { column_name: 'resolved_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
      { column_name: 'resolved_by_user_id', data_type: 'integer', is_nullable: 'YES' },
    ]);
  });

  it('leaves every comment that existed page-level and open', async () => {
    const rows = await storage.getCommentsByPageId(legacyPageId);
    expect(rows.map((row: any) => row.id)).toEqual(legacyCommentIds);
    const listed = withThreadFields(rows, [{ id: 'b1', type: 'paragraph', content: 'x' }]);
    for (const comment of listed) {
      expect(comment).toMatchObject({
        blockId: null,
        blockExcerpt: null,
        resolvedAt: null,
        resolvedBy: null,
        blockExists: false,
      });
    }
    const { rows: stored } = await scoped.query(
      `SELECT count(*)::int AS n FROM comments
        WHERE block_id IS NOT NULL OR block_excerpt IS NOT NULL
           OR resolved_at IS NOT NULL OR resolved_by_user_id IS NOT NULL`
    );
    expect(stored[0].n).toBe(0);
  });

  it('is idempotent: a second run changes nothing and keeps what was stored since', async () => {
    const author = await newUser('idem');
    const pageId = await newPage([{ id: 'k', type: 'paragraph', content: 'kept' }]);
    const id = await newThread(pageId, author, 'k');
    const before = await columns();
    await scoped.query(UP);
    expect(await columns()).toEqual(before);
    const { rows } = await scoped.query(
      `SELECT block_id, block_excerpt FROM comments WHERE id = $1`,
      [id]
    );
    expect(rows[0]).toEqual({ block_id: 'k', block_excerpt: 'excerpt' });
  });

  it('refuses to go down while a comment is anchored, then drops the columns and applies again', async () => {
    const author = await newUser('down');
    const pageId = await newPage([{ id: 'd', type: 'paragraph', content: 'd' }]);
    const id = await newThread(pageId, author, 'd');
    await expect(scoped.query(DOWN)).rejects.toThrow(/anchored to a block or resolved/);
    expect((await columns()).map((column) => column.column_name)).toContain('block_id');

    await scoped.query(`DELETE FROM comments WHERE id = $1`, [id]);
    // Remaining threads (other tests' rows) hold no anchor yet; clear them for this check.
    await scoped.query(
      `UPDATE comments SET block_id = NULL, block_excerpt = NULL, resolved_at = NULL`
    );
    await scoped.query(DOWN);
    const down = (await columns()).map((column) => column.column_name);
    expect(down).not.toContain('block_id');
    expect(down).not.toContain('resolved_by_user_id');
    await scoped.query(UP);
    expect((await columns()).map((column) => column.column_name)).toContain('resolved_by_user_id');
  });
});

describe('resolving and reopening', () => {
  it('records who resolved and when once, and keeps the first record on a repeat', async () => {
    const author = await newUser('author');
    const first = await newUser('first');
    const second = await newUser('second');
    const pageId = await newPage();
    const id = await newThread(pageId, author);

    const resolved = await storage.setCommentResolved(id, first);
    expect(resolved.resolvedByUserId).toBe(first);
    expect(resolved.resolvedAt).toBeInstanceOf(Date);

    const again = await storage.setCommentResolved(id, second);
    expect(again.resolvedByUserId).toBe(first);
    expect(again.resolvedAt.getTime()).toBe(resolved.resolvedAt.getTime());

    const listed = await storage.getCommentsByPageId(pageId);
    expect(listed[0].resolvedByName).toBe('first Person');
  });

  it('reopening clears both, and reopening an open thread writes nothing', async () => {
    const author = await newUser('author2');
    const resolver = await newUser('resolver2');
    const pageId = await newPage();
    const id = await newThread(pageId, author);
    await storage.setCommentResolved(id, resolver);

    const reopened = await storage.setCommentResolved(id, null);
    expect(reopened).toMatchObject({ resolvedAt: null, resolvedByUserId: null });
    const repeat = await storage.setCommentResolved(id, null);
    expect(repeat).toMatchObject({ resolvedAt: null, resolvedByUserId: null });
  });

  it('answers undefined for an unknown comment', async () => {
    expect(await storage.setCommentResolved(987654, 1)).toBeUndefined();
  });

  it('keeps the thread resolved with the resolver set to null when that account is deleted', async () => {
    const author = await newUser('author3');
    const resolver = await newUser('resolver3');
    const pageId = await newPage();
    const id = await newThread(pageId, author);
    await storage.setCommentResolved(id, resolver);

    await scoped.query(`DELETE FROM users WHERE id = $1`, [resolver]);
    const { rows } = await scoped.query(
      `SELECT resolved_at, resolved_by_user_id FROM comments WHERE id = $1`,
      [id]
    );
    expect(rows[0].resolved_at).toBeInstanceOf(Date);
    expect(rows[0].resolved_by_user_id).toBeNull();
    const [thread] = withThreadFields(await storage.getCommentsByPageId(pageId), []);
    expect(thread.resolvedBy).toBe('Unknown User');
    expect(thread).not.toHaveProperty('resolvedByUserId');
  });

  it('does not name a deactivated resolver', async () => {
    const author = await newUser('author4');
    const resolver = await newUser('resolver4');
    const pageId = await newPage();
    const id = await newThread(pageId, author);
    await storage.setCommentResolved(id, resolver);
    await scoped.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [resolver]);
    const [thread] = withThreadFields(await storage.getCommentsByPageId(pageId), []);
    expect(thread.resolvedBy).toBe('Unknown User');
    expect(await storage.getAccountDisplayName(resolver)).toBeNull();
  });
});

describe('the anchored block', () => {
  it('says so once the block is no longer among the page blocks, and replies follow their thread', async () => {
    const author = await newUser('author5');
    const blocks = [
      { id: 'keep', type: 'paragraph', content: 'stays' },
      { id: 'drop', type: 'paragraph', content: 'goes' },
    ];
    const pageId = await newPage(blocks);
    const kept = await newThread(pageId, author, 'keep');
    const dropped = await newThread(pageId, author, 'drop');
    await scoped.query(
      `INSERT INTO comments (content, author, author_user_id, page_id, parent_id) VALUES ('r', 'a', $1, $2, $3)`,
      [author, pageId, dropped]
    );

    await scoped.query(`UPDATE wiki_pages SET blocks = $1 WHERE id = $2`, [
      JSON.stringify([blocks[0]]),
      pageId,
    ]);
    const page = await storage.getWikiPage(pageId);
    const listed = withThreadFields(await storage.getCommentsByPageId(pageId), page.blocks);
    const byId = new Map(listed.map((comment: any) => [comment.id, comment]));
    expect(byId.get(kept)).toMatchObject({ blockId: 'keep', blockExists: true });
    expect(byId.get(dropped)).toMatchObject({
      blockId: 'drop',
      blockExcerpt: 'excerpt',
      blockExists: false,
    });
    const reply = listed.find((comment: any) => comment.parentId === dropped);
    expect(reply).toMatchObject({ blockId: 'drop', blockExists: false });
  });
});
