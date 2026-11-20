/**
 * Layer 4: migration 0027 (WP0b), the page creator column, against real Postgres.
 *
 * - The backfill claims a creator only where one was recorded at creation: a page with exactly
 *   one user grant whose granter is the grantee (any level), written within five seconds after
 *   the page, for an account that exists. Every other page keeps null.
 * - Idempotent: a re-run changes nothing, and a value or a null set after the first run stays.
 *   A table that already has the column (a schema push made it) is left alone.
 * - Names match what `drizzle-kit push` creates.
 * - The down file refuses while a page records a creator that applying 0027 again would not
 *   compute, and otherwise drops the column; applying 0027 afterwards restores the same values.
 *
 * Each case builds its tables in the schema, in the shape before 0027.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_wp0b_migration';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const file = (name: string) =>
  readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), 'utf8');
const UP = file('0027_add_page_creator.sql');
const DOWN = file('0027_add_page_creator.down.sql');

let admin: Pool;
let scoped: Pool;
const notices: string[] = [];

const USERS = `
  CREATE TABLE users (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
  );
`;
const PAGES = `
  CREATE TABLE wiki_pages (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
    author TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;
// page_permissions.granted_by is deliberately not a foreign key here, so an orphaned grantee
// (an account removed some other way) can be built.
const GRANTS = `
  CREATE TABLE page_permissions (
    id SERIAL PRIMARY KEY, page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, entity_id INTEGER, permission TEXT NOT NULL, granted_by INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

async function freshTables(tables = [USERS, PAGES, GRANTS]) {
  await scoped.query(
    `DROP TABLE IF EXISTS page_permissions, wiki_pages, users CASCADE; ${tables.join('\n')}`
  );
}

let pageCounter = 0;
const AT = '2026-03-01 10:00:00';

async function user(): Promise<number> {
  pageCounter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO users (name, email) VALUES ($1, $1) RETURNING id`,
    [`u${pageCounter}@example.com`]
  );
  return Number(rows[0].id);
}

async function page(): Promise<number> {
  pageCounter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, created_at)
     VALUES ('t', $1, '', 'someone', $2) RETURNING id`,
    [`p${pageCounter}`, AT]
  );
  return Number(rows[0].id);
}

async function grant(
  pageId: number,
  options: {
    entityId: number | null;
    grantedBy?: number | null;
    level?: string;
    type?: string;
    offset?: string;
  }
) {
  await scoped.query(
    `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission, granted_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamp + $7::interval)`,
    [
      pageId,
      options.type ?? 'user',
      options.entityId,
      options.level ?? 'owner',
      options.grantedBy === undefined ? options.entityId : options.grantedBy,
      AT,
      options.offset ?? '0 seconds',
    ]
  );
}

const creatorOf = async (pageId: number): Promise<number | null> =>
  (await scoped.query(`SELECT created_by_user_id AS c FROM wiki_pages WHERE id = $1`, [pageId]))
    .rows[0].c;

const creators = async (): Promise<Record<number, number | null>> =>
  Object.fromEntries(
    (await scoped.query(`SELECT id, created_by_user_id AS c FROM wiki_pages ORDER BY id`)).rows.map(
      (r: any) => [r.id, r.c]
    )
  );

const hasColumn = async (): Promise<boolean> =>
  (
    await scoped.query(
      `SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('wiki_pages')
          AND attname = 'created_by_user_id' AND NOT attisdropped`
    )
  ).rows.length > 0;

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl, max: 1 });
  scoped.on('connect', (client) => {
    client.on('notice', (message) => notices.push(message.message));
  });
});

afterAll(async () => {
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

beforeEach(async () => {
  notices.length = 0;
  await freshTables();
});

describe('0027 backfill', () => {
  it('sets the creator of a page with one self-grant written at the same moment', async () => {
    const [u, p] = [await user(), await page()];
    await grant(p, { entityId: u });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBe(u);
  });

  it('sets it for a grant written 3 seconds later, and not for one 10 seconds later', async () => {
    const [u, near, far] = [await user(), await page(), await page()];
    await grant(near, { entityId: u, offset: '3 seconds' });
    await grant(far, { entityId: u, offset: '10 seconds' });
    await scoped.query(UP);
    expect(await creatorOf(near)).toBe(u);
    expect(await creatorOf(far)).toBeNull();
  });

  it('does not set it for a grant older than the page', async () => {
    const [u, p] = [await user(), await page()];
    await grant(p, { entityId: u, offset: '-1 seconds' });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
  });

  it('accepts any level for the self-grant (a later change of level does not hide the creator)', async () => {
    const [u, viewer, editor] = [await user(), await page(), await page()];
    await grant(viewer, { entityId: u, level: 'viewer' });
    await grant(editor, { entityId: u, level: 'editor' });
    await scoped.query(UP);
    expect(await creatorOf(viewer)).toBe(u);
    expect(await creatorOf(editor)).toBe(u);
  });

  it('leaves a page with two self-grants without a creator', async () => {
    const [a, b, p] = [await user(), await user(), await page()];
    await grant(p, { entityId: a });
    await grant(p, { entityId: b });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
  });

  it('leaves a page whose only user grant was written by someone else without a creator', async () => {
    const [a, b, p] = [await user(), await user(), await page()];
    await grant(p, { entityId: a, grantedBy: b });
    await grant(p, { entityId: b, grantedBy: null });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
  });

  it('leaves a page with no grant, and a page with only a team or public grant, without a creator', async () => {
    const [u, none, team, open] = [await user(), await page(), await page(), await page()];
    await grant(team, { entityId: u, type: 'team' });
    await grant(open, { entityId: null, type: 'public', grantedBy: u });
    await scoped.query(UP);
    expect(await creatorOf(none)).toBeNull();
    expect(await creatorOf(team)).toBeNull();
    expect(await creatorOf(open)).toBeNull();
  });

  it('ignores grants to others and team grants next to the one self-grant (a shared or team page)', async () => {
    const [creator, other, p] = [await user(), await user(), await page()];
    await grant(p, { entityId: creator });
    await grant(p, { entityId: other, grantedBy: creator, level: 'owner', offset: '1 day' });
    await grant(p, { entityId: 7, type: 'team', grantedBy: creator, level: 'editor' });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBe(creator);
  });

  it('leaves a page whose granted account no longer exists without a creator', async () => {
    const p = await page();
    await grant(p, { entityId: 987654 });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
  });

  it('reports how many pages were set and how many stay empty', async () => {
    const [u, set, unset] = [await user(), await page(), await page()];
    await grant(set, { entityId: u });
    expect(unset).toBeGreaterThan(0);
    await scoped.query(UP);
    expect(notices.join('\n')).toMatch(/0027: 1 page\(s\) got a creator, 1 page\(s\) have none/);
  });
});

describe('0027 is idempotent and leaves a table alone that has the column', () => {
  it('a re-run changes nothing, and a creator set or cleared afterwards stays', async () => {
    const [a, b, set, cleared, unset] = [
      await user(),
      await user(),
      await page(),
      await page(),
      await page(),
    ];
    await grant(set, { entityId: a });
    await grant(cleared, { entityId: a });
    await scoped.query(UP);
    const first = await creators();
    expect(first).toEqual({ [set]: a, [cleared]: a, [unset]: null });

    await scoped.query(UP);
    expect(await creators()).toEqual(first);

    await scoped.query(`UPDATE wiki_pages SET created_by_user_id = $1 WHERE id = $2`, [b, unset]);
    await scoped.query(`UPDATE wiki_pages SET created_by_user_id = NULL WHERE id = $1`, [cleared]);
    await scoped.query(UP);
    expect(await creators()).toEqual({ [set]: a, [cleared]: null, [unset]: b });
  });

  it('does nothing to a table a push created with the column', async () => {
    const [u, p] = [await user(), await page()];
    await grant(p, { entityId: u });
    await scoped.query(`
      ALTER TABLE wiki_pages ADD COLUMN created_by_user_id integer;
      ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_created_by_user_id_users_id_fk
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX idx_wiki_pages_created_by_user_id ON wiki_pages (created_by_user_id);
    `);
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
    expect(notices.join('\n')).not.toMatch(/0027:/);
  });

  it('does nothing without a wiki_pages table', async () => {
    await scoped.query(`DROP TABLE page_permissions, wiki_pages`);
    await scoped.query(UP);
    expect((await scoped.query(`SELECT to_regclass('wiki_pages') AS t`)).rows[0].t).toBeNull();
  });

  it('adds the column without a backfill when there is no page_permissions table', async () => {
    const p = await page();
    await scoped.query(`DROP TABLE page_permissions`);
    await scoped.query(UP);
    expect(await hasColumn()).toBe(true);
    expect(await creatorOf(p)).toBeNull();
  });
});

describe('0027 names', () => {
  it('uses the column, key and index names drizzle-kit push uses, with set null on delete', async () => {
    await scoped.query(UP);
    const { rows: columns } = await scoped.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'wiki_pages' AND column_name = 'created_by_user_id'`,
      [SCHEMA]
    );
    expect(columns).toEqual([{ data_type: 'integer', is_nullable: 'YES', column_default: null }]);
    const { rows: keys } = await scoped.query(
      `SELECT conname, confdeltype, confrelid::regclass::text AS target FROM pg_constraint
        WHERE conrelid = 'wiki_pages'::regclass AND contype = 'f'`
    );
    expect(keys).toEqual([
      {
        conname: 'wiki_pages_created_by_user_id_users_id_fk',
        confdeltype: 'n',
        target: 'users',
      },
    ]);
    const { rows: indexes } = await scoped.query(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = $1 AND tablename = 'wiki_pages' AND indexname LIKE '%created_by%'`,
      [SCHEMA]
    );
    expect(indexes.map((r: any) => r.indexname)).toEqual(['idx_wiki_pages_created_by_user_id']);
    expect(indexes[0].indexdef).toMatch(/\(created_by_user_id\)/);
  });
});

describe('0027 down', () => {
  it('refuses, changing nothing, while a page records a creator whose grant is gone', async () => {
    const [u, p] = [await user(), await page()];
    await grant(p, { entityId: u });
    await scoped.query(UP);
    await scoped.query(`DELETE FROM page_permissions WHERE page_id = $1`, [p]);

    await expect(scoped.query(DOWN)).rejects.toThrow(/a page records a creator/);
    expect(await hasColumn()).toBe(true);
    expect(await creatorOf(p)).toBe(u);
  });

  it('refuses while a page records a creator the grants point away from', async () => {
    const [a, b, p] = [await user(), await user(), await page()];
    await grant(p, { entityId: a });
    await scoped.query(UP);
    await scoped.query(`UPDATE wiki_pages SET created_by_user_id = $1 WHERE id = $2`, [b, p]);

    await expect(scoped.query(DOWN)).rejects.toThrow(/a page records a creator/);
    expect(await creatorOf(p)).toBe(b);
  });

  it('drops the index, key and column when every creator is the one the up file computes', async () => {
    const [u, withCreator, without] = [await user(), await page(), await page()];
    await grant(withCreator, { entityId: u });
    await scoped.query(UP);
    const before = await creators();

    await scoped.query(DOWN);
    expect(await hasColumn()).toBe(false);
    expect(
      (
        await scoped.query(
          `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_wiki_pages_created_by_user_id'`
        )
      ).rows
    ).toHaveLength(0);

    await scoped.query(UP);
    expect(await creators()).toEqual(before);
    expect(before).toEqual({ [withCreator]: u, [without]: null });
  });

  it('does nothing when the column or the table is missing', async () => {
    await scoped.query(DOWN);
    await scoped.query(`DROP TABLE page_permissions, wiki_pages`);
    await scoped.query(DOWN);
  });
});
