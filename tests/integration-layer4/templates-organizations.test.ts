/**
 * Layer 4: templates belong to an organization, against real Postgres (issue #124 X1b, D1).
 *
 * Migration, drizzle/0023_add_template_organizations.sql on a deployment that already ran 0022
 * and holds templates:
 * - additive: every existing template lands in the default organization, no row or existing
 *   column changes, and templates.organization_id is NOT NULL under the foreign key and index
 *   names shared/schema.ts gives them;
 * - idempotent: a second run changes nothing;
 * - careful: a database without a templates table is left alone; the default organization is
 *   created only when there are templates to put in it; without organizations (0022 not applied)
 *   and with templates it refuses;
 * - reversible: drizzle/0023_add_template_organizations.down.sql refuses while more than one
 *   organization exists (also when only one owns templates), otherwise removes only the column, its index and its foreign key (the
 *   templates keep all their data), and 0023 applies again after it.
 *
 * Boundary, DBStorage on the migrated tables with a second organization: no template read,
 * update, delete or usage count crosses organizations, a new template takes the organization
 * it is created for, and no update can move a template.
 *
 * The tables live in their own schemas so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'templates_orgs_l4';
const BARE = 'templates_orgs_l4_bare';
const urlFor = (schema: string) => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
};
const read = (file: string) =>
  readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8');
const UP = read('0023_add_template_organizations.sql');
const DOWN = read('0023_add_template_organizations.down.sql');

const CATEGORIES_AND_TEMPLATES = `
  CREATE TABLE template_categories (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    description TEXT, icon TEXT, color TEXT, "order" INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE templates (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, content TEXT NOT NULL,
    category_id INTEGER REFERENCES template_categories(id) ON DELETE CASCADE,
    tags TEXT[] NOT NULL DEFAULT '{}', author TEXT NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT TRUE, usage_count INTEGER NOT NULL DEFAULT 0,
    rating INTEGER NOT NULL DEFAULT 0, thumbnail TEXT, metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

let admin: Pool;
let scoped: Pool;
let bare: Pool;
let storage: any;
let defaultOrg: number;
let acme: number;

/** A one-column-per-line picture of the templates table and its constraints and indexes. */
async function shape(pool: Pool, schema: string) {
  const columns = await pool.query(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'templates' ORDER BY column_name`,
    [schema]
  );
  const constraints = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = to_regclass($1 || '.templates') ORDER BY conname`,
    [schema]
  );
  const indexes = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = $1 AND tablename = 'templates' ORDER BY indexname`,
    [schema]
  );
  return { columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows };
}

/** Template rows in the columns that existed before 0023. */
async function legacyRows(pool: Pool) {
  const { rows } = await pool.query(
    `SELECT id, title, description, content, category_id, tags, author, is_public, usage_count,
            rating, thumbnail, metadata, created_at, updated_at
       FROM templates ORDER BY id`
  );
  return rows;
}

const insertTemplate = (title: string, organizationId?: number) =>
  scoped.query(
    organizationId === undefined
      ? `INSERT INTO templates (title, content, author) VALUES ($1, 'body', 'a') RETURNING id`
      : `INSERT INTO templates (title, content, author, organization_id)
         VALUES ($1, 'body', 'a', ${organizationId}) RETURNING id`,
    [title]
  );

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  for (const schema of [SCHEMA, BARE]) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
  }
  scoped = new Pool({ connectionString: urlFor(SCHEMA) });
  bare = new Pool({ connectionString: urlFor(BARE) });

  // A deployment after 0022 and before 0023: templates in two categories, none with an owner.
  await scoped.query(CATEGORIES_AND_TEMPLATES);
  await scoped.query(`
    CREATE TABLE wiki_pages (id SERIAL PRIMARY KEY, team_id INTEGER);
    INSERT INTO template_categories (id, name, display_name) VALUES (1, 'notes', 'Notes'), (2, 'plans', 'Plans');
    INSERT INTO templates (id, title, description, content, category_id, tags, author, usage_count, rating)
    VALUES (1, 'Meeting notes', 'weekly', '# Notes', 1, '{a,b}', 'ann@example.com', 4, 3),
           (2, 'Roadmap', NULL, '# Roadmap', 2, '{}', 'ben@example.com', 0, 0),
           (3, 'Loose', NULL, 'x', NULL, '{}', 'someone', 9, 1);
    SELECT setval(pg_get_serial_sequence('templates', 'id'), 3);
    SELECT setval(pg_get_serial_sequence('template_categories', 'id'), 2);
  `);
  defaultOrg = await addOrganizations(scoped, undefined, { users: [{ id: 1, email: 'a@x.org' }] });
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await bare?.end();
  for (const schema of [SCHEMA, BARE]) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

describe('0023 template organizations migration (real Postgres)', () => {
  it('moves every existing template into the default organization; idempotent', async () => {
    const before = await legacyRows(scoped);
    expect(before).toHaveLength(3);
    const beforeColumns = (await shape(scoped, SCHEMA)).columns.map((c: any) => c.column_name);
    expect(beforeColumns).not.toContain('organization_id');

    await scoped.query(UP);
    const once = await shape(scoped, SCHEMA);
    const onceRows = await scoped.query(`SELECT id, organization_id FROM templates ORDER BY id`);
    await scoped.query(UP);
    const twice = await shape(scoped, SCHEMA);

    expect(onceRows.rows).toEqual([
      { id: 1, organization_id: defaultOrg },
      { id: 2, organization_id: defaultOrg },
      { id: 3, organization_id: defaultOrg },
    ]);
    // Nothing else changed: same rows in the old columns, and a second run leaves the table,
    // its constraints and its indexes as they were.
    expect(await legacyRows(scoped)).toEqual(before);
    expect(twice).toEqual(once);
    const { rows: orgs } = await scoped.query(`SELECT slug FROM organizations`);
    expect(orgs).toEqual([{ slug: 'default' }]);

    // The column, foreign key and index have the names drizzle-kit derives from schema.ts.
    const column = once.columns.find((c: any) => c.column_name === 'organization_id');
    expect(column).toMatchObject({ is_nullable: 'NO', data_type: 'integer' });
    expect(once.constraints.map((c: any) => c.conname)).toContain(
      'templates_organization_id_organizations_id_fk'
    );
    const fk = once.constraints.find(
      (c: any) => c.conname === 'templates_organization_id_organizations_id_fk'
    );
    expect(fk.def).toMatch(
      /FOREIGN KEY \(organization_id\) REFERENCES .*organizations\(id\) ON DELETE RESTRICT/
    );
    expect(once.indexes.map((i: any) => i.indexname)).toContain('idx_templates_organization_id');
  });

  it('leaves a database without a templates table alone', async () => {
    await bare.query(UP);
    const { rows } = await bare.query(
      `SELECT to_regclass('templates') AS t, to_regclass('organizations') AS o`
    );
    expect(rows[0]).toEqual({ t: null, o: null });
  });

  it('creates the default organization only when there are templates to put in it', async () => {
    await bare.query(`
      CREATE TABLE organizations (
        id SERIAL PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL,
        CONSTRAINT organizations_slug_unique UNIQUE (slug)
      );
      ${CATEGORIES_AND_TEMPLATES}
    `);
    await bare.query(UP); // no templates: no default organization, column added
    expect((await bare.query(`SELECT count(*)::int AS n FROM organizations`)).rows[0].n).toBe(0);
    expect(
      (await shape(bare, BARE)).columns.find((c: any) => c.column_name === 'organization_id')
        .is_nullable
    ).toBe('NO');

    await bare.query(DOWN);
    await bare.query(`INSERT INTO templates (title, content, author) VALUES ('t', 'c', 'a')`);
    await bare.query(UP); // a template and no default organization: it is created
    const { rows } = await bare.query(
      `SELECT o.slug FROM templates t JOIN organizations o ON o.id = t.organization_id`
    );
    expect(rows).toEqual([{ slug: 'default' }]);
  });

  it('refuses templates when organizations do not exist', async () => {
    await bare.query(`DROP TABLE templates; DROP TABLE organizations CASCADE;`);
    await bare.query(
      CATEGORIES_AND_TEMPLATES.replace(/CREATE TABLE template_categories[\s\S]*?\);\n/, '')
    );
    await bare.query(`INSERT INTO templates (title, content, author) VALUES ('t', 'c', 'a')`);
    await expect(bare.query(UP)).rejects.toThrow(/0022_add_organizations/);
    expect((await shape(bare, BARE)).columns.map((c: any) => c.column_name)).not.toContain(
      'organization_id'
    );
  });
});

describe('templates through DBStorage with two organizations', () => {
  let a1: number;
  let a2: number;
  let b1: number;

  beforeAll(async () => {
    const { rows } = await scoped.query(
      `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
    );
    acme = Number(rows[0].id);
    a1 = 1; // 'Meeting notes', category 1, usage 4
    a2 = 2;
    b1 = Number((await insertTemplate('Acme plan', acme)).rows[0].id);
    await scoped.query(`UPDATE templates SET category_id = 1, usage_count = 7 WHERE id = $1`, [b1]);

    process.env.DATABASE_URL = urlFor(SCHEMA);
    const { DBStorage } = await import('../../server/storage.js');
    storage = new DBStorage();
  });

  it('lists only the organization own templates, by usage, with the category filter', async () => {
    const own = await storage.getTemplates(defaultOrg);
    expect(own.map((t: any) => t.id)).toEqual([3, a1, a2]);
    expect(own.every((t: any) => t.organizationId === defaultOrg)).toBe(true);
    expect((await storage.getTemplates(acme)).map((t: any) => t.id)).toEqual([b1]);
    // Category 1 holds templates of both organizations; each sees its own.
    expect((await storage.getTemplates(defaultOrg, 1)).map((t: any) => t.id)).toEqual([a1]);
    expect((await storage.getTemplates(acme, 1)).map((t: any) => t.id)).toEqual([b1]);
    expect(await storage.getTemplates(acme, 2)).toEqual([]);
  });

  it('reads a template only inside its organization', async () => {
    expect((await storage.getTemplate(a1, defaultOrg)).title).toBe('Meeting notes');
    expect(await storage.getTemplate(a1, acme)).toBeUndefined();
    expect(await storage.getTemplate(b1, defaultOrg)).toBeUndefined();
    expect(await storage.getTemplate(99999, defaultOrg)).toBeUndefined();
  });

  it('never updates, deletes or counts a template of another organization', async () => {
    const before = await legacyRows(scoped);
    expect(await storage.updateTemplate(a1, { title: 'hijacked' }, acme)).toBeUndefined();
    expect(await storage.deleteTemplate(a1, acme)).toBe(false);
    expect(await storage.incrementTemplateUsage(a1, acme)).toBe(false);
    expect(await storage.updateTemplate(b1, { title: 'hijacked' }, defaultOrg)).toBeUndefined();
    expect(await storage.deleteTemplate(b1, defaultOrg)).toBe(false);
    expect(await storage.incrementTemplateUsage(b1, defaultOrg)).toBe(false);
    expect(await legacyRows(scoped)).toEqual(before);
  });

  it('updates, counts and deletes inside the organization', async () => {
    const updated = await storage.updateTemplate(a2, { title: 'Roadmap v2' }, defaultOrg);
    expect(updated).toMatchObject({ id: a2, title: 'Roadmap v2', organizationId: defaultOrg });
    expect(await storage.incrementTemplateUsage(a2, defaultOrg)).toBe(true);
    expect((await storage.getTemplate(a2, defaultOrg)).usageCount).toBe(1);
  });

  it('cannot move a template to another organization', async () => {
    const moved = await storage.updateTemplate(
      a2,
      { title: 'still mine', organizationId: acme } as any,
      defaultOrg
    );
    expect(moved.organizationId).toBe(defaultOrg);
    expect(await storage.getTemplate(a2, acme)).toBeUndefined();
  });

  it('creates a template in the organization it is created for', async () => {
    const created = await storage.createTemplate(
      { title: 'New', content: 'c', author: 'x', organizationId: defaultOrg } as any,
      acme
    );
    expect(created.organizationId).toBe(acme);
    expect(await storage.getTemplate(created.id, defaultOrg)).toBeUndefined();
    expect(await storage.deleteTemplate(created.id, acme)).toBe(true);
  });
});

