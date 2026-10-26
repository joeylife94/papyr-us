/**
 * Layer 4: inline database storage (#113 §4) against real Postgres.
 *
 * Invariants proven here with DBStorage:
 *   - new rows append (order_index 0..n) and a database never grows past its row limit, even
 *     with concurrent inserts;
 *   - a row PATCH merges cells (null clears one), so concurrent edits of different cells of one
 *     row both survive;
 *   - moving a row before/after another renumbers the database 0..n-1, and an anchor from
 *     another database is refused without changing anything;
 *   - property changes run under the schema lock: concurrent additions both land, deleting a
 *     property removes its values from that database's rows only, and a type change that is not
 *     lossless is refused while values exist;
 *   - rollups only aggregate related rows of the databases they are allowed to read.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import {
  planAddField,
  planRemoveField,
  planUpdateField,
  parseStoredFields,
  type DatabaseField,
} from '../../shared/inline-database';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'inline_db_l4_i';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let storage: any;

const fields: DatabaseField[] = [
  { id: 'title', name: '이름', type: 'title' },
  { id: 'notes', name: '메모', type: 'text' },
  { id: 'points', name: '점수', type: 'number' },
];

async function createSchema() {
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.wiki_pages (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      slug       TEXT NOT NULL UNIQUE,
      content    TEXT NOT NULL DEFAULT '',
      author     TEXT NOT NULL DEFAULT 'u',
      deleted_at TIMESTAMP
    )
  `);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.database_schemas (
      id          SERIAL PRIMARY KEY,
      page_id     INTEGER NOT NULL REFERENCES ${SCHEMA}.wiki_pages(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      fields      JSONB NOT NULL DEFAULT '[]',
      created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.database_rows (
      id          SERIAL PRIMARY KEY,
      schema_id   INTEGER NOT NULL REFERENCES ${SCHEMA}.database_schemas(id) ON DELETE CASCADE,
      data        JSONB NOT NULL DEFAULT '{}',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_by  INTEGER,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await admin.query(`
    CREATE TABLE ${SCHEMA}.database_relations (
      id             SERIAL PRIMARY KEY,
      from_schema_id INTEGER NOT NULL REFERENCES ${SCHEMA}.database_schemas(id) ON DELETE CASCADE,
      from_row_id    INTEGER NOT NULL REFERENCES ${SCHEMA}.database_rows(id) ON DELETE CASCADE,
      to_schema_id   INTEGER NOT NULL REFERENCES ${SCHEMA}.database_schemas(id) ON DELETE CASCADE,
      to_row_id      INTEGER NOT NULL REFERENCES ${SCHEMA}.database_rows(id) ON DELETE CASCADE,
      property_name  TEXT NOT NULL,
      created_at     TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

let pageCounter = 0;
async function createDatabase(): Promise<number> {
  pageCounter += 1;
  const { rows } = await admin.query(
    `INSERT INTO ${SCHEMA}.wiki_pages (title, slug) VALUES ($1, $1) RETURNING id`,
    [`page-${pageCounter}`]
  );
  const schema = await storage.createDatabaseSchema(rows[0].id, { name: 'DB', fields });
  return schema.id;
}

const orderOf = async (schemaId: number) =>
  (await storage.getDatabaseRows(schemaId)).map((row: any) => [row.data.title, row.orderIndex]);

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await createSchema();
  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
});

afterAll(async () => {
  await storage?.pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('inline database storage (real Postgres)', () => {
  it('appends rows and holds the row limit under concurrent inserts', async () => {
    const schemaId = await createDatabase();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        storage.createDatabaseRow(schemaId, null, { title: `r${i}` }, 4)
      )
    );
    expect(results.filter(Boolean)).toHaveLength(4);
    expect(results.filter((row) => row === null)).toHaveLength(2);
    const rows = await storage.getDatabaseRows(schemaId);
    expect(rows.map((row: any) => row.orderIndex)).toEqual([0, 1, 2, 3]);
  });

  it('merges cells, clears with null, and keeps concurrent edits of different cells', async () => {
    const schemaId = await createDatabase();
    const row = await storage.createDatabaseRow(
      schemaId,
      null,
      { title: 'a', notes: 'n', points: 1 },
      10
    );
    await Promise.all([
      storage.updateDatabaseRow(row.id, { values: { notes: null } }),
      storage.updateDatabaseRow(row.id, { values: { points: 7 } }),
      storage.updateDatabaseRow(row.id, { values: { title: 'renamed' } }),
    ]);
    const stored = await storage.getDatabaseRow(row.id);
    expect(stored.data).toEqual({ title: 'renamed', points: 7 });
  });

  it('moves rows before or after another row and renumbers the database', async () => {
    const schemaId = await createDatabase();
    const other = await createDatabase();
    const created = [];
    for (const title of ['A', 'B', 'C', 'D']) {
      created.push(await storage.createDatabaseRow(schemaId, null, { title }, 10));
    }
    const foreign = await storage.createDatabaseRow(other, null, { title: 'X' }, 10);
    const [rowA, rowB, , rowD] = created;

    let outcome = await storage.updateDatabaseRow(rowD.id, { place: { beforeRowId: rowA.id } });
    expect(outcome.ok).toBe(true);
    expect(await orderOf(schemaId)).toEqual([
      ['D', 0],
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ]);

    outcome = await storage.updateDatabaseRow(rowD.id, {
      values: { points: 2 },
      place: { afterRowId: rowB.id },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.row.data).toEqual({ title: 'D', points: 2 });
    expect(await orderOf(schemaId)).toEqual([
      ['A', 0],
      ['B', 1],
      ['D', 2],
      ['C', 3],
    ]);

    outcome = await storage.updateDatabaseRow(rowA.id, {
      values: { title: 'changed' },
      place: { afterRowId: foreign.id },
    });
    expect(outcome).toMatchObject({ ok: false, status: 400 });
    expect(await orderOf(schemaId)).toEqual([
      ['A', 0],
      ['B', 1],
      ['D', 2],
      ['C', 3],
    ]);
    expect(await orderOf(other)).toEqual([['X', 0]]);
  });

  it('changes properties under the schema lock', async () => {
    const schemaId = await createDatabase();
    const other = await createDatabase();
    const row = await storage.createDatabaseRow(schemaId, null, { title: 't', notes: 'x' }, 10);
    const otherRow = await storage.createDatabaseRow(other, null, { title: 'o', notes: 'y' }, 10);
    const apply = (plan: (current: DatabaseField[]) => any) =>
      storage.mutateDatabaseFields(schemaId, (schema: any) =>
        plan(parseStoredFields(schema.fields)!)
      );

    // Two concurrent additions both land.
    const [first, second] = await Promise.all([
      apply((current) => planAddField(current, { name: '날짜', type: 'date' }, () => 'f_date')),
      apply((current) => planAddField(current, { name: '확인', type: 'checkbox' }, () => 'f_ok')),
    ]);
    expect(first.ok && second.ok).toBe(true);
    const afterAdds = parseStoredFields((await storage.getDatabaseSchema(schemaId)).fields)!;
    expect(afterAdds.map((field) => field.id)).toEqual(
      expect.arrayContaining(['title', 'notes', 'points', 'f_date', 'f_ok'])
    );
    expect(afterAdds).toHaveLength(5);

    // A lossy type change is refused while the property has values; a lossless one is not.
    expect(await apply((current) => planUpdateField(current, 'notes', { type: 'number' }))).toEqual(
      {
        ok: false,
        status: 409,
        message: 'The property has values, so its type cannot change to this type',
      }
    );
    expect((await apply((current) => planUpdateField(current, 'notes', { type: 'url' }))).ok).toBe(
      true
    );
    expect(
      (await apply((current) => planUpdateField(current, 'points', { type: 'select' }))).ok
    ).toBe(true);

    // Deleting a property removes its values from this database's rows only.
    expect((await apply((current) => planRemoveField(current, 'notes'))).ok).toBe(true);
    expect((await storage.getDatabaseRow(row.id)).data).toEqual({ title: 't' });
    expect((await storage.getDatabaseRow(otherRow.id)).data).toEqual({ title: 'o', notes: 'y' });

    expect(await storage.mutateDatabaseFields(987654, () => ({ ok: true }))).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it('rolls up only the related rows of allowed databases', async () => {
    const source = await createDatabase();
    const readable = await createDatabase();
    const hidden = await createDatabase();
    const from = await storage.createDatabaseRow(source, null, { title: 's' }, 10);
    const r1 = await storage.createDatabaseRow(readable, null, { title: 'r', points: 3 }, 10);
    const h1 = await storage.createDatabaseRow(hidden, null, { title: 'h', points: 40 }, 10);
    await storage.addRelation(source, from.id, 'related', readable, r1.id);
    await storage.addRelation(source, from.id, 'related', hidden, h1.id);
    const config = { relationField: 'related', targetField: 'points', aggregation: 'sum' };

    expect(await storage.calculateRollup(from.id, 'total', config)).toBe(43);
    expect(await storage.calculateRollup(from.id, 'total', config, [readable])).toBe(3);
    expect(await storage.calculateRollup(from.id, 'total', config, [])).toBe(null);
    expect(
      await storage.calculateRollup(from.id, 'n', { ...config, aggregation: 'count' }, [])
    ).toBe(0);
    const relations = await storage.getRelations(from.id, 'related');
    expect(relations.map((relation: any) => relation.toRowId)).toEqual([r1.id, h1.id]);
    const relation = await storage.getDatabaseRelation(relations[0].id);
    expect(relation).toMatchObject({ fromRowId: from.id, toRowId: r1.id });
  });
});
