/**
 * Layer 4: comment mentions and notifications against real Postgres (WP6).
 *
 * DBStorage and the notification plan on tables in the shape of 0022-0027:
 * - a recipient is an active member of the page's organization who may read the page: a member
 *   with only view access qualifies; a member without access, an account of another organization,
 *   a removed member and a deactivated account never do, even on a page shared publicly;
 * - mention tokens naming anyone else are not stored as live tokens;
 * - the page creator is a recipient by account (`created_by_user_id`); a page without one
 *   notifies nobody on that ground, and an `author` text equal to an email decides nothing;
 * - thread participants are accounts (`author_user_id`);
 * - the comment and its notifications are written in one transaction; if the notifications fail
 *   to write, they are all dropped and the comment is still committed;
 * - 30 comments created at once, each with notifications, finish with the default pool size (the
 *   write holds a pool connection only for its own transaction);
 * - the mention picker lists only readers of the page, by name, from two characters, ten at most.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import logger from '../../server/services/logger';
import { addOrganizations } from './organizations-fixture';
import {
  planCommentNotifications,
  planEditNotifications,
} from '../../server/services/comment-notify';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_wp6_comments';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

let admin: Pool;
let scoped: Pool;
let storage: any;
let defaultOrg = 0;
let otherOrg = 0;
let counter = 0;

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
  CREATE TABLE members (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL, avatar_url TEXT, bio TEXT,
    github_username TEXT, skills TEXT[] NOT NULL DEFAULT '{}',
    joined_date TIMESTAMP NOT NULL DEFAULT NOW(), is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', invited_by INTEGER REFERENCES users(id),
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id)
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
  CREATE TABLE page_permissions (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, entity_id INTEGER, permission TEXT NOT NULL,
    granted_by INTEGER, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE comments (
    id SERIAL PRIMARY KEY, content TEXT NOT NULL, author TEXT NOT NULL,
    author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    parent_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

const NOTIFICATIONS = `
  CREATE TABLE notifications (
    id SERIAL PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
    recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    related_page_id INTEGER REFERENCES wiki_pages(id) ON DELETE CASCADE,
    related_task_id INTEGER,
    related_comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

interface Person {
  id: number;
  name: string;
  email: string;
}

async function newUser(
  label: string,
  options: { name?: string; active?: boolean; organization?: 'default' | 'other' | 'none' } = {}
): Promise<Person> {
  counter += 1;
  const email = `${label}-${counter}@example.com`;
  const name = options.name ?? `${label} Person ${counter}`;
  const { rows } = await scoped.query(
    `INSERT INTO users (name, email, is_active) VALUES ($1, $2, $3) RETURNING id`,
    [name, email, options.active ?? true]
  );
  const id = Number(rows[0].id);
  // Accounts inserted after addOrganizations join the default organization (fixture trigger).
  if (options.organization === 'other') {
    await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
      otherOrg,
      id,
    ]);
  } else if (options.organization === 'none') {
    await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [id]);
  }
  return { id, name, email };
}

/** A page in `organization`; `grants` restrict it (a page with any grant is no longer open). */
async function newPage(
  options: {
    creator?: Person | null;
    author?: string;
    organization?: number;
    grants?: Array<[string, number | null, string]>;
  } = {}
) {
  counter += 1;
  const { rows } = await scoped.query(
    `INSERT INTO wiki_pages (title, slug, content, author, organization_id, created_by_user_id)
     VALUES ($1, $2, '', $3, $4, $5) RETURNING id`,
    [
      `Page ${counter}`,
      `page-${counter}`,
      options.author ?? options.creator?.email ?? 'Automation',
      options.organization ?? defaultOrg,
      options.creator?.id ?? null,
    ]
  );
  const id = Number(rows[0].id);
  for (const [type, entityId, permission] of options.grants ?? []) {
    await scoped.query(
      `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission) VALUES ($1, $2, $3, $4)`,
      [id, type, entityId, permission]
    );
  }
  return { id, title: `Page ${counter}` };
}

async function addComment(pageId: number, author: Person | null, parentId: number | null = null) {
  const { rows } = await scoped.query(
    `INSERT INTO comments (content, author, author_user_id, page_id, parent_id)
     VALUES ('c', $1, $2, $3, $4) RETURNING id`,
    [author?.email ?? 'Automation', author?.id ?? null, pageId, parentId]
  );
  return Number(rows[0].id);
}

/** Whether the account is an active member of the organization (what the route decides). */
async function isMember(userId: number, organizationId: number) {
  const { rowCount } = await scoped.query(
    `SELECT 1 FROM users u JOIN organization_members om ON om.user_id = u.id
      WHERE u.id = $1 AND u.is_active AND om.organization_id = $2`,
    [userId, organizationId]
  );
  return (rowCount ?? 0) > 0;
}

const pageInfo = async (pageId: number) => {
  const row = (await scoped.query(`SELECT * FROM wiki_pages WHERE id = $1`, [pageId])).rows[0];
  return {
    id: pageId,
    title: row.title as string,
    organizationId: Number(row.organization_id),
    createdByUserId: row.created_by_user_id === null ? null : Number(row.created_by_user_id),
  };
};

