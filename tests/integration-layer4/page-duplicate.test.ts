/**
 * Layer 4: duplicating a page with inline databases (#113 §4) against real Postgres.
 *
 * Proven here with DBStorage.duplicateWikiPage (POST /api/pages/:id/duplicate) and the tables of
 * drizzle/0012_add_advanced_blocks.sql:
 *   - the copy's database blocks point at databases of its own, with the source's properties,
 *     rows (in their order) and the relations between copied rows; blocks that shared a database
 *     share its copy;
 *   - nothing is copied from a database the source page does not own or no block shows, and
 *     relations to rows that are not copied stay behind;
 *   - the copies are independent: edits stay on their side, and deleting the source for good
 *     keeps the copy's data;
 *   - the page and its databases are written in one transaction: other sessions never see the
 *     copy before its databases, and a failure leaves no page, database, row or grant behind.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { parseStoredFields, planAddField, type DatabaseField } from '../../shared/inline-database';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'page_duplicate_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const migration = (file: string) =>
  readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8');

const ALICE = { id: 1, email: 'alice@example.com' };
const BOB = { id: 2, email: 'bob@example.com' };

const fields: DatabaseField[] = [
  { id: 'title', name: '이름', type: 'title' },
  { id: 'points', name: '점수', type: 'number' },
];

let admin: Pool;
let scoped: Pool;
let storage: any;

let pageCounter = 0;
async function createPage(title: string, blocks: unknown[] = []) {
  pageCounter += 1;
  return storage.createWikiPage(
    {
      title,
      slug: `page-${pageCounter}`,
      content: '',
      blocks,
      folder: 'docs',
      tags: [],
      author: ALICE.email,
    },
    ALICE.id
  );
}

const databaseBlock = (id: string, schemaId?: unknown, view: 'table' | 'board' = 'table') => ({
  id,
  type: 'database_inline',
  content: 'DB',
  order: 0,
  children: [],
  properties: {
    ...(schemaId === undefined ? {} : { schemaId }),
    activeView: view,
    views: { table: { sort: null, filter: null }, board: { sort: null, filter: null } },
  },
});

/** What the route passes: the source's content as a new page of the caller. */
const duplicate = (source: any, slug = `${source.slug}-copy`) =>
  storage.duplicateWikiPage(
    source.id,
    {
      title: `${source.title} (Copy)`,
      slug,
      content: source.content,
      blocks: source.blocks,
      folder: source.folder,
      tags: source.tags,
      author: BOB.email,
      parentId: source.parentId,
      teamId: source.teamId,
      isPublished: false,
      metadata: source.metadata,
    },
    BOB.id
  );

async function counts() {
  const { rows } = await scoped.query(`
    SELECT (SELECT count(*) FROM wiki_pages)::int AS pages,
           (SELECT count(*) FROM page_permissions)::int AS grants,
           (SELECT count(*) FROM page_links)::int AS links,
           (SELECT count(*) FROM database_schemas)::int AS schemas,
           (SELECT count(*) FROM database_rows)::int AS row_count,
           (SELECT count(*) FROM database_relations)::int AS relations`);
  return rows[0];
}

const rowsOf = async (schemaId: number) =>
  (await storage.getDatabaseRows(schemaId)).map((row: any) => [
    row.data,
    row.orderIndex,
    row.createdBy,
  ]);

