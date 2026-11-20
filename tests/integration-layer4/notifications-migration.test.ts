/**
 * Layer 4: drizzle/0026_notifications_to_accounts.sql and its down file against real Postgres
 * (WP0a), on a schema in the shape before the migration (notifications addressed to roster rows).
 *
 * Up, for every kind of existing row:
 *   - roster email = an account in an organization, roster row without a team or in a team of that
 *     organization: assigned to that account in that organization;
 *   - roster email with no account (also when only the letter case differs): held no_account;
 *   - account without an organization: held account_without_organization;
 *   - roster row in a team of another organization than the account's: held other_organization;
 *   - a held row is removed from notifications and kept verbatim in the archive, never given to
 *     anyone, also not to an account created later;
 *   - sender: the account with the sender row's email when it is in the notification's
 *     organization, else null plus a sender_unmapped archive row;
 *   - ids, is_read, timestamps and related ids of assigned rows are unchanged;
 *   - the counts are printed (RAISE NOTICE);
 *   - re-running changes nothing; a push-shaped table, no table, and a table with both columns
 *     (refused, nothing changed) are handled;
 *   - constraint and index names are the ones drizzle-kit push generates.
 * Down: refuses (changing nothing) for each reason in the file, and otherwise restores every
 * original row and column value, after which the up migration applies again.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg, { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_wp0a_migration';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();
const UP = readFileSync(
  new URL('../../drizzle/0026_notifications_to_accounts.sql', import.meta.url),
  'utf8'
);
const DOWN = readFileSync(
  new URL('../../drizzle/0026_notifications_to_accounts.down.sql', import.meta.url),
  'utf8'
);

let admin: Pool;
let scoped: Pool;
let defaultId: number;
let acmeId: number;
let teamDefault: number;
let teamAcme: number;

// Accounts, by id. In the default organization: A, B, S, Z. In Acme: D, D2, S2. C belongs to none.
const A = 1;
const B = 2;
const C = 3;
const D = 4;
const D2 = 5;
const S = 6;
const S2 = 7;
const Z = 8;
// Roster rows, by id.
const R = { a: 11, b: 12, c: 13, d: 14, d2: 15, nobody: 16, s: 17, s2: 18, noAccount: 19, zed: 20 };

const emailOf = (key: string) => `${key}@example.com`;

/** Runs a migration file, returning the notices it printed. */
async function run(sql: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: scopedUrl });
  const notices: string[] = [];
  client.on('notice', (n) => notices.push(n.message));
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
  return notices;
}
const q = async (text: string, params: unknown[] = []) => (await scoped.query(text, params)).rows;

const OLD_COLUMNS = `id, type, title, content, recipient_id, sender_id, related_page_id,
  related_task_id, related_comment_id, is_read, created_at`;