describe('0023 down migration', () => {
  it('refuses while templates of two organizations exist, and changes nothing', async () => {
    const before = await shape(scoped, SCHEMA);
    await expect(scoped.query(DOWN)).rejects.toThrow(/refusing to merge tenants/);
    expect(await shape(scoped, SCHEMA)).toEqual(before);
  });

  it('still refuses with two organizations where only one owns templates', async () => {
    await scoped.query(`DELETE FROM templates WHERE organization_id <> $1`, [defaultOrg]);
    const owners = await scoped.query(`SELECT DISTINCT organization_id FROM templates`);
    expect(owners.rows).toEqual([{ organization_id: defaultOrg }]);
    const before = await shape(scoped, SCHEMA);
    await expect(scoped.query(DOWN)).rejects.toThrow(/refusing to merge tenants/);
    expect(await shape(scoped, SCHEMA)).toEqual(before);
  });

  it('removes only the column, index and key with exactly one organization', async () => {
    await scoped.query(`DELETE FROM organizations WHERE id <> $1`, [defaultOrg]);
    expect((await scoped.query(`SELECT count(*)::int AS n FROM organizations`)).rows[0].n).toBe(1);
    const rowsBefore = await legacyRows(scoped);
    await scoped.query(DOWN);
    const after = await shape(scoped, SCHEMA);

    expect(after.columns.map((c: any) => c.column_name)).not.toContain('organization_id');
    expect(after.constraints.map((c: any) => c.conname)).not.toContain(
      'templates_organization_id_organizations_id_fk'
    );
    expect(after.indexes.map((i: any) => i.indexname)).not.toContain(
      'idx_templates_organization_id'
    );
    expect(await legacyRows(scoped)).toEqual(rowsBefore);

    // Running it again is a no-op, and 0023 applies once more.
    await scoped.query(DOWN);
    await scoped.query(UP);
    const { rows } = await scoped.query(`SELECT DISTINCT organization_id FROM templates`);
    expect(rows).toEqual([{ organization_id: defaultOrg }]);
  });
});
