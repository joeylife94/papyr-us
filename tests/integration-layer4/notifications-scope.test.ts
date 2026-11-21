/**
 * Layer 4: notifications against real Postgres (WP0a).
 *
 * A notification is addressed to an account (`users.id`) and belongs to the organization it was
 * created in. Every DBStorage notification method takes the account and the organization and
 * filters on both:
 *   - lists, unread counts and mark-all touch only the rows of that account in that organization;
 *   - a single-row lookup answers nothing for another account's row, or for a row of another
 *     organization of the same account;
 *   - update, delete and mark-read by another account, or in another organization, change nothing;
 *   - nothing is ever matched by a roster (`members`) id: an account whose number equals a roster
 *     row's number is served only its own rows;
 *   - getNotificationRecipientOrganizationId is the organization of an active account, else null.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_wp0a_scope';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

// Accounts. Alice and Bob are in the default organization, Dave in Acme, Erin is deactivated,
// Frank belongs to no organization.
const ALICE = 1;
const BOB = 2;
const DAVE = 4;
const ERIN = 5;
const FRANK = 6;

let admin: Pool;
let scoped: Pool;
let storage: any;
let acmeId: number;
let defaultId: number;
const ids: Record<string, number> = {};

async function insertNotification(
  key: string,
  recipient: number,
  organizationId: number,
  values: { isRead?: boolean; hoursAgo?: number } = {}
) {
  const { rows } = await scoped.query(
    `INSERT INTO notifications (type, title, content, recipient_user_id, organization_id, is_read, created_at)
     VALUES ('mention', $1, 'body', $2, $3, $4, NOW() - MAKE_INTERVAL(hours => $5)) RETURNING id`,
    [key, recipient, organizationId, values.isRead ?? false, values.hoursAgo ?? 0]
  );
  ids[key] = rows[0].id;
}

const titles = (rows: Array<{ title: string }>) => rows.map((r) => r.title).sort();
const state = async () =>
  (await scoped.query(`SELECT title, is_read FROM notifications ORDER BY id`)).rows.map(
    (r: any) => `${r.title}:${r.is_read}`
  );

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
    CREATE TABLE wiki_pages (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
      blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs',
      tags TEXT[] NOT NULL DEFAULT '{}', author TEXT NOT NULL, parent_id INTEGER,
      position INTEGER, icon TEXT, team_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      is_published BOOLEAN NOT NULL DEFAULT TRUE, metadata JSONB DEFAULT '{}',
      deleted_at TIMESTAMP
    );
  `);
  await scoped.query(
    `INSERT INTO users (id, name, email, is_active) VALUES
       (1, 'Alice', 'alice@example.com', TRUE), (2, 'Bob', 'bob@example.com', TRUE),
       (4, 'Dave', 'dave@example.com', TRUE), (5, 'Erin', 'erin@example.com', FALSE),
       (6, 'Frank', 'frank@example.com', TRUE)`
  );
  defaultId = await addOrganizations(scoped);
  // The notifications table in its current shape (drizzle/0026); the migration is proven by
  // notifications-migration.test.ts.
  await scoped.query(`
    CREATE TABLE notifications (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
      recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      related_page_id INTEGER REFERENCES wiki_pages(id) ON DELETE CASCADE,
      related_task_id INTEGER, related_comment_id INTEGER,
      is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  const { rows: acme } = await scoped.query(
    `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
  );
  acmeId = Number(acme[0].id);
  await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
    acmeId,
    DAVE,
  ]);
  await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [FRANK]);
  // Roster rows whose ids are crossed with the account ids: the roster has no part in this.
  await scoped.query(
    `INSERT INTO members (id, name, email, role) VALUES
       (2, 'Roster two', 'alice@example.com', 'dev'), (1, 'Roster one', 'bob@example.com', 'dev')`
  );

  // Explicit ages, so the newest-first order is not an accident of insertion order.
  await insertNotification('alice-1', ALICE, defaultId, { hoursAgo: 3 });
  await insertNotification('alice-2', ALICE, defaultId, { hoursAgo: 2 });
  await insertNotification('alice-3-read', ALICE, defaultId, { isRead: true, hoursAgo: 1 });
  await insertNotification('alice-acme', ALICE, acmeId, { hoursAgo: 6 });
  await insertNotification('bob-1', BOB, defaultId, { hoursAgo: 4 });
  await insertNotification('dave-1', DAVE, acmeId, { hoursAgo: 5 });

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

describe('getNotificationRecipientOrganizationId', () => {
  it('is the organization of an active account', async () => {
    expect(await storage.getNotificationRecipientOrganizationId(ALICE)).toBe(defaultId);
    expect(await storage.getNotificationRecipientOrganizationId(DAVE)).toBe(acmeId);
  });

  it('is null for an inactive account, an account without an organization and an unknown account', async () => {
    expect(await storage.getNotificationRecipientOrganizationId(ERIN)).toBeNull();
    expect(await storage.getNotificationRecipientOrganizationId(FRANK)).toBeNull();
    expect(await storage.getNotificationRecipientOrganizationId(424242)).toBeNull();
  });
});

describe('scoped notification reads', () => {
  it('lists only the rows of the account in the organization, newest first', async () => {
    const inOrder = async (userId: number, organizationId: number) =>
      (await storage.getNotifications(userId, organizationId)).map(
        (r: { title: string }) => r.title
      );
    expect(await inOrder(ALICE, defaultId)).toEqual(['alice-3-read', 'alice-2', 'alice-1']);
    expect(await inOrder(ALICE, acmeId)).toEqual(['alice-acme']);
    expect(await inOrder(BOB, defaultId)).toEqual(['bob-1']);
    expect(await inOrder(DAVE, acmeId)).toEqual(['dave-1']);
  });

  it('a row of another organization for the same account, and an account with none, are not listed', async () => {
    expect(await storage.getNotifications(BOB, acmeId)).toEqual([]);
    expect(await storage.getNotifications(DAVE, defaultId)).toEqual([]);
    expect(await storage.getNotifications(FRANK, defaultId)).toEqual([]);
    expect(await storage.getNotifications(424242, defaultId)).toEqual([]);
  });

  it('serves an account its own rows, not those of the roster row numbered like it', async () => {
    // Bob is users.id 2 and the roster row with Alice's email is members.id 2.
    expect(titles(await storage.getNotifications(BOB, defaultId))).toEqual(['bob-1']);
    expect(await storage.getUnreadNotificationCount(BOB, defaultId)).toBe(1);
    expect(await storage.getNotificationForUser(ids['alice-1'], BOB, defaultId)).toBeUndefined();
  });

  it('getNotificationForUser: the owner in the organization gets the row, others and unknown ids nothing', async () => {
    expect((await storage.getNotificationForUser(ids['alice-1'], ALICE, defaultId))?.title).toBe(
      'alice-1'
    );
    expect(await storage.getNotificationForUser(ids['alice-1'], DAVE, acmeId)).toBeUndefined();
    expect(await storage.getNotificationForUser(ids['alice-1'], ALICE, acmeId)).toBeUndefined();
    expect(
      await storage.getNotificationForUser(ids['alice-acme'], ALICE, defaultId)
    ).toBeUndefined();
    expect(await storage.getNotificationForUser(ids['alice-1'], 424242, defaultId)).toBeUndefined();
    expect(await storage.getNotificationForUser(987654, ALICE, defaultId)).toBeUndefined();
  });

  it('counts unread rows of the account in the organization only', async () => {
    expect(await storage.getUnreadNotificationCount(ALICE, defaultId)).toBe(2);
    expect(await storage.getUnreadNotificationCount(ALICE, acmeId)).toBe(1);
    expect(await storage.getUnreadNotificationCount(DAVE, defaultId)).toBe(0);
    expect(await storage.getUnreadNotificationCount(FRANK, defaultId)).toBe(0);
  });
});

describe('scoped notification writes', () => {
  it('update, delete and mark-read by another account or in another organization change nothing', async () => {
    const before = await state();
    const attempts: Array<[number, number]> = [
      [BOB, defaultId],
      [DAVE, acmeId],
      [ALICE, acmeId],
      [DAVE, defaultId],
    ];
    for (const [userId, organizationId] of attempts) {
      expect(
        await storage.updateNotification(
          ids['alice-1'],
          { title: 'hijack' },
          userId,
          organizationId
        )
      ).toBeUndefined();
      expect(
        await storage.markNotificationAsRead(ids['alice-1'], userId, organizationId)
      ).toBeUndefined();
      expect(await storage.deleteNotification(ids['alice-1'], userId, organizationId)).toBe(false);
    }
    expect(await state()).toEqual(before);
  });

  it('mark-all marks only the account rows of the organization', async () => {
    await storage.markAllNotificationsAsRead(BOB, defaultId);
    expect(await state()).toEqual([
      'alice-1:false',
      'alice-2:false',
      'alice-3-read:true',
      'alice-acme:false',
      'bob-1:true',
      'dave-1:false',
    ]);
    await storage.markAllNotificationsAsRead(ALICE, acmeId);
    expect(await state()).toEqual([
      'alice-1:false',
      'alice-2:false',
      'alice-3-read:true',
      'alice-acme:true',
      'bob-1:true',
      'dave-1:false',
    ]);
  });

  it('the owner can update, mark read and delete in the organization', async () => {
    const updated = await storage.updateNotification(
      ids['alice-1'],
      { title: 'renamed' },
      ALICE,
      defaultId
    );
    expect(updated?.title).toBe('renamed');
    const read = await storage.markNotificationAsRead(ids['alice-2'], ALICE, defaultId);
    expect(read?.isRead).toBe(true);
    expect(await storage.deleteNotification(ids['alice-1'], ALICE, defaultId)).toBe(true);
    expect(await storage.getNotificationForUser(ids['alice-1'], ALICE, defaultId)).toBeUndefined();
  });

  it('create stores what it is given: the recipient account and the organization', async () => {
    const created = await storage.createNotification({
      type: 'system',
      title: 'made',
      content: 'c',
      recipientUserId: BOB,
      organizationId: defaultId,
      senderUserId: ALICE,
    });
    expect(created).toMatchObject({
      recipientUserId: BOB,
      organizationId: defaultId,
      senderUserId: ALICE,
      isRead: false,
    });
    expect(titles(await storage.getNotifications(BOB, defaultId))).toContain('made');
  });
});
