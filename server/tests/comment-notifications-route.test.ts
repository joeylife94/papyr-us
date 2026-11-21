/**
 * Route-level rules of comment mentions and the notifications a comment creates (WP6). The SQL
 * side (membership, readability, atomic write, concurrency) is proven by
 * tests/integration-layer4/comment-notifications.test.ts and the whole path by
 * tests/comment-mentions.spec.ts.
 *
 * Storage is replaced by a small in-memory directory that answers the way DBStorage does: a
 * recipient is an ACTIVE member of the page's organization who may read the page (membership
 * first, so a publicly shared page reaches nobody outside the organization).
 *
 * Rules under test:
 * - a top-level comment notifies the page's recorded creator; a page without one notifies nobody
 *   on that ground; nobody is notified about their own comment;
 * - a mention notifies a member who may read the page, including one who may only view it, and
 *   nobody else: an account of another organization, a removed or deactivated account, a member
 *   who cannot read the page, or an unknown id; such a token is not stored as a live token and
 *   nothing about the target is returned;
 * - a reply notifies the thread's earlier participants by account (never the commenter), with
 *   the `reply` kind, and a reply must belong to a comment of the same page;
 * - a comment from an account of another organization on a publicly shared page notifies only
 *   members of the page's organization, and the notification belongs to the page's organization;
 * - the notification text is a short excerpt with mentions rendered as names, never an email;
 * - a failure to plan or to write notifications never fails or loses the comment;
 * - a person cannot create a `reply` notification through the notifications API;
 * - the mention picker answers id and name only, to members of the page's organization.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';
import logger from '../services/logger';

const TEST_SECRET = 'comment-notifications-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'comment-notifications-secret',
    adminEmails: [] as string[],
    enforceAuthForWrites: true,
    rateLimitEnabled: false,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 1000,
    adminIpWhitelist: [] as string[],
    port: 5001,
    host: '0.0.0.0',
    isProduction: false,
    isReplit: false,
  },
}));

vi.mock('../features', () => ({
  featureFlags: { PAPYR_MODE: 'team', FEATURE_TEAMS: true, FEATURE_NOTIFICATIONS: true },
  isFeatureEnabled: () => true,
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const ORG = 1;
const OTHER_ORG = 2;
const PAGE_ID = 10;

// Accounts: A comments, B created the page, C is mentioned, D can only view the page, E cannot
// read it, F was removed from the organization, G is deactivated, H belongs to another organization.
const A = 1;
const B = 2;
const C = 3;
const D = 4;
const E = 5;
const F = 6;
const G = 7;
const H = 8;

interface Account {
  name: string;
  email: string;
  active: boolean;
  org: number | null;
}
const accounts: Record<number, Account> = {
  [A]: { name: 'Ann Author', email: 'a@example.com', active: true, org: ORG },
  [B]: { name: 'Ben Creator', email: 'b@example.com', active: true, org: ORG },
  [C]: { name: 'Cy Mentioned', email: 'c@example.com', active: true, org: ORG },
  [D]: { name: 'Di Viewer', email: 'd@example.com', active: true, org: ORG },
  [E]: { name: 'Ed Blocked', email: 'e@example.com', active: true, org: ORG },
  [F]: { name: 'Flo Removed', email: 'f@example.com', active: true, org: null },
  [G]: { name: 'Gus Inactive', email: 'g@example.com', active: false, org: ORG },
  [H]: { name: 'Hal Outsider', email: 'h@example.com', active: true, org: OTHER_ORG },
};

const tokenFor = (id: number) =>
  jwt.sign({ id, email: accounts[id].email, role: 'user' }, TEST_SECRET);
const as = (id: number) => ({ Cookie: [`accessToken=${tokenFor(id)}`] });

let page: Record<string, unknown>;
let blocked: Set<number>;
let publicPage: boolean;
let threadRows: Array<{ id: number; parentId: number | null; authorUserId: number | null }>;

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.resetAllMocks();
  page = {
    id: PAGE_ID,
    title: 'Roadmap',
    teamId: null,
    organizationId: ORG,
    createdByUserId: B,
  };
  blocked = new Set([E]);
  publicPage = false;
  threadRows = [];

  storage.getUserAccount.mockImplementation(async (id: number) => {
    const account = accounts[id];
    return account && { id, email: account.email, isActive: account.active };
  });
  storage.getUserOrganizationId.mockImplementation(async (id: number) => accounts[id]?.org ?? null);
  // Anyone may read a public page; otherwise members of the organization except the blocked one.
  storage.checkPagePermission.mockImplementation(async (id: number | undefined) => {
    if (publicPage) return true;
    return id !== undefined && accounts[id]?.org === ORG && !blocked.has(id);
  });
  storage.getWikiPage.mockImplementation(async () => page);
  storage.getComment.mockImplementation(async (id: number) => {
    const row = threadRows.find((candidate) => candidate.id === id);
    return row && { ...row, pageId: PAGE_ID, content: 'x', author: 'x' };
  });
  storage.getPageCommentThreadRows.mockImplementation(async () => threadRows);
  storage.getReadableOrganizationMembers.mockImplementation(
    async (organizationId: number, _pageId: number, ids: number[]) => {
      const result = new Map<number, string>();
      for (const id of ids) {
        const account = accounts[id];
        if (!account || !account.active || account.org !== organizationId) continue;
        if (await storage.checkPagePermission(id, PAGE_ID, 'viewer')) result.set(id, account.name);
      }
      return result;
    }
  );
  storage.getActiveAccountNames.mockImplementation(async (ids: number[]) => {
    const result = new Map<number, string>();
    for (const id of ids) if (accounts[id]?.active) result.set(id, accounts[id].name);
    return result;
  });
  storage.createComment.mockImplementation(async (data: any) => ({ id: 500, ...data }));
  storage.createCommentWithNotifications.mockImplementation(async (data: any, drafts: any[]) => ({
    comment: { id: 500, ...data },
    notifications: drafts.map((draft, index) => ({ id: 900 + index, ...draft })),
    notificationsFailed: false,
  }));
  storage.getUnreadNotificationCount.mockResolvedValue(1);
});

const post = (who: number, body: Record<string, unknown>) =>
  request(app).post(`/api/pages/${PAGE_ID}/comments`).set(as(who)).send(body);

/** The notifications handed to storage, as recipient -> [kind, organization, sender]. */
const written = () => {
  const calls = storage.createCommentWithNotifications.mock.calls;
  if (calls.length === 0) return {};
  return Object.fromEntries(
    (calls[0][1] as any[]).map((draft) => [
      draft.recipientUserId,
      [draft.type, draft.organizationId, draft.senderUserId],
    ])
  );
};
const storedContent = () =>
  (
    storage.createCommentWithNotifications.mock.calls[0]?.[0] ??
    storage.createComment.mock.calls[0]?.[0]
  )?.content;