/** Plans and writes a comment the way the route does; returns what was written. */
async function comment(
  page: { id: number },
  actor: Person,
  content: string,
  parentId: number | null = null
) {
  const info = await pageInfo(page.id);
  const plan = await planCommentNotifications(storage, {
    page: info,
    actorUserId: actor.id,
    actorIsMember: await isMember(actor.id, info.organizationId),
    content,
    parentId,
  });
  const data = {
    content: plan.content,
    author: actor.email,
    authorUserId: actor.id,
    pageId: page.id,
    parentId,
  };
  const written = await storage.createCommentWithNotifications(data, plan.notifications);
  return { ...written, plan };
}

/** recipient id -> type, from what a comment wrote. */
const recipients = (written: { notifications: Array<any> }) =>
  Object.fromEntries(written.notifications.map((n) => [n.recipientUserId, n.type]));

const notificationCount = async () =>
  (await scoped.query(`SELECT count(*)::int AS n FROM notifications`)).rows[0].n as number;

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(TABLES);
  defaultOrg = await addOrganizations(scoped);
  await scoped.query(NOTIFICATIONS);
  const { rows } = await scoped.query(
    `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
  );
  otherOrg = Number(rows[0].id);

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

describe('who counts as a reader of the page', () => {
  it('is an active member of the page organization who may read it, nobody else', async () => {
    const creator = await newUser('creator');
    const viewer = await newUser('viewer');
    const noGrant = await newUser('nogrant');
    const outsider = await newUser('outsider', { organization: 'other' });
    const removed = await newUser('removed', { organization: 'none' });
    const inactive = await newUser('inactive', { active: false });
    // A restricted page: only people with a grant read it (cross-organization grants are void).
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['user', viewer.id, 'viewer'],
        ['user', outsider.id, 'viewer'],
        ['user', removed.id, 'viewer'],
        ['user', inactive.id, 'viewer'],
      ],
    });
    const all = [creator, viewer, noGrant, outsider, removed, inactive].map((p) => p.id);
    const readers = await storage.getReadableOrganizationMembers(defaultOrg, page.id, all);
    expect([...readers.keys()].sort()).toEqual([creator.id, viewer.id].sort());
    expect(readers.get(viewer.id)).toBe(viewer.name);
  });

  it('on a page shared publicly still excludes everyone outside the organization', async () => {
    const creator = await newUser('pub-creator');
    const member = await newUser('pub-member');
    const outsider = await newUser('pub-outsider', { organization: 'other' });
    const removed = await newUser('pub-removed', { organization: 'none' });
    const inactive = await newUser('pub-inactive', { active: false });
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['public', null, 'viewer'],
      ],
    });
    // The page itself reads for anyone ...
    expect(await storage.checkPagePermission(outsider.id, page.id, 'viewer')).toBe(true);
    expect(await storage.checkPagePermission(undefined, page.id, 'viewer')).toBe(true);
    // ... but only members of its organization can be recipients.
    const readers = await storage.getReadableOrganizationMembers(
      defaultOrg,
      page.id,
      [creator, member, outsider, removed, inactive].map((p) => p.id)
    );
    expect([...readers.keys()].sort()).toEqual([creator.id, member.id].sort());
    // Asked for the other organization, the default organization's members are not its members.
    expect(
      (await storage.getReadableOrganizationMembers(otherOrg, page.id, [creator.id, member.id]))
        .size
    ).toBe(0);
  });

  it('returns nothing for an inactive organization', async () => {
    const dormant = await scoped.query(
      `INSERT INTO organizations (slug, name, is_active) VALUES ('dormant', 'Dormant', FALSE) RETURNING id`
    );
    const orgId = Number(dormant.rows[0].id);
    const member = await newUser('dormant-member');
    await scoped.query(`UPDATE organization_members SET organization_id = $1 WHERE user_id = $2`, [
      orgId,
      member.id,
    ]);
    const page = await newPage({ organization: orgId, grants: [['public', null, 'viewer']] });
    expect((await storage.getReadableOrganizationMembers(orgId, page.id, [member.id])).size).toBe(
      0
    );
  });
});

describe('what a comment writes', () => {
  it('a top-level comment by A on B’s page mentioning C: B and C notified, for the page organization, from A', async () => {
    const a = await newUser('ann', { name: 'Ann Author' });
    const b = await newUser('ben');
    const c = await newUser('cy', { name: 'Cy Mentioned' });
    const page = await newPage({ creator: b });

    const written = await comment(page, a, `look [[user:${c.id}]]`);
    expect(recipients(written)).toEqual({ [b.id]: 'comment', [c.id]: 'mention' });
    for (const row of written.notifications) {
      expect(row.organizationId).toBe(defaultOrg);
      expect(row.senderUserId).toBe(a.id);
      expect(row.relatedPageId).toBe(page.id);
      expect(row.relatedCommentId).toBe(written.comment.id);
      expect(row.isRead).toBe(false);
    }
    const mention = written.notifications.find((n: any) => n.recipientUserId === c.id);
    expect(mention.content).toBe('look @Cy Mentioned');
    expect(mention.title).toContain('Ann Author');
    expect(`${mention.title} ${mention.content}`).not.toContain('@example.com');
    const stored = (
      await scoped.query(`SELECT content FROM comments WHERE id = $1`, [written.comment.id])
    ).rows[0].content;
    expect(stored).toBe(`look [[user:${c.id}]]`);
  });

  it('a reply notifies the earlier participants of the thread by account, and nobody else', async () => {
    const a = await newUser('r-a');
    const b = await newUser('r-b');
    const c = await newUser('r-c');
    const other = await newUser('r-other');
    const page = await newPage({ creator: b });
    const root = await addComment(page.id, c);
    await addComment(page.id, a, root);
    await addComment(page.id, null, root); // a workflow comment contributes nobody
    const unrelated = await addComment(page.id, other);

    const written = await comment(page, b, 'thanks both', root);
    expect(recipients(written)).toEqual({ [c.id]: 'reply', [a.id]: 'reply' });
    expect(Object.keys(recipients(written))).not.toContain(String(other.id));
    // The commenter is never notified, and the page creator is not notified of a reply as such.
    const replyToOther = await comment(page, a, 'hello', unrelated);
    expect(recipients(replyToOther)).toEqual({ [other.id]: 'reply' });
  });

  it('a page without a recorded creator notifies no one as creator; the author text decides nothing', async () => {
    const a = await newUser('nc-a');
    const lookalike = await newUser('nc-lookalike');
    const page = await newPage({ creator: null, author: lookalike.email });
    const before = await notificationCount();
    const written = await comment(page, a, 'hello');
    expect(written.notifications).toEqual([]);
    expect(await notificationCount()).toBe(before);
  });

  it('a mentioned member with view access only is notified', async () => {
    const a = await newUser('v-a');
    const viewer = await newUser('v-viewer');
    const creator = await newUser('v-creator');
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['user', a.id, 'commenter'],
        ['user', viewer.id, 'viewer'],
      ],
    });
    const written = await comment(page, a, `[[user:${viewer.id}]]`);
    expect(recipients(written)).toEqual({ [viewer.id]: 'mention', [creator.id]: 'comment' });
  });

  it('forged mentions of other-organization, unreadable, removed and deactivated accounts write nothing and are not stored live', async () => {
    const a = await newUser('f-a');
    const creator = await newUser('f-creator');
    const blocked = await newUser('f-blocked');
    const outsider = await newUser('f-outsider', { organization: 'other' });
    const removed = await newUser('f-removed', { organization: 'none' });
    const inactive = await newUser('f-inactive', { active: false });
    const page = await newPage({
      creator: null,
      grants: [
        ['user', a.id, 'commenter'],
        ['user', creator.id, 'owner'],
        ['user', outsider.id, 'viewer'],
        ['user', removed.id, 'viewer'],
        ['user', inactive.id, 'viewer'],
      ],
    });
    const targets = [blocked, outsider, removed, inactive];
    const written = await comment(
      page,
      a,
      targets.map((p) => `[[user:${p.id}]]`).join(' ') + ' [[user:99999999]]'
    );
    expect(written.notifications).toEqual([]);
    const stored = (
      await scoped.query(`SELECT content FROM comments WHERE id = $1`, [written.comment.id])
    ).rows[0].content;
    expect(stored).toBe('@unknown @unknown @unknown @unknown @unknown');
    for (const target of targets) {
      const got = await scoped.query(
        `SELECT 1 FROM notifications WHERE recipient_user_id = $1 AND related_page_id = $2`,
        [target.id, page.id]
      );
      expect(got.rowCount).toBe(0);
    }
  });

  it('a commenter outside the organization on a publicly shared page mentions nobody: same stored text for any ids, creator still told, notification in the page organization', async () => {
    const creator = await newUser('x-creator');
    const member = await newUser('x-member');
    const blocked = await newUser('x-blocked');
    const outsiderPeer = await newUser('x-outsider-peer', { organization: 'other' });
    const visitor = await newUser('x-visitor', { name: 'Vic Visitor', organization: 'other' });
    const page = await newPage({
      creator,
      grants: [
        ['user', creator.id, 'owner'],
        ['user', member.id, 'viewer'],
        ['public', null, 'commenter'],
      ],
    });
    const eligible = await comment(
      page,
      visitor,
      `hi [[user:${member.id}]] [[user:${creator.id}]]`
    );
    const ineligible = await comment(
      page,
      visitor,
      `hi [[user:${blocked.id}]] [[user:${outsiderPeer.id}]]`
    );
    const unknown = await comment(page, visitor, 'hi [[user:99999998]] [[user:99999999]]');
    for (const written of [eligible, ineligible, unknown]) {
      expect(written.comment.content).toBe('hi @unknown @unknown');
      expect(recipients(written)).toEqual({ [creator.id]: 'comment' });
      for (const row of written.notifications) {
        expect(row.organizationId).toBe(defaultOrg);
        expect(row.senderUserId).toBe(visitor.id);
      }
    }
    const mentions = await scoped.query(
      `SELECT 1 FROM notifications WHERE related_page_id = $1 AND type = 'mention'`,
      [page.id]
    );
    expect(mentions.rowCount).toBe(0);
  });

  it('an edit by an account outside the organization keeps no token and notifies nobody', async () => {
    const creator = await newUser('xe-creator');
    const member = await newUser('xe-member');
    const visitor = await newUser('xe-visitor', { organization: 'other' });
    const page = await newPage({ creator, grants: [['public', null, 'commenter']] });
    const info = await pageInfo(page.id);
    const plan = await planEditNotifications(storage, {
      page: info,
      actorUserId: visitor.id,
      actorIsMember: await isMember(visitor.id, info.organizationId),
      content: `[[user:${member.id}]] [[user:99999999]]`,
      previousContent: 'x',
    });
    expect(plan).toEqual({ content: '@unknown @unknown', notifications: [] });
  });

  it('a removed creator and a deactivated participant are not notified', async () => {
    const a = await newUser('g-a');
    const gone = await newUser('g-gone', { organization: 'none' });
    const inactive = await newUser('g-inactive', { active: false });
    const page = await newPage({ creator: gone });
    const top = await comment(page, a, 'first');
    expect(top.notifications).toEqual([]);
    const root = await addComment(page.id, inactive);
    const reply = await comment(page, a, 'reply', root);
    expect(reply.notifications).toEqual([]);
  });
});

const draftFor = (recipient: number, sender: number, pageId: number, over: any = {}) => ({
  type: 'comment',
  title: 't',
  content: 'c',
  recipientUserId: recipient,
  organizationId: defaultOrg,
  senderUserId: sender,
  relatedPageId: pageId,
  isRead: false,
  ...over,
});

describe('failure mode of the notification write', () => {
  it('a recipient who no longer exists is skipped and the others are still written', async () => {
    const a = await newUser('fm-a');
    const b = await newUser('fm-b');
    const c = await newUser('fm-c');
    const page = await newPage({ creator: b });
    const result = await storage.createCommentWithNotifications(
      { content: 'x', author: a.email, authorUserId: a.id, pageId: page.id },
      [
        draftFor(b.id, a.id, page.id),
        draftFor(987654321, a.id, page.id),
        draftFor(c.id, a.id, page.id),
      ]
    );
    expect(result.notificationsFailed).toBe(false);
    expect(result.notifications.map((n: any) => n.recipientUserId).sort()).toEqual(
      [b.id, c.id].sort()
    );
  });

  it('a recipient removed from the organization, deactivated, or in an inactive organization between planning and writing gets nothing; the others still do', async () => {
    const a = await newUser('wr-a');
    const creator = await newUser('wr-creator');
    const stays = await newUser('wr-stays');
    const removed = await newUser('wr-removed');
    const deactivated = await newUser('wr-deactivated');
    const page = await newPage({ creator });
    const info = await pageInfo(page.id);
    const plan = await planCommentNotifications(storage, {
      page: info,
      actorUserId: a.id,
      actorIsMember: true,
      content: `[[user:${stays.id}]] [[user:${removed.id}]] [[user:${deactivated.id}]]`,
      parentId: null,
    });
    expect(plan.notifications.map((n) => n.recipientUserId).sort()).toEqual(
      [stays.id, removed.id, deactivated.id, creator.id].sort()
    );
    // They leave after the plan was made.
    await scoped.query(`DELETE FROM organization_members WHERE user_id = $1`, [removed.id]);
    await scoped.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [deactivated.id]);
    const written = await storage.createCommentWithNotifications(
      { content: plan.content, author: a.email, authorUserId: a.id, pageId: page.id },
      plan.notifications
    );
    expect(written.notificationsFailed).toBe(false);
    expect(written.notifications.map((n: any) => n.recipientUserId).sort()).toEqual(
      [stays.id, creator.id].sort()
    );
    const rows = await scoped.query(
      `SELECT recipient_user_id FROM notifications WHERE related_comment_id = $1`,
      [written.comment.id]
    );
    expect(rows.rows.map((r: any) => r.recipient_user_id).sort()).toEqual(
      [stays.id, creator.id].sort()
    );
  });

  it('a notification that cannot be written is dropped with all the others; the comment is committed and nothing of it is logged', async () => {
    const a = await newUser('fm2-a');
    const b = await newUser('fm2-b');
    const page = await newPage({ creator: b });
    const before = await notificationCount();
    const logged: string[] = [];
    const spy = vi.spyOn(logger, 'warn').mockImplementation(((...args: unknown[]) => {
      logged.push(JSON.stringify(args));
      return logger;
    }) as any);
    const secret = 'secret-comment-text-fm2';
    const result = await storage.createCommentWithNotifications(
      { content: secret, author: a.email, authorUserId: a.id, pageId: page.id },
      [
        draftFor(b.id, a.id, page.id, { title: secret }),
        // a title the table refuses (NOT NULL): the whole notification write fails
        draftFor(a.id, a.id, page.id, { title: null, content: secret }),
      ]
    );
    spy.mockRestore();
    expect(result.notificationsFailed).toBe(true);
    expect(result.notifications).toEqual([]);
    expect(result.comment.id).toBeGreaterThan(0);
    expect(
      (await scoped.query(`SELECT count(*)::int AS n FROM comments WHERE page_id = $1`, [page.id]))
        .rows[0].n
    ).toBe(1);
    expect(await notificationCount()).toBe(before);
    expect(logged.length).toBe(1);
    expect(logged[0]).toContain(String(result.comment.id));
    expect(logged[0]).not.toContain(secret);
    expect(logged[0]).not.toContain(a.email);
  });

  it('a comment that cannot be written writes no notification', async () => {
    const a = await newUser('fc-a');
    const b = await newUser('fc-b');
    const before = await notificationCount();
    await expect(
      storage.createCommentWithNotifications(
        { content: 'x', author: a.email, authorUserId: a.id, pageId: 987654321 },
        [
          {
            type: 'comment',
            title: 't',
            content: 'c',
            recipientUserId: b.id,
            organizationId: defaultOrg,
            senderUserId: a.id,
            relatedPageId: null,
            isRead: false,
          },
        ]
      )
    ).rejects.toBeDefined();
    expect(await notificationCount()).toBe(before);
  });

  it('with no notifications it writes just the comment', async () => {
    const a = await newUser('fn-a');
    const page = await newPage({ creator: null });
    const result = await storage.createCommentWithNotifications(
      { content: 'x', author: a.email, authorUserId: a.id, pageId: page.id },
      []
    );
    expect(result.notifications).toEqual([]);
    expect(result.notificationsFailed).toBe(false);
  });
});

describe('concurrent comments', () => {
  it('30 comments with notifications at once all complete with the default pool size', async () => {
    const creator = await newUser('cc-creator');
    const mentioned = await newUser('cc-mentioned');
    const commenters = [await newUser('cc-a'), await newUser('cc-b'), await newUser('cc-c')];
    const page = await newPage({ creator });
    const root = await addComment(page.id, commenters[0]);
    const before = await notificationCount();

    const attempts = Array.from({ length: 30 }, (_, index) =>
      comment(
        page,
        commenters[index % 3],
        `n${index} [[user:${mentioned.id}]]`,
        index % 2 === 0 ? root : null
      )
    );
    // The write holds a pool connection only for its own transaction, never while waiting for a
    // second one, so every attempt finishes inside this bound.
    const outcome = await Promise.race([
      Promise.allSettled(attempts),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 20_000)),
    ]);
    expect(outcome).not.toBe('timeout');
    const results = outcome as PromiseSettledResult<{ notifications: unknown[] }>[];
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    const written = results.map((r) => (r as PromiseFulfilledResult<any>).value);
    expect(new Set(written.map((w) => w.comment.id)).size).toBe(30);
    expect(await notificationCount()).toBe(
      before + written.reduce((sum, w) => sum + w.notifications.length, 0)
    );
    // Every comment notified the mentioned account exactly once.
    const mentions = await scoped.query(
      `SELECT count(*)::int AS n FROM notifications WHERE recipient_user_id = $1 AND type = 'mention'`,
      [mentioned.id]
    );
    expect(mentions.rows[0].n).toBe(30);
  }, 40_000);
});

describe('mention picker', () => {
  it('lists only readers of the page, by name, from two characters, without the caller', async () => {
    const caller = await newUser('p-caller', { name: 'Zed Caller' });
    const reader = await newUser('p-reader', { name: 'Zoe Reader' });
    await newUser('p-blocked', { name: 'Zack Blocked' });
    const outsider = await newUser('p-outsider', { name: 'Zia Outsider', organization: 'other' });
    const removed = await newUser('p-removed', { name: 'Zan Removed', organization: 'none' });
    const inactive = await newUser('p-inactive', { name: 'Zig Inactive', active: false });
    const page = await newPage({
      creator: caller,
      grants: [
        ['user', caller.id, 'owner'],
        ['user', reader.id, 'viewer'],
        ['user', outsider.id, 'viewer'],
        ['user', removed.id, 'viewer'],
        ['user', inactive.id, 'viewer'],
      ],
    });
    const found = await storage.listMentionCandidates(defaultOrg, page.id, 'z', caller.id);
    expect(found).toEqual({ candidates: [], more: false, truncated: false }); // one character reads nothing
    const two = await storage.listMentionCandidates(defaultOrg, page.id, 'zo', caller.id);
    expect(two).toEqual({
      candidates: [{ id: reader.id, name: 'Zoe Reader' }],
      more: false,
      truncated: false,
    });
    // Matches by name that cannot read the page, or are not members, list nobody.
    for (const search of ['za', 'zi', 'zan', 'zig']) {
      expect(await storage.listMentionCandidates(defaultOrg, page.id, search, caller.id)).toEqual({
        candidates: [],
        more: false,
        truncated: false,
      });
    }
    // Only id and name leave storage.
    expect(Object.keys(two.candidates[0]).sort()).toEqual(['id', 'name']);
  });

  it('returns ten at most and says there are more; matches a literal % and _', async () => {
    const caller = await newUser('q-caller', { name: 'Quinn Caller' });
    const page = await newPage({ creator: caller });
    for (let i = 0; i < 12; i++)
      await newUser(`q-${i}`, { name: `Quill ${String(i).padStart(2, '0')}` });
    await newUser('q-pct', { name: 'Pct 100% Sure' });
    await newUser('q-us', { name: 'Under_score' });
    const ten = await storage.listMentionCandidates(defaultOrg, page.id, 'quill', caller.id);
    expect(ten.candidates).toHaveLength(10);
    expect(ten.more).toBe(true);
    expect(ten.candidates.map((c: any) => c.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Quill ${String(i).padStart(2, '0')}`)
    );
    expect(
      (await storage.listMentionCandidates(defaultOrg, page.id, '0% S', caller.id)).candidates
    ).toHaveLength(1);
    expect(
      (await storage.listMentionCandidates(defaultOrg, page.id, '%%', caller.id)).candidates
    ).toHaveLength(0);
    expect(
      (await storage.listMentionCandidates(defaultOrg, page.id, 'r_s', caller.id)).candidates
    ).toHaveLength(1);
    expect(
      (await storage.listMentionCandidates(defaultOrg, page.id, 'r.s', caller.id)).candidates
    ).toHaveLength(0);
  });

  it('finds readers behind many names that cannot read the page', async () => {
    const caller = await newUser('s-caller', { name: 'Sky Caller' });
    const reader = await newUser('s-reader', { name: 'Skyler Zzz Reader' });
    for (let i = 0; i < 30; i++) await newUser(`s-b${i}`, { name: `Skyline Blocked ${i}` });
    const page = await newPage({
      creator: caller,
      grants: [
        ['user', caller.id, 'owner'],
        ['user', reader.id, 'viewer'],
      ],
    });
    const found = await storage.listMentionCandidates(defaultOrg, page.id, 'sky', caller.id);
    expect(found.candidates.map((c: any) => c.id)).toEqual([reader.id]);
  });
});

