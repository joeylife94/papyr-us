/**
 * Layer 4: notifications against real Postgres (#124 X1b).
 *
 * Notifications address `members` rows (the legacy roster), sessions carry a `users` id, and the
 * two id spaces are unrelated: the account Bob (users.id 2) must never be served the rows of the
 * member whose members.id is 2. The link is the exact email, through three DBStorage helpers
 * (getMemberIdsForUser, getUserIdForMember, getMemberOrganizationId), and every notification
 * read and write takes the caller's member ids:
 *   - lists, unread counts and mark-all touch only rows of those member ids;
 *   - a single-row lookup for an account answers nothing for another person's row;
 *   - update, delete and mark-read with member ids that do not own the row change nothing;
 *   - an empty list is never an unfiltered query.
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

const SCHEMA = 'notifications_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TEAM_DEFAULT = 71; // default organization
const TEAM_ACME = 72; // Acme organization

// Accounts. Alice and Bob are in the default organization, Dave in Acme.
const ALICE = { id: 1, email: 'alice@example.com' };
const BOB = { id: 2, email: 'bob@example.com' };
const DAVE = { id: 4, email: 'dave@example.com' };

// Roster rows. The ids are crossed on purpose: Alice owns member 2 and Bob owns member 1, so
// Bob's users.id (2) equals Alice's members.id.
const M_BOB = 1;
const M_ALICE = 2;
const M_DAVE = 4;
const M_ACME_TEAM_ONLY = 5; // no account; its team is in Acme
const M_DEFAULT_TEAM_ONLY = 6; // no account; its team is in the default organization
const M_NOWHERE = 7; // no account, no team
const M_MOVED = 8; // email of Dave's account, team in the default organization
const UNKNOWN_MEMBER = 999;

let admin: Pool;
let scoped: Pool;
let storage: any;
let acmeId: number;
let defaultId: number;
const ids: Record<string, number> = {};

async function insertNotification(
  key: string,
  recipientId: number,
  values: { isRead?: boolean; hoursAgo?: number } = {}
) {
  const { rows } = await scoped.query(
    `INSERT INTO notifications (type, title, content, recipient_id, is_read, created_at)
     VALUES ('mention', $1, 'body', $2, $3, NOW() - MAKE_INTERVAL(hours => $4)) RETURNING id`,
    [key, recipientId, values.isRead ?? false, values.hoursAgo ?? 0]
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
    CREATE TABLE notifications (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
      recipient_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      related_page_id INTEGER REFERENCES wiki_pages(id) ON DELETE CASCADE,
      related_task_id INTEGER, related_comment_id INTEGER,
      is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await scoped.query(
    `INSERT INTO users (id, name, email) VALUES (1, 'Alice', $1), (2, 'Bob', $2), (4, 'Dave', $3)`,
    [ALICE.email, BOB.email, DAVE.email]
  );

  defaultId = await addOrganizations(scoped, undefined, { teams: [TEAM_DEFAULT, TEAM_ACME] });
  const { rows: acme } = await scoped.query(
    `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
  );
  acmeId = Number(acme[0].id);
  await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
    acmeId,
    DAVE.id,
  ]);
  await scoped.query(`UPDATE teams SET organization_id = $1 WHERE id = $2`, [acmeId, TEAM_ACME]);

  await scoped.query(
    `INSERT INTO members (id, name, email, role, team_id) VALUES
       ($1, 'Bob', $2, 'dev', NULL),
       ($3, 'Alice', $4, 'dev', $5),
       ($6, 'Dave', $7, 'dev', NULL),
       ($8, 'Acme only', 'acme-only@example.com', 'dev', $9),
       ($10, 'Default only', 'default-only@example.com', 'dev', $5),
       ($11, 'Nowhere', 'nowhere@example.com', 'dev', NULL),
       ($12, 'Moved', $7 || '.moved', 'dev', $5)`,
    [
      M_BOB,
      BOB.email,
      M_ALICE,
      ALICE.email,
      TEAM_DEFAULT,
      M_DAVE,
      DAVE.email,
      M_ACME_TEAM_ONLY,
      TEAM_ACME,
      M_DEFAULT_TEAM_ONLY,
      M_NOWHERE,
      M_MOVED,
    ]
  );
  // A roster row sharing Dave's account email in a different case is not Dave's (exact match).
  await scoped.query(`UPDATE members SET email = 'DAVE@example.com' WHERE id = $1`, [M_MOVED]);

  // Explicit ages, so the newest-first order is not an accident of insertion order.
  await insertNotification('alice-1', M_ALICE, { hoursAgo: 3 });
  await insertNotification('alice-2', M_ALICE, { hoursAgo: 2 });
  await insertNotification('alice-3-read', M_ALICE, { isRead: true, hoursAgo: 1 });
  await insertNotification('bob-1', M_BOB, { hoursAgo: 4 });
  await insertNotification('dave-1', M_DAVE, { hoursAgo: 5 });

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

describe('identity helpers (H1)', () => {
  it('getMemberIdsForUser: members carrying the exact email of the account', async () => {
    expect(await storage.getMemberIdsForUser(ALICE.id)).toEqual([M_ALICE]);
    expect(await storage.getMemberIdsForUser(BOB.id)).toEqual([M_BOB]);
    // M_MOVED has Dave's email in another case: not Dave's.
    expect(await storage.getMemberIdsForUser(DAVE.id)).toEqual([M_DAVE]);
  });

  it('getMemberIdsForUser: empty for an unknown user', async () => {
    expect(await storage.getMemberIdsForUser(424242)).toEqual([]);
  });

  it('getUserIdForMember: the account with the member email, else null', async () => {
    expect(await storage.getUserIdForMember(M_ALICE)).toBe(ALICE.id);
    expect(await storage.getUserIdForMember(M_BOB)).toBe(BOB.id);
    expect(await storage.getUserIdForMember(M_ACME_TEAM_ONLY)).toBeNull();
    expect(await storage.getUserIdForMember(M_MOVED)).toBeNull();
    expect(await storage.getUserIdForMember(UNKNOWN_MEMBER)).toBeNull();
  });

  it('getMemberOrganizationId: the account organization first', async () => {
    expect(await storage.getMemberOrganizationId(M_ALICE)).toBe(defaultId);
    expect(await storage.getMemberOrganizationId(M_DAVE)).toBe(acmeId);
  });

  it('getMemberOrganizationId: the team organization when there is no account', async () => {
    expect(await storage.getMemberOrganizationId(M_ACME_TEAM_ONLY)).toBe(acmeId);
    expect(await storage.getMemberOrganizationId(M_DEFAULT_TEAM_ONLY)).toBe(defaultId);
  });

  it('getMemberOrganizationId: null for a member with neither, and for an unknown id', async () => {
    expect(await storage.getMemberOrganizationId(M_NOWHERE)).toBeNull();
    expect(await storage.getMemberOrganizationId(UNKNOWN_MEMBER)).toBeNull();
  });
});

describe('scoped notification reads', () => {
  it('lists only the rows of the given member ids, newest first', async () => {
    const inOrder = async (memberIds: number[]) =>
      (await storage.getNotifications(memberIds)).map((r: { title: string }) => r.title);
    expect(await inOrder([M_ALICE])).toEqual(['alice-3-read', 'alice-2', 'alice-1']);
    expect(await inOrder([M_BOB])).toEqual(['bob-1']);
    expect(await inOrder([M_BOB, M_DAVE])).toEqual(['bob-1', 'dave-1']);
    expect(await inOrder([M_DAVE, M_ALICE, M_BOB])).toEqual([
      'alice-3-read',
      'alice-2',
      'alice-1',
      'bob-1',
      'dave-1',
    ]);
  });

  it('serves an account the rows of its member ids, not those of the member numbered like it', async () => {
    // Bob is users.id 2 and Alice is members.id 2.
    const bobsMembers = await storage.getMemberIdsForUser(BOB.id);
    expect(titles(await storage.getNotifications(bobsMembers))).toEqual(['bob-1']);
    expect(await storage.getUnreadNotificationCount(bobsMembers)).toBe(1);
    expect(await storage.getNotificationForUser(ids['alice-1'], BOB.id)).toBeUndefined();
  });

  it('getNotificationForUser: the owner gets the row, others and unknown ids nothing', async () => {
    expect((await storage.getNotificationForUser(ids['alice-1'], ALICE.id))?.title).toBe('alice-1');
    expect(await storage.getNotificationForUser(ids['alice-1'], DAVE.id)).toBeUndefined();
    expect(await storage.getNotificationForUser(ids['alice-1'], 424242)).toBeUndefined();
    expect(await storage.getNotificationForUser(987654, ALICE.id)).toBeUndefined();
  });

  it('counts unread rows of the given member ids only', async () => {
    expect(await storage.getUnreadNotificationCount([M_ALICE])).toBe(2);
    expect(await storage.getUnreadNotificationCount([M_BOB, M_DAVE])).toBe(2);
  });

  it('an empty member list lists nothing, counts zero and marks nothing', async () => {
    expect(await storage.getNotifications([])).toEqual([]);
    expect(await storage.getUnreadNotificationCount([])).toBe(0);
    const before = await state();
    await storage.markAllNotificationsAsRead([]);
    expect(await state()).toEqual(before);
    expect(await storage.updateNotification(ids['alice-1'], { title: 'x' }, [])).toBeUndefined();
    expect(await storage.deleteNotification(ids['alice-1'], [])).toBe(false);
    expect(await storage.markNotificationAsRead(ids['alice-1'], [])).toBeUndefined();
    expect(await state()).toEqual(before);
  });
});

describe('scoped notification writes', () => {
  it('update, delete and mark-read by member ids that do not own the row change nothing', async () => {
    const before = await state();
    expect(
      await storage.updateNotification(ids['alice-1'], { title: 'hijack' }, [M_BOB, M_DAVE])
    ).toBeUndefined();
    expect(await storage.markNotificationAsRead(ids['alice-1'], [M_BOB])).toBeUndefined();
    expect(await storage.deleteNotification(ids['alice-1'], [M_BOB, M_DAVE])).toBe(false);
    expect(await state()).toEqual(before);
  });

  it('mark-all by member ids marks only those rows', async () => {
    await storage.markAllNotificationsAsRead([M_BOB]);
    expect(await state()).toEqual([
      'alice-1:false',
      'alice-2:false',
      'alice-3-read:true',
      'bob-1:true',
      'dave-1:false',
    ]);
  });

  it('the owner can update, mark read and delete', async () => {
    const updated = await storage.updateNotification(ids['alice-1'], { title: 'renamed' }, [
      M_ALICE,
    ]);
    expect(updated?.title).toBe('renamed');
    const read = await storage.markNotificationAsRead(ids['alice-2'], [M_ALICE]);
    expect(read?.isRead).toBe(true);
    expect(await storage.deleteNotification(ids['alice-1'], [M_ALICE])).toBe(true);
    expect(await storage.getNotificationForUser(ids['alice-1'], ALICE.id)).toBeUndefined();
  });
});