describe('comment notifications', () => {
  it('a top-level comment on a page notifies its recorded creator, for the page organization', async () => {
    const res = await post(A, { content: 'Looks good' });
    expect(res.status).toBe(201);
    expect(written()).toEqual({ [B]: ['comment', ORG, A] });
    const draft = storage.createCommentWithNotifications.mock.calls[0][1][0];
    expect(draft).toMatchObject({
      relatedPageId: PAGE_ID,
      isRead: false,
      content: 'Looks good',
    });
    expect(draft.title).toContain('Ann Author');
    expect(draft.title).toContain('Roadmap');
  });

  it('a page without a recorded creator notifies no one as creator, and the author text decides nothing', async () => {
    page = { ...page, createdByUserId: null, author: accounts[B].email };
    const res = await post(A, { content: 'Hello' });
    expect(res.status).toBe(201);
    expect(storage.createCommentWithNotifications).not.toHaveBeenCalled();
    expect(storage.createComment).toHaveBeenCalledTimes(1);
  });

  it('nobody is notified about their own comment', async () => {
    const res = await post(B, { content: `note to self [[user:${B}]]` });
    expect(res.status).toBe(201);
    expect(storage.createCommentWithNotifications).not.toHaveBeenCalled();
    // The self-mention is still a live token.
    expect(storedContent()).toBe(`note to self [[user:${B}]]`);
  });

  it('a mention notifies the mentioned member, and the creator on a top-level comment', async () => {
    const res = await post(A, { content: `ask [[user:${C}]] about it` });
    expect(res.status).toBe(201);
    expect(written()).toEqual({ [C]: ['mention', ORG, A], [B]: ['comment', ORG, A] });
    expect(storedContent()).toBe(`ask [[user:${C}]] about it`);
    const mention = storage.createCommentWithNotifications.mock.calls[0][1].find(
      (draft: any) => draft.recipientUserId === C
    );
    // The token is shown as the display name, never as an email.
    expect(mention.content).toBe('ask @Cy Mentioned about it');
    expect(JSON.stringify(mention)).not.toContain('@example.com');
  });

  it('a mentioned member who may only view the page is notified', async () => {
    storage.checkPagePermission.mockImplementation(async (id: number) => accounts[id]?.org === ORG);
    const res = await post(A, { content: `fyi [[user:${D}]]` });
    expect(res.status).toBe(201);
    expect(written()[D]).toEqual(['mention', ORG, A]);
  });

  it.each([
    ['an account of another organization', H],
    ['a member who cannot read the page', E],
    ['a removed member', F],
    ['a deactivated account', G],
    ['an unknown account', 9999],
  ])(
    'a forged mention of %s notifies no one and is not stored as a live token',
    async (_label, id) => {
      page = { ...page, createdByUserId: null };
      const res = await post(A, { content: `hey [[user:${id}]]!` });
      expect(res.status).toBe(201);
      expect(storage.createCommentWithNotifications).not.toHaveBeenCalled();
      expect(storedContent()).toBe('hey @unknown!');
      // Nothing about the target comes back.
      const body = JSON.stringify(res.body);
      for (const [accountId, account] of Object.entries(accounts)) {
        if (Number(accountId) === A) continue; // the commenter's own comment names its author
        expect(body).not.toContain(account.name);
        expect(body).not.toContain(account.email);
      }
    }
  );

  it('an invalid mention is dropped while a valid one in the same comment still notifies', async () => {
    const res = await post(A, { content: `[[user:${H}]] and [[user:${C}]]` });
    expect(res.status).toBe(201);
    expect(Object.keys(written()).sort()).toEqual([String(B), String(C)].sort());
    expect(storedContent()).toBe(`@unknown and [[user:${C}]]`);
  });

  describe('a commenter outside the page organization (publicly shared page)', () => {
    beforeEach(() => {
      publicPage = true;
    });

    it('mentions nobody: the stored text and the answer are the same whatever the ids were', async () => {
      const eligible = await post(H, { content: `hi [[user:${C}]] [[user:${A}]]` });
      const stored1 = storedContent();
      storage.createCommentWithNotifications.mockClear();
      storage.createComment.mockClear();
      const ineligible = await post(H, { content: `hi [[user:${E}]] [[user:${G}]]` });
      const stored2 = storedContent();
      storage.createCommentWithNotifications.mockClear();
      storage.createComment.mockClear();
      const unknown = await post(H, { content: 'hi [[user:9999]] [[user:9998]]' });
      for (const res of [eligible, ineligible, unknown]) {
        expect(res.status).toBe(201);
        expect(res.body.content).toBe('hi @unknown @unknown');
      }
      expect(stored1).toBe('hi @unknown @unknown');
      expect(stored2).toBe('hi @unknown @unknown');
      expect(JSON.stringify([eligible.body, ineligible.body, unknown.body])).not.toContain('user:');
    });

    it('sends no mention notification, while the page creator is still told of a top-level comment', async () => {
      const res = await post(H, {
        content: `hi [[user:${C}]] [[user:${A}]] [[user:${F}]] [[user:${G}]]`,
      });
      expect(res.status).toBe(201);
      expect(written()).toEqual({ [B]: ['comment', ORG, H] });
    });

    it('still notifies the thread of a reply by the usual rules', async () => {
      threadRows = [{ id: 1, parentId: null, authorUserId: C }];
      const res = await post(H, { content: `[[user:${D}]]`, parentId: 1 });
      expect(res.status).toBe(201);
      expect(written()).toEqual({ [C]: ['reply', ORG, H] });
    });

    it('an edit keeps no token and notifies nobody', async () => {
      storage.getComment.mockResolvedValue({
        id: 1,
        pageId: PAGE_ID,
        authorUserId: H,
        content: 'x',
      });
      storage.updateComment.mockImplementation(async (id: number, data: any) => ({ id, ...data }));
      const eligible = await request(app)
        .put('/api/comments/1')
        .set(as(H))
        .send({ content: `[[user:${C}]]` });
      const unknown = await request(app)
        .put('/api/comments/1')
        .set(as(H))
        .send({ content: '[[user:9999]]' });
      expect(eligible.status).toBe(200);
      expect(eligible.body).toEqual(unknown.body);
      expect(storage.updateComment).toHaveBeenCalledWith(1, { content: '@unknown' });
      expect(storage.updateCommentWithNotifications).not.toHaveBeenCalled();
    });
  });

  it('the notification belongs to the page organization, not the commenter', async () => {
    publicPage = true;
    page = { ...page, organizationId: OTHER_ORG, createdByUserId: H };
    const res = await post(A, { content: 'visiting' });
    expect(res.status).toBe(201);
    // H is the creator and a member of OTHER_ORG: notified there. Nobody of ORG is addressed.
    expect(written()).toEqual({ [H]: ['comment', OTHER_ORG, A] });
  });

  it('a removed creator is not notified', async () => {
    page = { ...page, createdByUserId: F };
    const res = await post(A, { content: 'anyone there?' });
    expect(res.status).toBe(201);
    expect(storage.createCommentWithNotifications).not.toHaveBeenCalled();
  });

  describe('replies', () => {
    beforeEach(() => {
      threadRows = [
        { id: 1, parentId: null, authorUserId: C },
        { id: 2, parentId: 1, authorUserId: D },
        { id: 3, parentId: 1, authorUserId: null },
        { id: 4, parentId: null, authorUserId: E },
      ];
    });

    it('notify the thread participants by account, not the commenter or the page creator', async () => {
      const res = await post(A, { content: 'thanks', parentId: 1 });
      expect(res.status).toBe(201);
      expect(written()).toEqual({ [C]: ['reply', ORG, A], [D]: ['reply', ORG, A] });
    });

    it('a participant who can no longer read the page, or was removed, gets nothing', async () => {
      threadRows.push(
        { id: 5, parentId: 1, authorUserId: F },
        { id: 6, parentId: 1, authorUserId: E }
      );
      const res = await post(A, { content: 'thanks', parentId: 1 });
      expect(res.status).toBe(201);
      expect(Object.keys(written()).sort()).toEqual([String(C), String(D)].sort());
    });

    it('a mention in a reply wins over being a participant', async () => {
      const res = await post(A, { content: `[[user:${C}]] see above`, parentId: 1 });
      expect(res.status).toBe(201);
      expect(written()).toEqual({ [C]: ['mention', ORG, A], [D]: ['reply', ORG, A] });
    });

    it('a reply to a comment of another page is refused and writes nothing', async () => {
      storage.getComment.mockResolvedValue({ id: 77, pageId: 999, authorUserId: C });
      const res = await post(A, { content: 'x', parentId: 77 });
      expect(res.status).toBe(400);
      expect(storage.createComment).not.toHaveBeenCalled();
      expect(storage.createCommentWithNotifications).not.toHaveBeenCalled();
    });

    it('a reply to an unknown comment is refused', async () => {
      const res = await post(A, { content: 'x', parentId: 12345 });
      expect(res.status).toBe(400);
      expect(storage.createComment).not.toHaveBeenCalled();
    });
  });

  describe('a failure to notify never loses the comment', () => {
    it('when the notifications could not be written', async () => {
      storage.createCommentWithNotifications.mockImplementation(async (data: any) => ({
        comment: { id: 500, ...data },
        notifications: [],
        notificationsFailed: true,
      }));
      const res = await post(A, { content: 'still posted' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 500, content: 'still posted' });
    });

    it('when the recipients of a member comment cannot be worked out: 503, nothing stored', async () => {
      storage.getReadableOrganizationMembers.mockRejectedValue(new Error('db down'));
      const res = await post(A, { content: `hi [[user:${C}]]` });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        message: 'Comments are temporarily unavailable. Please try again.',
      });
      expect(storage.createComment).not.toHaveBeenCalled();
      expect(storage.createCommentWithNotifications).not.toHaveBeenCalled();
    });

    it('when the recipients of an outsider comment cannot be worked out: stored without mentions', async () => {
      publicPage = true;
      storage.getReadableOrganizationMembers.mockRejectedValue(new Error('db down'));
      const res = await post(H, { content: `hi [[user:${C}]]` });
      expect(res.status).toBe(201);
      expect(storedContent()).toBe('hi @unknown');
    });

    it('logs no comment text when planning fails', async () => {
      const lines: string[] = [];
      const spy = vi.spyOn(logger, 'error').mockImplementation(((...args: unknown[]) => {
        lines.push(JSON.stringify(args));
        return logger;
      }) as any);
      storage.getReadableOrganizationMembers.mockRejectedValue(
        new Error('Failed query: params: secret comment text')
      );
      await post(A, { content: `secret comment text [[user:${C}]]` });
      spy.mockRestore();
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('')).not.toContain('secret comment text');
    });
  });

  it('comment creation still needs a session', async () => {
    const res = await request(app).post(`/api/pages/${PAGE_ID}/comments`).send({ content: 'x' });
    expect(res.status).toBe(401);
    expect(storage.createComment).not.toHaveBeenCalled();
    expect(storage.createCommentWithNotifications).not.toHaveBeenCalled();
  });

  it('a person cannot create a reply notification through the notifications API', async () => {
    storage.getNotificationRecipientOrganizationId.mockResolvedValue(ORG);
    const res = await request(app)
      .post('/api/notifications')
      .set(as(A))
      .send({ type: 'reply', title: 't', content: 'c', recipientUserId: B });
    expect(res.status).toBe(400);
    expect(storage.createNotification).not.toHaveBeenCalled();
  });
});