describe('edits', () => {
  it('an edit writes mention notifications for added mentions only, in the same transaction, and does not rewrite earlier ones', async () => {
    const a = await newUser('e-a', { name: 'Eve Editor' });
    const creator = await newUser('e-creator');
    const kept = await newUser('e-kept', { name: 'Kay Kept' });
    const added = await newUser('e-added', { name: 'Ada Added' });
    const page = await newPage({ creator });
    const first = await comment(page, a, `hi [[user:${kept.id}]]`);
    const commentId = first.comment.id as number;
    const keptRow = first.notifications.find((n: any) => n.recipientUserId === kept.id);

    const info = await pageInfo(page.id);
    const plan = await planEditNotifications(storage, {
      page: info,
      actorUserId: a.id,
      actorIsMember: true,
      content: `hi [[user:${kept.id}]] and [[user:${added.id}]] and [[user:${a.id}]]`,
      previousContent: first.comment.content,
    });
    expect(plan.notifications.map((n) => [n.recipientUserId, n.type])).toEqual([
      [added.id, 'mention'],
    ]);
    const edited = await storage.updateCommentWithNotifications(
      commentId,
      { content: plan.content },
      plan.notifications
    );
    expect(edited.comment.content).toBe(plan.content);
    expect(edited.notifications).toHaveLength(1);
    expect(edited.notifications[0]).toMatchObject({
      recipientUserId: added.id,
      type: 'mention',
      relatedCommentId: commentId,
      organizationId: defaultOrg,
      senderUserId: a.id,
    });
    expect(edited.notifications[0].content).toBe('hi @Kay Kept and @Ada Added and @Eve Editor');
    const keptNow = (await scoped.query(`SELECT * FROM notifications WHERE id = $1`, [keptRow.id]))
      .rows[0];
    expect(keptNow.content).toBe(keptRow.content);
    expect(
      (
        await scoped.query(
          `SELECT count(*)::int AS n FROM notifications WHERE related_comment_id = $1 AND recipient_user_id = $2`,
          [commentId, kept.id]
        )
      ).rows[0].n
    ).toBe(1);
    // Editing a comment that is gone writes nothing.
    const gone = await storage.updateCommentWithNotifications(
      987654321,
      { content: 'x' },
      plan.notifications
    );
    expect(gone.comment).toBeUndefined();
    expect(gone.notifications).toEqual([]);
  });
});

