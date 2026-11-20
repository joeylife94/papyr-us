/**
 * Layer 4: migration 0027 (WP0b), the page creator column, against real Postgres.
 *
 * - The backfill claims a creator only where one was recorded at creation: a page with exactly
 *   one user grant whose granter is the grantee (any level), written within five seconds after
 *   the page, for an account that exists and whose email or name is the page's author text (and
 *   never for the author 'Automation'). Every other page keeps null.
 * - It runs on every application and touches only pages whose creator is null: a re-run changes
 *   nothing, a creator set by hand or by the application is never overwritten, and a table that
 *   a schema push made (the column exists, empty) is filled exactly as prepare-first fills it.
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

const emailOf = new Map<number, string>();
const nameOf = new Map<number, string>();

/** An account whose name is its email unless a name is given. */
async function user(name?: string): Promise<number> {
  pageCounter += 1;
  const email = `u${pageCounter}@example.com`;
  const { rows } = await scoped.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    [name ?? email, email]
  );
  const id = Number(rows[0].id);
  emailOf.set(id, email);
  nameOf.set(id, name ?? email);
  return id;
}

/** A page whose author text is the email of account `author` (a number) or the given text. */
async function page(author: number | string = 'someone'): Promise<number> {
  pageCounter += 1;
  const text = typeof author === 'number' ? emailOf.get(author)! : author;
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, created_at)
     VALUES ('t', $1, '', $2, $3) RETURNING id`,
    [`p${pageCounter}`, text, AT]
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
    const u = await user();
    const p = await page(u);
    await grant(p, { entityId: u });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBe(u);
  });

  it('sets it for a grant written 3 seconds later, and not for one 10 seconds later', async () => {
    const u = await user();
    const [near, far] = [await page(u), await page(u)];
    await grant(near, { entityId: u, offset: '3 seconds' });
    await grant(far, { entityId: u, offset: '10 seconds' });
    await scoped.query(UP);
    expect(await creatorOf(near)).toBe(u);
    expect(await creatorOf(far)).toBeNull();
  });

  it('does not set it for a grant older than the page', async () => {
    const u = await user();
    const p = await page(u);
    await grant(p, { entityId: u, offset: '-1 seconds' });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
  });

  it('accepts any level for the self-grant (a later change of level does not hide the creator)', async () => {
    const u = await user();
    const [viewer, editor] = [await page(u), await page(u)];
    await grant(viewer, { entityId: u, level: 'viewer' });
    await grant(editor, { entityId: u, level: 'editor' });
    await scoped.query(UP);
    expect(await creatorOf(viewer)).toBe(u);
    expect(await creatorOf(editor)).toBe(u);
  });

  it('leaves a page with two self-grants without a creator', async () => {
    const [a, b] = [await user(), await user()];
    const p = await page(a);
    await grant(p, { entityId: a });
    await grant(p, { entityId: b });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
  });

  it('leaves a page whose only user grant was written by someone else without a creator', async () => {
    const [a, b] = [await user(), await user()];
    const p = await page(a);
    await grant(p, { entityId: a, grantedBy: b });
    await grant(p, { entityId: b, grantedBy: null });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
  });

  it('leaves a page with no grant, and a page with only a team or public grant, without a creator', async () => {
    const u = await user();
    const [none, team, open] = [await page(u), await page(u), await page(u)];
    await grant(team, { entityId: u, type: 'team' });
    await grant(open, { entityId: null, type: 'public', grantedBy: u });
    await scoped.query(UP);
    expect(await creatorOf(none)).toBeNull();
    expect(await creatorOf(team)).toBeNull();
    expect(await creatorOf(open)).toBeNull();
  });

  it('ignores grants to others and team grants next to the one self-grant (a shared or team page)', async () => {
    const [creator, other] = [await user(), await user()];
    const p = await page(creator);
    await grant(p, { entityId: creator });
    await grant(p, { entityId: other, grantedBy: creator, level: 'owner', offset: '1 day' });
    await grant(p, { entityId: 7, type: 'team', grantedBy: creator, level: 'editor' });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBe(creator);
  });

  it('leaves a page whose granted account no longer exists without a creator', async () => {
    const p = await page('u987654@example.com');
    await grant(p, { entityId: 987654 });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
  });

  it('reports how many pages were set and how many stay empty', async () => {
    const u = await user();
    const [set] = [await page(u), await page(u)];
    await grant(set, { entityId: u });
    await scoped.query(UP);
    expect(notices.join('\n')).toMatch(/0027: 1 page\(s\) got a creator, 1 page\(s\) have none/);
  });

  it('raises no notice when no page got a creator', async () => {
    await page();
    await scoped.query(UP);
    expect(notices.join('\n')).not.toMatch(/0027:/);
  });

  it('accepts the account name as the author text, and an email in any page of the account', async () => {
    const u = await user('Ada Lovelace');
    const byName = await page('Ada Lovelace');
    await grant(byName, { entityId: u });
    await scoped.query(UP);
    expect(await creatorOf(byName)).toBe(u);
  });

  it("leaves a page whose author text is not the grantee's email or name without a creator", async () => {
    const [grantee, other] = [await user('Ada Lovelace'), await user('Grace Hopper')];
    // Another owner of an anonymous page self-granting inside the window (no session, no grant).
    const anonymous = await page('Anonymous');
    await grant(anonymous, { entityId: grantee, offset: '2 seconds' });
    // The creator's own grant is missing; a different account self-grants 4 seconds later.
    const missing = await page(other);
    await grant(missing, { entityId: grantee, offset: '4 seconds' });
    // A renamed account: the author text is the old name.
    const renamed = await page('Ada Old Name');
    await grant(renamed, { entityId: grantee });
    await scoped.query(UP);
    expect(await creatorOf(anonymous)).toBeNull();
    expect(await creatorOf(missing)).toBeNull();
    expect(await creatorOf(renamed)).toBeNull();
  });

  it('never names an account for the automation label, whatever an account is called', async () => {
    const u = await user('Automation');
    const p = await page('Automation');
    await grant(p, { entityId: u });
    await scoped.query(UP);
    expect(await creatorOf(p)).toBeNull();
  });
});

const PUSH_SHAPE = `
  ALTER TABLE wiki_pages ADD COLUMN created_by_user_id integer;
  ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_created_by_user_id_users_id_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  CREATE INDEX idx_wiki_pages_created_by_user_id ON wiki_pages (created_by_user_id);