describe('comment list with mentions', () => {
  it('names a mention only for a member of the page organization who may read the page', async () => {
    storage.getCommentsByPageId.mockResolvedValue([
      { id: 1, content: `a [[user:${C}]] b [[user:${E}]] c [[user:${H}]]`, pageId: PAGE_ID },
      { id: 2, content: 'plain', pageId: PAGE_ID },
    ]);
    const res = await request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(A));
    expect(res.status).toBe(200);
    expect(res.body[0].mentions).toEqual([{ userId: C, name: 'Cy Mentioned' }]);
    expect(res.body[1]).not.toHaveProperty('mentions');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Ed Blocked');
    expect(body).not.toContain('Hal Outsider');
    expect(body).not.toContain('@example.com');
  });

  it('gives an outsider and a signed-out reader no names and no tokens, whatever the ids', async () => {
    publicPage = true;
    storage.getCommentsByPageId.mockResolvedValue([
      { id: 1, content: `a [[user:${C}]] b [[user:${E}]] c [[user:9999]]`, pageId: PAGE_ID },
      { id: 2, content: 'plain', pageId: PAGE_ID },
    ]);
    for (const res of [
      await request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(H)),
      await request(app).get(`/api/pages/${PAGE_ID}/comments`),
      await request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(G)),
    ]) {
      expect(res.status).toBe(200);
      expect(res.body[0].content).toBe('a @unknown b @unknown c @unknown');
      expect(res.body[0]).not.toHaveProperty('mentions');
      expect(JSON.stringify(res.body)).not.toContain('Cy Mentioned');
    }
    expect(storage.getReadableOrganizationMembers).not.toHaveBeenCalled();
  });

  it('names nobody when the lookup fails', async () => {
    storage.getCommentsByPageId.mockResolvedValue([
      { id: 1, content: `a [[user:${C}]]`, pageId: PAGE_ID },
    ]);
    storage.getReadableOrganizationMembers.mockRejectedValue(new Error('db down'));
    const res = await request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(A));
    expect(res.status).toBe(200);
    expect(res.body[0].mentions).toEqual([]);
  });
});