/** Runs `work` and returns how many queries went through the pool while it ran. */
async function queriesDuring(work: () => Promise<unknown>) {
  const pool = storage.pool;
  const original = pool.query.bind(pool);
  let count = 0;
  pool.query = (...args: unknown[]) => {
    count += 1;
    return original(...args);
  };
  try {
    await work();
  } finally {
    pool.query = original;
  }
  return count;
}

describe('reader resolution is a fixed number of queries and agrees with checkPagePermission', () => {
  it('names 50 mentioned accounts, and all of them, in at most 6 queries', async () => {
    const creator = await newUser('n-creator');
    const crowd: Person[] = [];
    for (let i = 0; i < 50; i++) crowd.push(await newUser(`n-${i}`));
    const page = await newPage({ creator });
    const ids = crowd.map((p) => p.id);
    let names = new Map<number, string>();
    const used = await queriesDuring(async () => {
      names = await storage.getReadableOrganizationMembers(defaultOrg, page.id, ids);
    });
    expect(names.size).toBe(50);
    expect(used).toBeLessThanOrEqual(6);
    // The same for 5 ids: the count does not grow with the number of accounts.
    const fewer = await queriesDuring(() =>
      storage.getReadableOrganizationMembers(defaultOrg, page.id, ids.slice(0, 5))
    );
    expect(fewer).toBe(used);
  });

  it('gives the same answer as checkPagePermission(viewer) for every kind of account on every kind of page', async () => {
    const team = (
      await scoped.query(
        `INSERT INTO teams (name, display_name, organization_id) VALUES ('eq-team', 'eq', $1) RETURNING id`,
        [defaultOrg]
      )
    ).rows[0].id as number;
    const otherTeam = (
      await scoped.query(
        `INSERT INTO teams (name, display_name, organization_id) VALUES ('eq-team2', 'eq2', $1) RETURNING id`,
        [defaultOrg]
      )
    ).rows[0].id as number;
    const creator = await newUser('eq-creator');
    const plain = await newUser('eq-plain');
    const granted = await newUser('eq-granted');
    const teamMember = await newUser('eq-teammember');
    const otherTeamMember = await newUser('eq-otherteam');
    const teamGranted = await newUser('eq-teamgranted');
    const authorByEmail = await newUser('eq-author');
    const outsider = await newUser('eq-outsider', { organization: 'other' });
    for (const [user, teamId] of [
      [teamMember, team],
      [otherTeamMember, otherTeam],
      [teamGranted, otherTeam],
    ] as Array<[Person, number]>) {
      await scoped.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [
        teamId,
        user.id,
      ]);
    }
    const everyone = [
      creator,
      plain,
      granted,
      teamMember,
      otherTeamMember,
      teamGranted,
      authorByEmail,
      outsider,
    ];
    const makePage = async (options: {
      teamId?: number;
      creator?: Person | null;
      author?: string;
      grants?: Array<[string, number | null, string]>;
    }) => {
      const page = await newPage({
        creator: options.creator === undefined ? creator : options.creator,
        author: options.author,
        grants: options.grants,
      });
      if (options.teamId) {
        await scoped.query(`UPDATE wiki_pages SET team_id = $1 WHERE id = $2`, [
          options.teamId,
          page.id,
        ]);
      }
      return page;
    };
    const pages = [
      await makePage({}),
      await makePage({ grants: [['user', creator.id, 'owner']] }),
      await makePage({ grants: [['user', granted.id, 'viewer']] }),
      await makePage({
        grants: [
          ['user', granted.id, 'commenter'],
          ['team', otherTeam, 'viewer'],
        ],
      }),
      await makePage({ grants: [['public', null, 'viewer']] }),
      // A public grant above commenter is honoured as viewer: it reads, like any public grant
      await makePage({ grants: [['public', null, 'commenter']] }),
      await makePage({ grants: [['public', null, 'editor']] }),
      await makePage({ grants: [['public', null, 'owner']] }),
      await makePage({ teamId: team, grants: [['public', null, 'editor']] }),
      await makePage({ grants: [['public', null, 'bogus']] }),
      // Several public rows: the strongest honoured level decides, whatever the row order
      await makePage({
        grants: [
          ['public', null, 'bogus'],
          ['public', null, 'viewer'],
        ],
      }),
      await makePage({
        grants: [
          ['public', null, 'viewer'],
          ['public', null, 'bogus'],
        ],
      }),
      await makePage({
        grants: [
          ['public', null, 'owner'],
          ['public', null, 'commenter'],
        ],
      }),
      await makePage({
        grants: [
          ['public', 7, 'bogus'],
          ['public', null, 'viewer'],
        ],
      }),
      await makePage({
        grants: [
          ['public', null, 'bogus'],
          ['user', granted.id, 'editor'],
        ],
      }),
      await makePage({ teamId: team }),
      await makePage({
        teamId: team,
        grants: [
          ['user', granted.id, 'viewer'],
          ['team', otherTeam, 'editor'],
        ],
      }),
      await makePage({
        creator: null,
        author: authorByEmail.email,
        grants: [['user', creator.id, 'owner']],
      }),
      await makePage({
        creator: null,
        author: authorByEmail.email,
        teamId: team,
        grants: [['user', creator.id, 'owner']],
      }),
      await makePage({
        creator,
        author: authorByEmail.email,
        grants: [['user', creator.id, 'owner']],
      }),
    ];
    // Both settings of "members can edit team pages": comment and edit rights never change who
    // reads, so the in-memory reader keeps agreeing with the single-page check and the SQL form.
    for (const membersCanEdit of [false, true]) {
      await scoped.query(`UPDATE teams SET members_can_edit = $1`, [membersCanEdit]);
      for (const page of pages) {
        const readers = await storage.getReadableOrganizationMembers(
          defaultOrg,
          page.id,
          everyone.map((p) => p.id)
        );
        for (const person of everyone) {
          const members = person !== outsider;
          const expected =
            members && (await storage.checkPagePermission(person.id, page.id, 'viewer'));
          expect(
            readers.has(person.id),
            `${person.email} on page ${page.id}, members can edit ${membersCanEdit}`
          ).toBe(Boolean(expected));
          if (members) {
            // The SQL form used by the page lists and by-id reads says the same
            const viewer = await storage.getPageViewer(person.id);
            expect(
              (await storage.resolveReadablePageLinks(viewer, [page.id])).length === 1,
              `readableBy: ${person.email} on page ${page.id}`
            ).toBe(Boolean(expected));
          }
        }
      }
    }
  });
});