/** Relations touching a page's databases, by row title, with the pages of both ends. */
async function relationsOf(pageId: number) {
  const { rows } = await scoped.query(
    `SELECT rel.property_name AS name, f.data->>'title' AS "from", t.data->>'title' AS "to",
            fs.page_id AS from_page, ts.page_id AS to_page,
            rel.from_schema_id = f.schema_id AND rel.to_schema_id = t.schema_id AS consistent
       FROM database_relations rel
       JOIN database_rows f ON f.id = rel.from_row_id
       JOIN database_rows t ON t.id = rel.to_row_id
       JOIN database_schemas fs ON fs.id = f.schema_id
       JOIN database_schemas ts ON ts.id = t.schema_id
      WHERE fs.page_id = $1 OR ts.page_id = $1
      ORDER BY rel.id`,
    [pageId]
  );
  return rows;
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE
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
  `);
  await scoped.query(migration('0012_add_advanced_blocks.sql'));
  await scoped.query(migration('0021_add_page_links.sql'));
  await scoped.query(
    `INSERT INTO users (id, name, email) VALUES ($1, 'Alice', $2), ($3, 'Bob', $4)`,
    [ALICE.id, ALICE.email, BOB.id, BOB.email]
  );
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

describe('page duplication with inline databases (real Postgres)', () => {
  it('gives the copy its own databases, shared by the blocks that shared one', async () => {
    const other = await createPage('Other page');
    const foreign = await storage.createDatabaseSchema(other.id, { name: 'Foreign', fields });
    const f1 = await storage.createDatabaseRow(foreign.id, ALICE.id, { title: 'f1' }, 100);

    const source = await createPage('Source');
    const tasks = await storage.createDatabaseSchema(source.id, {
      name: 'Tasks',
      description: 'what to do',
      fields,
    });
    const people = await storage.createDatabaseSchema(source.id, { name: 'People', fields });
    // Owned by the page, but no block shows it.
    const unshown = await storage.createDatabaseSchema(source.id, { name: 'Unshown', fields });
    const a1 = await storage.createDatabaseRow(tasks.id, ALICE.id, { title: 'a1', points: 1 }, 100);
    const a2 = await storage.createDatabaseRow(tasks.id, BOB.id, { title: 'a2' }, 100);
    const a3 = await storage.createDatabaseRow(tasks.id, null, { title: 'a3', points: 3 }, 100);
    await storage.updateDatabaseRow(a3.id, { place: { beforeRowId: a1.id } });
    const b1 = await storage.createDatabaseRow(people.id, ALICE.id, { title: 'b1' }, 100);
    const b2 = await storage.createDatabaseRow(people.id, ALICE.id, { title: 'b2' }, 100);
    const c1 = await storage.createDatabaseRow(unshown.id, ALICE.id, { title: 'c1' }, 100);
    await storage.addRelation(tasks.id, a1.id, 'owner', people.id, b1.id);
    await storage.addRelation(tasks.id, a2.id, 'after', tasks.id, a3.id);
    await storage.addRelation(tasks.id, a1.id, 'hidden', unshown.id, c1.id);
    await storage.addRelation(tasks.id, a1.id, 'outside', foreign.id, f1.id);
    await storage.addRelation(foreign.id, f1.id, 'inbound', tasks.id, a2.id);
    await storage.addRelation(people.id, b2.id, 'assigned', tasks.id, a1.id);

    const blocks = [
      { id: 'p', type: 'paragraph', content: 'intro', properties: {}, order: 0, children: [] },
      databaseBlock('tasks-table', tasks.id),
      databaseBlock('tasks-board', tasks.id, 'board'),
      databaseBlock('people', people.id),
      databaseBlock('foreign', foreign.id),
      databaseBlock('unknown', 987654),
      databaseBlock('malformed', String(tasks.id)),
      databaseBlock('new'),
    ];
    const withBlocks = await storage.updateWikiPage(source.id, {
      content: `intro [[page:${other.id}]]`,
      blocks,
    });
    const sourceRelations = await relationsOf(source.id);
    const before = await counts();

    const copy = await duplicate(withBlocks);

    const [paragraph, tasksTable, tasksBoard, peopleBlock, ...rest] = copy.blocks;
    const tasksCopy = tasksTable.properties.schemaId;
    const peopleCopy = peopleBlock.properties.schemaId;
    expect(paragraph).toEqual(blocks[0]);
    expect(tasksBoard.properties).toEqual({ ...blocks[2].properties, schemaId: tasksCopy });
    expect([tasks.id, people.id, unshown.id, foreign.id]).not.toContain(tasksCopy);
    expect([tasks.id, people.id, unshown.id, foreign.id, tasksCopy]).not.toContain(peopleCopy);
    expect(rest.map((block: any) => block.id)).toEqual(['foreign', 'unknown', 'malformed', 'new']);
    for (const block of rest) {
      expect(block.properties).not.toHaveProperty('schemaId');
      expect(block.properties.activeView).toBe('table');
    }
    expect((await storage.getWikiPage(copy.id)).blocks).toEqual(copy.blocks);

    const { rows: owned } = await scoped.query(
      'SELECT id, name, description, fields FROM database_schemas WHERE page_id = $1 ORDER BY id',
      [copy.id]
    );
    expect(owned).toEqual([
      { id: tasksCopy, name: 'Tasks', description: 'what to do', fields },
      { id: peopleCopy, name: 'People', description: null, fields },
    ]);
    expect(await rowsOf(tasksCopy)).toEqual(await rowsOf(tasks.id));
    expect((await rowsOf(tasksCopy)).map(([data]: any) => data.title)).toEqual(['a3', 'a1', 'a2']);
    expect(await rowsOf(peopleCopy)).toEqual(await rowsOf(people.id));
    expect(await relationsOf(copy.id)).toEqual(
      [
        ['owner', 'a1', 'b1'],
        ['after', 'a2', 'a3'],
        ['assigned', 'b2', 'a1'],
      ].map(([name, from, to]) => ({
        name,
        from,
        to,
        from_page: copy.id,
        to_page: copy.id,
        consistent: true,
      }))
    );

    // The source and the other page are as they were; only the copy's rows were added.
    expect(await relationsOf(source.id)).toEqual(sourceRelations);
    expect((await storage.getWikiPage(source.id)).blocks).toEqual(blocks);
    expect(await counts()).toEqual({
      ...before,
      pages: before.pages + 1,
      grants: before.grants + 1,
      links: before.links + 1,
      schemas: before.schemas + 2,
      row_count: before.row_count + 5,
      relations: before.relations + 3,
    });
    const { rows: grants } = await scoped.query(
      'SELECT entity_id, permission FROM page_permissions WHERE page_id = $1',
      [copy.id]
    );
    expect(grants).toEqual([{ entity_id: BOB.id, permission: 'owner' }]);
    const { rows: links } = await scoped.query(
      'SELECT target_page_id FROM page_links WHERE source_page_id = $1',
      [copy.id]
    );
    expect(links).toEqual([{ target_page_id: other.id }]);
  });

  it('keeps the copy independent: edits stay on their side, deleting the source keeps it', async () => {
    const source = await createPage('Independent');
    const db = await storage.createDatabaseSchema(source.id, { name: 'DB', fields });
    const first = await storage.createDatabaseRow(db.id, ALICE.id, { title: 'r', points: 1 }, 100);
    const second = await storage.createDatabaseRow(db.id, ALICE.id, { title: 's' }, 100);
    await storage.addRelation(db.id, first.id, 'next', db.id, second.id);
    const copy = await duplicate(
      await storage.updateWikiPage(source.id, { blocks: [databaseBlock('db', db.id)] })
    );
    const copyId = copy.blocks[0].properties.schemaId;
    const [copyFirst, copySecond] = await storage.getDatabaseRows(copyId);

    await storage.updateDatabaseRow(copyFirst.id, { values: { points: 5 } });
    await storage.createDatabaseRow(copyId, BOB.id, { title: 'only in the copy' }, 100);
    await storage.mutateDatabaseFields(copyId, (schema: any) =>
      planAddField(parseStoredFields(schema.fields)!, { name: '메모', type: 'text' }, () => 'memo')
    );
    expect((await storage.getDatabaseRows(db.id)).map((row: any) => row.data)).toEqual([
      { title: 'r', points: 1 },
      { title: 's' },
    ]);
    expect((await storage.getDatabaseSchema(db.id)).fields).toEqual(fields);

    await storage.updateDatabaseRow(first.id, { values: { title: 'renamed' } });
    expect((await storage.getDatabaseRows(copyId)).map((row: any) => row.data)).toEqual([
      { title: 'r', points: 5 },
      { title: 's' },
      { title: 'only in the copy' },
    ]);

    // Deleting the source for good takes its database with it, not the copy's.
    expect(await storage.deleteWikiPage(source.id)).toBe(true);
    expect(await storage.permanentlyDeleteWikiPage(source.id)).toBe(true);
    expect(await storage.getDatabaseSchema(db.id)).toBeUndefined();
    expect(await storage.getDatabaseSchema(copyId)).toMatchObject({ pageId: copy.id, name: 'DB' });
    expect((await storage.getDatabaseRows(copyId)).map((row: any) => row.data.title)).toEqual([
      'r',
      's',
      'only in the copy',
    ]);
    expect((await storage.getRelations(copyFirst.id)).map((r: any) => r.toRowId)).toEqual([
      copySecond.id,
    ]);
  });

  it('copies nothing from a database the source page does not own', async () => {
    const owner = await createPage('Owner of the data');
    const db = await storage.createDatabaseSchema(owner.id, { name: 'Private', fields });
    await storage.createDatabaseRow(db.id, ALICE.id, { title: 'secret' }, 100);
    // Blocks are page content: any editor of a page can point one at another page's database.
    const source = await createPage('Points at it', [databaseBlock('db', db.id)]);
    const before = await counts();

    const copy = await duplicate(source);

    expect(copy.blocks).toEqual([
      { ...source.blocks[0], properties: { activeView: 'table', views: expect.any(Object) } },
    ]);
    expect(await counts()).toEqual({
      ...before,
      pages: before.pages + 1,
      grants: before.grants + 1,
    });
    expect(await rowsOf(db.id)).toEqual([[{ title: 'secret' }, 0, ALICE.id]]);
  });

  it('writes the copy with its databases at once, and a failure leaves nothing behind', async () => {
    const source = await createPage('Atomic');
    const db = await storage.createDatabaseSchema(source.id, { name: 'DB', fields });
    const first = await storage.createDatabaseRow(db.id, ALICE.id, { title: 'r' }, 100);
    const second = await storage.createDatabaseRow(db.id, ALICE.id, { title: 's' }, 100);
    await storage.addRelation(db.id, first.id, 'next', db.id, second.id);
    const withBlocks = await storage.updateWikiPage(source.id, {
      blocks: [databaseBlock('db', db.id)],
    });
    const visibleCopies = async () =>
      (
        await scoped.query('SELECT blocks FROM wiki_pages WHERE slug LIKE $1', [
          `${source.slug}-copy%`,
        ])
      ).rows;

    // Held up while it copies the relations: the page and the database are written by then, yet
    // no other session sees the copy.
    const blocker = await scoped.connect();
    let pending: Promise<any> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE database_relations IN SHARE MODE');
      pending = duplicate(withBlocks);
      pending.catch(() => {});
      let waiting = false;
      for (let tries = 0; tries < 100 && !waiting; tries += 1) {
        const { rows } = await admin.query(
          `SELECT count(*)::int AS n FROM pg_locks
            WHERE NOT granted AND relation = '${SCHEMA}.database_relations'::regclass`
        );
        waiting = rows[0].n > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      expect(await visibleCopies()).toEqual([]);
    } finally {
      await blocker.query('COMMIT');
      blocker.release();
    }
    const copy = await pending;
    expect(copy.blocks[0].properties.schemaId).not.toBe(db.id);
    expect(await visibleCopies()).toEqual([{ blocks: copy.blocks }]);

    // A failure after the databases are copied (pointing the page at them) undoes it all.
    await scoped.query(`
      CREATE FUNCTION fail_copy() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION 'copy failed'; END $$;
      CREATE TRIGGER fail_copy BEFORE UPDATE ON wiki_pages
        FOR EACH ROW EXECUTE FUNCTION fail_copy();
    `);
    const before = await counts();
    try {
      const failure = await duplicate(withBlocks, `${source.slug}-copy-2`).catch((e: any) => e);
      // The driver's error, as drizzle wraps it.
      expect(failure?.cause?.message).toBe('copy failed');
    } finally {
      await scoped.query('DROP TRIGGER fail_copy ON wiki_pages; DROP FUNCTION fail_copy();');
    }
    expect(await counts()).toEqual(before);
    expect(await visibleCopies()).toEqual([{ blocks: copy.blocks }]);
  });
});