`;

describe('0027 runs on every application and touches only pages without a creator', () => {
  it('a second and third run change nothing, and never overwrite a creator', async () => {
    const [a, b] = [await user(), await user()];
    const [set, handSet, unset] = [await page(a), await page(a), await page('someone')];
    await grant(set, { entityId: a });
    await grant(handSet, { entityId: a });
    await scoped.query(UP);
    const first = await creators();
    expect(first).toEqual({ [set]: a, [handSet]: a, [unset]: null });

    await scoped.query(UP);
    await scoped.query(UP);
    expect(await creators()).toEqual(first);
    expect(notices.filter((n) => /0027:/.test(n))).toHaveLength(1);

    // A creator set by hand or by the application is never overwritten.
    await scoped.query(`UPDATE wiki_pages SET created_by_user_id = $1 WHERE id = $2`, [b, handSet]);
    await scoped.query(`UPDATE wiki_pages SET created_by_user_id = $1 WHERE id = $2`, [b, unset]);
    await scoped.query(UP);
    expect(await creators()).toEqual({ [set]: a, [handSet]: b, [unset]: b });
  });

  it('fills again a creator cleared by hand on a page that still satisfies the conditions', async () => {
    const a = await user();
    const p = await page(a);
    await grant(p, { entityId: a });
    await scoped.query(UP);
    await scoped.query(`UPDATE wiki_pages SET created_by_user_id = NULL WHERE id = $1`, [p]);
    await scoped.query(UP);
    expect(await creatorOf(p)).toBe(a);
  });

  it('push first, then prepare, fills exactly what prepare first fills', async () => {
    const a = await user();
    const [good, anonymous] = [await page(a), await page('Anonymous')];
    await grant(good, { entityId: a });
    await grant(anonymous, { entityId: a, offset: '2 seconds' });
    // Prepare first.
    await scoped.query(UP);
    const prepareFirst = await creators();

    // Push first: the same data, a column that exists and is empty.
    await freshTables();
    const b = await user();
    const [good2, anonymous2] = [await page(b), await page('Anonymous')];
    await grant(good2, { entityId: b });
    await grant(anonymous2, { entityId: b, offset: '2 seconds' });
    await scoped.query(PUSH_SHAPE);
    expect(await creators()).toEqual({ [good2]: null, [anonymous2]: null });
    await scoped.query(UP);
    const pushFirst = await creators();

    expect(Object.values(prepareFirst)).toEqual([a, null]);
    expect(Object.values(pushFirst)).toEqual([b, null]);
    expect(notices.filter((n) => /0027: 1 page\(s\) got a creator/.test(n)).length).toBe(2);
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
    const u = await user();
    const p = await page(u);
    await grant(p, { entityId: u });
    await scoped.query(UP);
    await scoped.query(`DELETE FROM page_permissions WHERE page_id = $1`, [p]);

    await expect(scoped.query(DOWN)).rejects.toThrow(/a page records a creator/);
    expect(await hasColumn()).toBe(true);
    expect(await creatorOf(p)).toBe(u);
  });

  it('refuses while a page records a creator the grants point away from', async () => {
    const [a, b] = [await user(), await user()];
    const p = await page(a);
    await grant(p, { entityId: a });
    await scoped.query(UP);
    await scoped.query(`UPDATE wiki_pages SET created_by_user_id = $1 WHERE id = $2`, [b, p]);

    await expect(scoped.query(DOWN)).rejects.toThrow(/a page records a creator/);
    expect(await creatorOf(p)).toBe(b);
  });

  it('refuses while a page records a creator its author text no longer names (a renamed account)', async () => {
    const u = await user('Ada Lovelace');
    const p = await page('Ada Lovelace');
    await grant(p, { entityId: u });
    await scoped.query(UP);
    await scoped.query(`UPDATE users SET name = 'Ada King' WHERE id = $1`, [u]);

    await expect(scoped.query(DOWN)).rejects.toThrow(/a page records a creator/);
    expect(await hasColumn()).toBe(true);
    expect(await creatorOf(p)).toBe(u);
  });

  it('refuses while a page with the automation author records a creator', async () => {
    const u = await user('Automation');
    const p = await page('Automation');
    await grant(p, { entityId: u });
    await scoped.query(PUSH_SHAPE);
    await scoped.query(`UPDATE wiki_pages SET created_by_user_id = $1 WHERE id = $2`, [u, p]);

    await expect(scoped.query(DOWN)).rejects.toThrow(/a page records a creator/);
  });

  it('drops the index, key and column when every creator is the one the up file computes', async () => {
    const u = await user();
    const [withCreator, without] = [await page(u), await page('someone')];
    await grant(withCreator, { entityId: u });
    await scoped.query(UP);
    const before = await creators();

    await scoped.query(DOWN);
    expect(await hasColumn()).toBe(false);
    expect(
      (
        await scoped.query(
          `SELECT 1 FROM pg_indexes
            WHERE schemaname = $1 AND indexname = 'idx_wiki_pages_created_by_user_id'`,
          [SCHEMA]
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