/** The schema as a deployment before 0026 has it, with one notification of every kind. */
async function buildBefore() {
  await scoped.query(`
    DROP TABLE IF EXISTS notifications CASCADE;
    DROP TABLE IF EXISTS notification_roster_archive CASCADE;
    CREATE TABLE notifications (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
      recipient_id INTEGER NOT NULL,
      sender_id INTEGER,
      related_page_id INTEGER, related_task_id INTEGER, related_comment_id INTEGER,
      is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT notifications_recipient_id_members_id_fk FOREIGN KEY (recipient_id)
        REFERENCES members(id) ON DELETE CASCADE,
      CONSTRAINT notifications_sender_id_members_id_fk FOREIGN KEY (sender_id)
        REFERENCES members(id) ON DELETE SET NULL,
      CONSTRAINT notifications_related_page_id_wiki_pages_id_fk FOREIGN KEY (related_page_id)
        REFERENCES wiki_pages(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);
    CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_id, is_read, created_at DESC);
  `);
  await scoped.query(
    `DELETE FROM members; DELETE FROM users; DELETE FROM wiki_pages; DELETE FROM tasks; DELETE FROM comments;
     INSERT INTO tasks (id) VALUES (5), (6), (7); INSERT INTO comments (id) VALUES (5), (6), (7);`
  );
  const users: Array<[number, string]> = [
    [A, 'a'],
    [B, 'b'],
    [C, 'c'],
    [D, 'd'],
    [D2, 'd2'],
    [S, 's'],
    [S2, 's2'],
    [Z, 'zed'],
  ];
  for (const [id, key] of users) {
    // the fixture's trigger is not installed on this schema's users inserts after the first
    // addOrganizations call: memberships are set explicitly below
    await scoped.query(`INSERT INTO users (id, name, email) VALUES ($1, $2, $3)`, [
      id,
      key,
      emailOf(key),
    ]);
  }
  await scoped.query(`DELETE FROM organization_members`);
  for (const [id, org] of [
    [A, defaultId],
    [B, defaultId],
    [S, defaultId],
    [Z, defaultId],
    [D, acmeId],
    [D2, acmeId],
    [S2, acmeId],
  ]) {
    await scoped.query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'member')`,
      [org, id]
    );
  }
  // Roster rows. The letter case of 'Zed' differs from the account 'zed@example.com'.
  const roster: Array<[number, string, number | null]> = [
    [R.a, emailOf('a'), null], // no team
    [R.b, emailOf('b'), teamDefault], // team of the account's organization
    [R.c, emailOf('c'), null], // account without an organization
    [R.d, emailOf('d'), teamDefault], // team in the default organization, account in Acme
    [R.d2, emailOf('d2'), teamAcme], // account and team in Acme
    [R.nobody, 'nobody@example.com', teamDefault], // no account
    [R.s, emailOf('s'), null],
    [R.s2, emailOf('s2'), null],
    [R.noAccount, 'sender-without-account@example.com', null],
    [R.zed, 'Zed@example.com', null], // differs from the account only in case
  ];
  for (const [id, email, team] of roster) {
    await scoped.query(
      `INSERT INTO members (id, name, email, role, team_id) VALUES ($1, $2, $2, 'dev', $3)`,
      [id, email, team]
    );
  }
  await scoped.query(
    `INSERT INTO wiki_pages (id, title, slug, content, author, organization_id) VALUES (1, 'P', 'p', '', 'x', $1)`,
    [defaultId]
  );
  type Row = [number, string, number, number | null, boolean, string, number | null, number | null];
  const rows: Row[] = [
    // id, title, recipient, sender, is_read, created_at, related page, related task
    [101, 'assigned, sender maps', R.a, R.s, true, '2024-01-01 10:00:00', 1, 5],
    [
      102,
      'assigned, sender in another organization',
      R.b,
      R.s2,
      false,
      '2024-01-02 10:00:00',
      null,
      null,
    ],
    [
      103,
      'assigned, sender without account',
      R.a,
      R.noAccount,
      false,
      '2024-01-03 10:00:00',
      null,
      null,
    ],
    [104, 'assigned, no sender', R.a, null, true, '2024-01-04 10:00:00', null, 6],
    [105, 'held other_organization', R.d, R.s, false, '2024-01-05 10:00:00', 1, 7],
    [106, 'held no_account', R.nobody, null, true, '2024-01-06 10:00:00', null, null],
    [107, 'held account_without_organization', R.c, R.s, false, '2024-01-07 10:00:00', null, null],
    [108, 'assigned in Acme, sender maps', R.d2, R.s2, false, '2024-01-08 10:00:00', null, null],
    [109, 'held, differs by letter case', R.zed, null, false, '2024-01-09 10:00:00', null, null],
  ];
  for (const [id, title, recipient, sender, isRead, createdAt, page, task] of rows) {
    await scoped.query(
      `INSERT INTO notifications (id, type, title, content, recipient_id, sender_id, is_read, created_at,
                                  related_page_id, related_task_id, related_comment_id)
       VALUES ($1, 'mention', $2, $2 || ' body', $3, $4, $5, $6, $7, $8, $8)`,
      [id, title, recipient, sender, isRead, createdAt, page, task]
    );
  }
  await scoped.query(
    `SELECT setval(pg_get_serial_sequence('notifications', 'id'), (SELECT max(id) FROM notifications))`
  );
}

const dumpOld = () => q(`SELECT ${OLD_COLUMNS} FROM notifications ORDER BY id`);
const dumpNew = () =>
  q(`SELECT * FROM notifications ORDER BY id`).then(async (notifications) => ({
    notifications,
    archive: (await q(`SELECT to_regclass('notification_roster_archive') AS t`))[0].t
      ? await q(
          `SELECT notification_id, reason, recipient_member_id, sender_member_id, type, title, content,
                  related_page_id, related_task_id, related_comment_id, is_read, created_at
             FROM notification_roster_archive ORDER BY notification_id`
        )
      : null,
  }));

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
    CREATE TABLE wiki_pages (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
      blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs',
      tags TEXT[] NOT NULL DEFAULT '{}', author TEXT NOT NULL, parent_id INTEGER,
      position INTEGER, icon TEXT, team_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE, metadata JSONB DEFAULT '{}',
      deleted_at TIMESTAMP
    );
    CREATE TABLE tasks (id SERIAL PRIMARY KEY);
    CREATE TABLE comments (id SERIAL PRIMARY KEY, page_id INTEGER, author_user_id INTEGER);
  `);
  // 0022-0025 through the fixture (no notifications table yet, so 0026 is a no-op there)
  defaultId = await addOrganizations(scoped, undefined, { teams: [] });
  acmeId = Number(
    (await q(`INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`))[0].id
  );
  teamDefault = Number(
    (
      await q(
        `INSERT INTO teams (name, display_name, organization_id) VALUES ('t-default', 't', $1) RETURNING id`,
        [defaultId]
      )
    )[0].id
  );
  teamAcme = Number(
    (
      await q(
        `INSERT INTO teams (name, display_name, organization_id) VALUES ('t-acme', 't', $1) RETURNING id`,
        [acmeId]
      )
    )[0].id
  );
  await scoped.query(`DROP TRIGGER IF EXISTS l4_join_default_organization ON users`);
});