describe('mention names in the comment list', () => {
  it('every eligible mention of the page is named, however many comments carry them', async () => {
    const creator = await newUser('l-creator');
    const crowd: Person[] = [];
    for (let i = 0; i < 60; i++) crowd.push(await newUser(`l-${i}`));
    const page = await newPage({ creator });
    const ids = crowd.map((p) => p.id);
    const named = await storage.getReadableOrganizationMembers(defaultOrg, page.id, ids);
    expect([...named.keys()].sort()).toEqual([...ids].sort());
  });
});

describe('mention picker cost and completeness', () => {
  it('uses a bounded number of queries and says when the scan was cut short', async () => {
    const caller = await newUser('t-caller', { name: 'Tess Caller' });
    for (let i = 0; i < 230; i++) await newUser(`t-b${i}`, { name: `Tess Blocked ${i}` });
    const reader = await newUser('t-reader', { name: 'Tess Zzz Reader' });
    const page = await newPage({
      creator: caller,
      grants: [
        ['user', caller.id, 'owner'],
        ['user', reader.id, 'viewer'],
      ],
    });
    let result: any;
    const used = await queriesDuring(async () => {
      result = await storage.listMentionCandidates(defaultOrg, page.id, 'tess', caller.id);
    });
    // 231 matches other than the caller: the scan stops at its bound, and says so.
    expect(result.truncated).toBe(true);
    expect(result.more).toBe(false);
    expect(used).toBeLessThanOrEqual(4 * 6);
    // A search that narrows it down finds the reader and is not cut short.
    const narrow = await storage.listMentionCandidates(defaultOrg, page.id, 'zzz', caller.id);
    expect(narrow).toEqual({
      candidates: [{ id: reader.id, name: 'Tess Zzz Reader' }],
      more: false,
      truncated: false,
    });
  });
});