describe('editing a comment', () => {
  beforeEach(() => {
    storage.updateComment.mockImplementation(async (id: number, data: any) => ({ id, ...data }));
    storage.updateCommentWithNotifications.mockImplementation(
      async (id: number, data: any, drafts: any[]) => ({
        comment: { id, ...data },
        notifications: drafts.map((draft, index) => ({ id: 700 + index, ...draft })),
        notificationsFailed: false,
      })
    );
  });
  const existing = (content: string) =>
    storage.getComment.mockResolvedValue({ id: 1, pageId: PAGE_ID, authorUserId: A, content });
  const edit = (content: string) =>
    request(app).put('/api/comments/1').set(as(A)).send({ content });

  it('keeps only mention tokens that name a current reader of the page', async () => {
    existing('x');
    const res = await edit(`[[user:${C}]] [[user:${H}]]`);
    expect(res.status).toBe(200);
    expect(storage.updateCommentWithNotifications.mock.calls[0][1]).toEqual({
      content: `[[user:${C}]] @unknown`,
    });
  });

  it('notifies an eligible member the edit newly mentions, once, as a mention', async () => {
    existing('x');
    const res = await edit(`see [[user:${C}]]`);
    expect(res.status).toBe(200);
    const drafts = storage.updateCommentWithNotifications.mock.calls[0][2];
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      type: 'mention',
      recipientUserId: C,
      organizationId: ORG,
      senderUserId: A,
      content: 'see @Cy Mentioned',
    });
  });

  it('does not notify again for a token that was already there, nor for the editor, nor an edit without mentions', async () => {
    existing(`old [[user:${C}]]`);
    const again = await edit(`new words [[user:${C}]] [[user:${A}]]`);
    expect(again.status).toBe(200);
    expect(storage.updateCommentWithNotifications).not.toHaveBeenCalled();
    const plain = await edit('just text');
    expect(plain.status).toBe(200);
    expect(storage.updateCommentWithNotifications).not.toHaveBeenCalled();
    expect(storage.createNotification).not.toHaveBeenCalled();
  });

  it('notifies nobody for an added mention of someone who cannot read the page', async () => {
    existing('x');
    const res = await edit(`[[user:${E}]] [[user:${F}]]`);
    expect(res.status).toBe(200);
    expect(storage.updateCommentWithNotifications).not.toHaveBeenCalled();
    expect(storage.updateComment).toHaveBeenCalledWith(1, { content: '@unknown @unknown' });
  });

  it('answers 503 and stores nothing when the recipients cannot be worked out', async () => {
    existing('x');
    storage.getReadableOrganizationMembers.mockRejectedValue(new Error('db down'));
    const res = await edit(`[[user:${C}]]`);
    expect(res.status).toBe(503);
    expect(storage.updateComment).not.toHaveBeenCalled();
    expect(storage.updateCommentWithNotifications).not.toHaveBeenCalled();
  });
});