afterAll(async () => {
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

const titlesOf = (rows: Array<{ title: string }>) => rows.map((r) => r.title);

describe('0026 up, on one notification of every kind', () => {
  let before: any[];
  let notices: string[];
  let after: Awaited<ReturnType<typeof dumpNew>>;

  beforeAll(async () => {
    await buildBefore();
    before = await dumpOld();
    notices = await run(UP);
    after = await dumpNew();
  });

  it('assigns the rows whose roster email is an account, in the account organization', () => {
    const byId = (id: number) => after.notifications.find((n: any) => n.id === id);
    expect(after.notifications.map((n: any) => n.id)).toEqual([101, 102, 103, 104, 108]);
    expect(byId(101)).toMatchObject({ recipient_user_id: A, organization_id: defaultId });
    expect(byId(102)).toMatchObject({ recipient_user_id: B, organization_id: defaultId });
    expect(byId(103)).toMatchObject({ recipient_user_id: A, organization_id: defaultId });
    expect(byId(104)).toMatchObject({ recipient_user_id: A, organization_id: defaultId });
    expect(byId(108)).toMatchObject({ recipient_user_id: D2, organization_id: acmeId });
  });

  it('keeps ids, content, is_read, timestamps and related ids of assigned rows', () => {
    for (const row of after.notifications as any[]) {
      const original = before.find((b) => b.id === row.id);
      expect({
        id: row.id,
        type: row.type,
        title: row.title,
        content: row.content,
        is_read: row.is_read,
        created_at: row.created_at,
        related_page_id: row.related_page_id,
        related_task_id: row.related_task_id,
        related_comment_id: row.related_comment_id,
      }).toEqual({
        id: original.id,
        type: original.type,
        title: original.title,
        content: original.content,
        is_read: original.is_read,
        created_at: original.created_at,
        related_page_id: original.related_page_id,
        related_task_id: original.related_task_id,
        related_comment_id: original.related_comment_id,
      });
    }
  });

  it('maps a sender only when its account is in the notification organization', () => {
    const sender = (id: number) =>
      (after.notifications.find((n: any) => n.id === id) as any).sender_user_id;
    expect(sender(101)).toBe(S);
    expect(sender(102)).toBeNull(); // the sender account is in Acme, the row in the default organization
    expect(sender(103)).toBeNull(); // the sender roster row has no account
    expect(sender(104)).toBeNull(); // no sender
    expect(sender(108)).toBe(S2);
  });

  it('holds every other row verbatim in the archive, with its reason, and removes it from notifications', () => {
    const held = (after.archive as any[]).filter((a) => a.reason !== 'sender_unmapped');
    expect(held.map((a) => [a.notification_id, a.reason])).toEqual([
      [105, 'other_organization'],
      [106, 'no_account'],
      [107, 'account_without_organization'],
      [109, 'no_account'],
    ]);
    for (const row of held) {
      const original = before.find((b) => b.id === row.notification_id);
      expect(row).toEqual({
        notification_id: original.id,
        reason: row.reason,
        recipient_member_id: original.recipient_id,
        sender_member_id: original.sender_id,
        type: original.type,
        title: original.title,
        content: original.content,
        related_page_id: original.related_page_id,
        related_task_id: original.related_task_id,
        related_comment_id: original.related_comment_id,
        is_read: original.is_read,
        created_at: original.created_at,
      });
    }
    expect(titlesOf(after.notifications as any[])).not.toContain('held no_account');
  });

  it('archives a sender that could not be mapped with the roster ids, and no content', () => {
    const unmapped = (after.archive as any[]).filter((a) => a.reason === 'sender_unmapped');
    expect(unmapped).toEqual([
      expect.objectContaining({
        notification_id: 102,
        recipient_member_id: R.b,
        sender_member_id: R.s2,
        type: null,
        title: null,
        content: null,
        is_read: null,
        created_at: null,
      }),
      expect.objectContaining({
        notification_id: 103,
        recipient_member_id: R.a,
        sender_member_id: R.noAccount,
        content: null,
      }),
    ]);
  });

  it('prints how many rows were assigned and held, per reason', () => {
    expect(notices).toEqual([
      expect.stringContaining(
        '5 assigned to accounts; held in notification_roster_archive: 2 no_account, 1 account_without_organization, 1 other_organization, 0 no_roster_row; 2 sender(s) unmapped'
      ),
    ]);
  });

  it('a held row is not given to an account created later', async () => {
    await scoped.query(
      `INSERT INTO users (id, name, email) VALUES (900, 'Nobody', 'nobody@example.com')`
    );
    const { rows } = await scoped.query(
      `SELECT count(*)::int AS n FROM notifications n JOIN users u ON u.id = n.recipient_user_id
        WHERE u.email = 'nobody@example.com'`
    );
    expect(rows[0].n).toBe(0);
    await scoped.query(`DELETE FROM users WHERE email = 'nobody@example.com'`);
  });

  it('drops the roster columns, and leaves the constraint and index names push generates', async () => {
    const columns = (
      await q(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'notifications' ORDER BY ordinal_position`,
        [SCHEMA]
      )
    ).map((r: any) => r.column_name);
    expect(columns).toEqual([
      'id',
      'type',
      'title',
      'content',
      'related_page_id',
      'related_task_id',
      'related_comment_id',
      'is_read',
      'created_at',
      'recipient_user_id',
      'organization_id',
      'sender_user_id',
    ]);
    const constraints = (
      await q(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'notifications'::regclass ORDER BY conname`
      )
    ).map((r: any) => [r.conname, r.def]);
    expect(constraints).toEqual([
      [
        'notifications_organization_id_organizations_id_fk',
        expect.stringContaining('ON DELETE CASCADE'),
      ],
      ['notifications_pkey', 'PRIMARY KEY (id)'],
      ['notifications_recipient_user_id_users_id_fk', expect.stringContaining('ON DELETE CASCADE')],
      [
        'notifications_related_page_id_wiki_pages_id_fk',
        expect.stringContaining('ON DELETE CASCADE'),
      ],
      ['notifications_sender_user_id_users_id_fk', expect.stringContaining('ON DELETE SET NULL')],
    ]);
    const indexes = (
      await q(
        `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'notifications' ORDER BY 1`,
        [SCHEMA]
      )
    ).map((r: any) => r.indexname);
    expect(indexes).toEqual(['idx_notifications_recipient_user', 'notifications_pkey']);
    const notNull = await q(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'notifications' AND is_nullable = 'NO'
          AND column_name IN ('recipient_user_id', 'organization_id', 'sender_user_id')
        ORDER BY 1`,
      [SCHEMA]
    );
    expect(notNull.map((r: any) => r.column_name)).toEqual([
      'organization_id',
      'recipient_user_id',
    ]);
  });

  it('a second run changes nothing and prints nothing', async () => {
    const again = await run(UP);
    expect(again).toEqual([]);
    expect(await dumpNew()).toEqual(after);
  });
});

describe('0026 up, other shapes', () => {
  it('leaves a table that already has the new shape alone', async () => {
    await buildBefore();
    await run(UP);
    const done = await dumpNew();
    expect(await run(UP)).toEqual([]);
    expect(await dumpNew()).toEqual(done);
  });

  it('does nothing without a notifications table, and creates no archive', async () => {
    await scoped.query(
      `DROP TABLE IF EXISTS notifications CASCADE; DROP TABLE IF EXISTS notification_roster_archive CASCADE`
    );
    expect(await run(UP)).toEqual([]);
    expect((await q(`SELECT to_regclass('notification_roster_archive') AS t`))[0].t).toBeNull();
    expect((await q(`SELECT to_regclass('notifications') AS t`))[0].t).toBeNull();
  });

  it('refuses a table that has both the old and the new column, changing nothing', async () => {
    await buildBefore();
    await scoped.query(`ALTER TABLE notifications ADD COLUMN recipient_user_id integer`);
    const before = await q(`SELECT * FROM notifications ORDER BY id`);
    await expect(run(UP)).rejects.toThrow(/both recipient_id and recipient_user_id/);
    expect(await q(`SELECT * FROM notifications ORDER BY id`)).toEqual(before);
    expect((await q(`SELECT to_regclass('notification_roster_archive') AS t`))[0].t).toBeNull();
  });

  it('an empty notifications table is converted, with nothing held', async () => {
    await buildBefore();
    await scoped.query(`DELETE FROM notifications`);
    const notices = await run(UP);
    expect(notices[0]).toContain('0 assigned to accounts');
    expect(await q(`SELECT count(*)::int AS n FROM notification_roster_archive`)).toEqual([
      { n: 0 },
    ]);
    expect(
      await q(
        `SELECT 1 FROM pg_attribute WHERE attrelid = 'notifications'::regclass AND attname = 'recipient_id' AND NOT attisdropped`
      )
    ).toEqual([]);
  });

  it('refuses when the archive already holds a row that is still in notifications', async () => {
    await buildBefore();
    await scoped.query(`
      CREATE TABLE notification_roster_archive (
        notification_id integer PRIMARY KEY, reason text NOT NULL, recipient_member_id integer NOT NULL,
        sender_member_id integer, type text, title text, content text, related_page_id integer,
        related_task_id integer, related_comment_id integer, is_read boolean, created_at timestamp,
        archived_at timestamp NOT NULL DEFAULT now());
      INSERT INTO notification_roster_archive (notification_id, reason, recipient_member_id) VALUES (106, 'no_account', 16);
    `);
    const before = await dumpOld();
    await expect(run(UP)).rejects.toThrow(/already holds a notification/);
    expect(await dumpOld()).toEqual(before);
  });
});

describe('0026, a notification whose roster row no longer exists', () => {
  const ORPHAN = 120;
  /** The pre-0026 shape on a database where the old recipient foreign key was missing. */
  async function buildWithOrphan() {
    await buildBefore();
    await scoped.query(
      `ALTER TABLE notifications DROP CONSTRAINT notifications_recipient_id_members_id_fk`
    );
    await scoped.query(
      `INSERT INTO notifications (id, type, title, content, recipient_id, sender_id, is_read, created_at,
                                  related_page_id, related_task_id, related_comment_id)
       VALUES ($1, 'mention', 'orphan', 'orphan body', 9999, $2, true, '2024-02-01 10:00:00', 1, 5, 5)`,
      [ORPHAN, R.s]
    );
    return dumpOld();
  }

  it('is held with a reason that says so, never assigned, and the deploy goes on', async () => {
    const original = await buildWithOrphan();
    const notices = await run(UP);
    const after = await dumpNew();
    expect((after.notifications as any[]).map((n) => n.id)).not.toContain(ORPHAN);
    const held = (after.archive as any[]).find((a) => a.notification_id === ORPHAN);
    const was = original.find((o: any) => o.id === ORPHAN);
    expect(held).toEqual({
      notification_id: ORPHAN,
      reason: 'no_roster_row',
      recipient_member_id: 9999,
      sender_member_id: R.s,
      type: was.type,
      title: was.title,
      content: was.content,
      related_page_id: was.related_page_id,
      related_task_id: was.related_task_id,
      related_comment_id: was.related_comment_id,
      is_read: was.is_read,
      created_at: was.created_at,
    });
    expect(notices[0]).toContain('1 no_roster_row');
  });

  it('a second run changes nothing', async () => {
    await buildWithOrphan();
    await run(UP);
    const done = await dumpNew();
    expect(await run(UP)).toEqual([]);
    expect(await dumpNew()).toEqual(done);
  });

  it('down restores it byte for byte, and up applies again to the same result', async () => {
    const original = await buildWithOrphan();
    await run(UP);
    const first = await dumpNew();
    await run(DOWN);
    expect(await dumpOld()).toEqual(original);
    await run(UP);
    expect(await dumpNew()).toEqual(first);
  });
});

describe('0026 down', () => {
  /** Up, then the state the down file starts from. */
  async function upState() {
    await buildBefore();
    const original = await dumpOld();
    await run(UP);
    return original;
  }
  const unchanged = async (message: RegExp, damage: () => Promise<unknown>) => {
    await upState();
    await damage();
    const snapshot = await dumpNew();
    await expect(run(DOWN)).rejects.toThrow(message);
    expect(await dumpNew()).toEqual(snapshot);
    expect(
      (
        await q(
          `SELECT 1 FROM pg_attribute WHERE attrelid = 'notifications'::regclass AND attname = 'recipient_user_id' AND NOT attisdropped`
        )
      ).length
    ).toBe(1);
  };

  it('refuses while a notification is addressed to an account without a roster row', () =>
    unchanged(/addressed to an account without a roster row/, () =>
      scoped.query(`DELETE FROM members WHERE id = $1`, [R.b])
    ));

  it('refuses while a notification belongs to an organization its recipient has left', () =>
    unchanged(/an organization its recipient has left/, () =>
      scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
        acmeId,
        A,
      ])
    ));

  it('refuses while a notification has a sender account with no roster row and no archive entry', () =>
    unchanged(/sender has no roster row/, () =>
      scoped.query(`DELETE FROM members WHERE id = $1`, [R.s])
    ));

  it('refuses while a held row refers to a roster row that no longer exists', () =>
    unchanged(/refers to a record that no longer exists/, () =>
      scoped.query(`DELETE FROM members WHERE id = $1`, [R.d])
    ));

  it('refuses while a held row refers to a page that no longer exists', async () => {
    await upState();
    await scoped.query(`DELETE FROM wiki_pages WHERE id = 1`);
    const snapshot = await dumpNew();
    await expect(run(DOWN)).rejects.toThrow(/refers to a record that no longer exists/);
    expect(await dumpNew()).toEqual(snapshot);
  });

  it('refuses while the id of a held row is taken in notifications', () =>
    unchanged(/refers to a record that no longer exists/, () =>
      scoped.query(
        `INSERT INTO notifications (id, type, title, content, recipient_user_id, organization_id)
         VALUES (105, 'x', 'x', 'x', $1, $2)`,
        [A, defaultId]
      )
    ));

  it('restores every original row and column value, and the original constraints', async () => {
    const original = await upState();
    await run(DOWN);
    expect(await dumpOld()).toEqual(original);
    const constraints = (
      await q(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'notifications'::regclass ORDER BY conname`
      )
    ).map((r: any) => [r.conname, r.def]);
    expect(constraints).toEqual([
      ['notifications_pkey', 'PRIMARY KEY (id)'],
      ['notifications_recipient_id_members_id_fk', expect.stringContaining('ON DELETE CASCADE')],
      [
        'notifications_related_page_id_wiki_pages_id_fk',
        expect.stringContaining('ON DELETE CASCADE'),
      ],
      ['notifications_sender_id_members_id_fk', expect.stringContaining('ON DELETE SET NULL')],
    ]);
    expect((await q(`SELECT to_regclass('notification_roster_archive') AS t`))[0].t).toBeNull();
    const columns = (
      await q(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'notifications'`,
        [SCHEMA]
      )
    ).map((r: any) => r.column_name);
    expect(columns).not.toContain('recipient_user_id');
    expect(columns).not.toContain('organization_id');
    expect(columns).not.toContain('sender_user_id');
  });

  it('applies up again afterwards, to the same result as the first time', async () => {
    await buildBefore();
    await run(UP);
    const first = await dumpNew();
    await run(DOWN);
    await run(UP);
    expect(await dumpNew()).toEqual(first);
  });

  it('does nothing without a table or without the new column', async () => {
    await buildBefore();
    const before = await dumpOld();
    await run(DOWN); // old shape: nothing
    expect(await dumpOld()).toEqual(before);
    await scoped.query(`DROP TABLE notifications CASCADE`);
    await run(DOWN);
    expect((await q(`SELECT to_regclass('notifications') AS t`))[0].t).toBeNull();
  });
});