describe('one mention notification per comment and person', () => {
  it('adding a mention notifies once; removing and adding it again notifies nobody again', async () => {
    const a = await newUser('om-a');
    const creator = await newUser('om-creator');
    const d = await newUser('om-d');
    const page = await newPage({ creator });
    const first = await comment(page, a, 'hello');
    const commentId = first.comment.id as number;
    const info = await pageInfo(page.id);
    const edit = async (content: string, previousContent: string) => {
      const plan = await planEditNotifications(storage, {
        page: info,
        actorUserId: a.id,
        actorIsMember: true,
        content,
        previousContent,
      });
      return storage.updateCommentWithNotifications(
        commentId,
        { content: plan.content },
        plan.notifications
      );
    };
    const total = async () =>
      (
        await scoped.query(
          `SELECT count(*)::int AS n FROM notifications WHERE related_comment_id = $1 AND recipient_user_id = $2 AND type = 'mention'`,
          [commentId, d.id]
        )
      ).rows[0].n as number;
    const token = `[[user:${d.id}]]`;
    expect((await edit(`hi ${token}`, 'hello')).notifications).toHaveLength(1);
    expect(await total()).toBe(1);
    expect((await edit('hi', `hi ${token}`)).notifications).toHaveLength(0);
    expect(await total()).toBe(1);
    expect((await edit(`hi again ${token}`, 'hi')).notifications).toHaveLength(0);
    expect(await total()).toBe(1);
  });
});

describe('reader resolution stays inside the page organization', () => {
  it('a public page of one organization asked with another organization id answers nobody', async () => {
    const creator = await newUser('go-creator');
    const member = await newUser('go-member');
    const other = await newUser('go-other', { organization: 'other' });
    const page = await newPage({ creator, grants: [['public', null, 'viewer']] });
    const ids = [creator.id, member.id, other.id];
    // Asked with the other organization's id, even its own member gets no answer.
    expect((await storage.getReadableOrganizationMembers(otherOrg, page.id, ids)).size).toBe(0);
    expect(
      [...(await storage.getReadableOrganizationMembers(defaultOrg, page.id, ids)).keys()].sort()
    ).toEqual([creator.id, member.id].sort());
  });
});