describe('mention picker', () => {
  const search = (who: number, q?: string) =>
    request(app)
      .get(`/api/pages/${PAGE_ID}/mention-candidates`)
      .query(q === undefined ? {} : { q })
      .set(as(who));

  it('answers what storage found, for a member of the page organization', async () => {
    storage.listMentionCandidates.mockResolvedValue({
      candidates: [{ id: C, name: 'Cy Mentioned' }],
      more: false,
      truncated: true,
    });
    const res = await search(A, 'cy');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      candidates: [{ id: C, name: 'Cy Mentioned' }],
      more: false,
      truncated: true,
    });
    expect(storage.listMentionCandidates).toHaveBeenCalledWith(ORG, PAGE_ID, 'cy', A);
  });

  it('refuses an account of another organization even on a publicly shared page', async () => {
    publicPage = true;
    const res = await search(H, 'cy');
    expect(res.status).toBe(403);
    expect(storage.listMentionCandidates).not.toHaveBeenCalled();
  });

  it('refuses a deactivated caller, a signed-out caller and an over-long search', async () => {
    // a deactivated account has no session: refused as signed out
    expect((await search(G, 'cy')).status).toBe(401);
    expect((await request(app).get(`/api/pages/${PAGE_ID}/mention-candidates?q=cy`)).status).toBe(
      401
    );
    expect((await search(A, 'x'.repeat(101))).status).toBe(400);
    expect(storage.listMentionCandidates).not.toHaveBeenCalled();
  });

  it('refuses a caller who may not comment on the page', async () => {
    const res = await search(E, 'cy');
    expect(res.status).toBe(403);
    expect(storage.listMentionCandidates).not.toHaveBeenCalled();
  });
});
