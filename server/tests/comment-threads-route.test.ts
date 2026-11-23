/**
 * Route rules of block-anchored comment threads and resolve / reopen (WP15). The SQL side is
 * proven by tests/integration-layer4/comment-threads.test.ts and the whole path by
 * tests/comment-block-threads.spec.ts.
 *
 * Rules under test, with ENFORCE_AUTH_WRITES on and off:
 * - a thread may be anchored to a block id present in the page's stored blocks; an unknown id,
 *   a non-string id, an over-long id, and a reply that carries one are refused with 400, and
 *   nothing is stored;
 * - the excerpt comes from the stored block (at most 200 characters), never from the request;
 * - a body cannot set resolved state or the resolver on create or on edit;
 * - resolve and reopen need a session and the right to comment on the page: a viewer is 403,
 *   an account that cannot read the page gets the answer of an unknown comment (404), a page in
 *   the trash is 404, a reply is 400, an unknown comment is 404;
 * - resolving twice keeps who resolved it and when; reopening an open thread changes nothing;
 * - neither sends a notification;
 * - a page saved without blocks offers the blocks seeded from its content (the same ids on every
 *   request): a thread may be anchored to one of them, and it still exists in the listing;
 * - an edit changes the text only: page, thread, anchor and resolved state are not taken from the body;
 * - the page access answer says who may comment (editor and owner, commenter: yes; viewer: no);
 * - the listing carries the anchor, the resolved state and the resolver by name only, replies
 *   take their thread's, and whether the anchored block still exists comes from the page's
 *   current blocks.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'comment-threads-secret',
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
}));
vi.mock('../config', () => ({ config: mockConfig }));
vi.mock('../features', () => ({
  featureFlags: { PAPYR_MODE: 'team', FEATURE_TEAMS: true, FEATURE_NOTIFICATIONS: true },
  isFeatureEnabled: () => true,
}));
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';
const s: any = storage;

const PAGE_ID = 10;
const OWNER = 1;
const COMMENTER = 2;
const VIEWER = 3;
const OUTSIDER = 4;
const EDITOR = 5;
const LEVELS = ['viewer', 'commenter', 'editor', 'owner'];
const levelOf: Record<number, string | null> = {
  [OWNER]: 'owner',
  [COMMENTER]: 'commenter',
  [VIEWER]: 'viewer',
  [OUTSIDER]: null,
  [EDITOR]: 'editor',
};
const as = (id: number) => ({
  Cookie: [
    `accessToken=${jwt.sign({ id, email: `u${id}@example.com`, role: 'user' }, 'comment-threads-secret')}`,
  ],
});

let app: Express;
let server: http.Server;
let page: Record<string, any> | undefined;
let rows: Array<Record<string, any>>;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const base = (over: Record<string, any>) => ({
  content: 'c',
  author: 'Ann',
  authorUserId: OWNER,
  pageId: PAGE_ID,
  parentId: null,
  blockId: null,
  blockExcerpt: null,
  resolvedAt: null,
  resolvedByUserId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe.each([true, false])('block threads with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mockConfig.enforceAuthForWrites = enforce;
    vi.resetAllMocks();
    page = {
      id: PAGE_ID,
      title: 'Roadmap',
      teamId: null,
      organizationId: 1,
      createdByUserId: null,
      blocks: [
        { id: 'b1', type: 'paragraph', content: 'First   block\n text' },
        { id: 'b2', type: 'paragraph', content: 'x'.repeat(500) },
      ],
    };
    rows = [];
    s.getUserAccount.mockImplementation(async (id: number) => ({
      id,
      email: `u${id}@example.com`,
      isActive: true,
    }));
    s.getUserOrganizationId.mockResolvedValue(1);
    s.checkPagePermission.mockImplementation(
      async (id: number | undefined, _page: number, needed: string) => {
        const have = id === undefined ? null : levelOf[id];
        return have !== null && LEVELS.indexOf(have) >= LEVELS.indexOf(needed);
      }
    );
    s.getWikiPage.mockImplementation(async () => page);
    s.getComment.mockImplementation(async (id: number) => rows.find((row) => row.id === id));
    s.createComment.mockImplementation(async (data: any) => ({ id: 500, ...data }));
    s.getCommentsByPageId.mockImplementation(async () => rows);
    s.getAccountDisplayName.mockImplementation(async (id: number) => `Name ${id}`);
    s.setCommentResolved.mockImplementation(async (id: number, by: number | null) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return undefined;
      if (by === null) {
        row.resolvedAt = null;
        row.resolvedByUserId = null;
      } else if (row.resolvedAt === null) {
        row.resolvedAt = new Date('2026-02-02T00:00:00Z');
        row.resolvedByUserId = by;
      }
      return row;
    });
  });

  const post = (who: number, body: Record<string, unknown>) =>
    request(app).post(`/api/pages/${PAGE_ID}/comments`).set(as(who)).send(body);

  describe('anchoring a thread to a block', () => {
    it('stores the block id and an excerpt taken from the stored block', async () => {
      const res = await post(COMMENTER, {
        content: 'on b1',
        blockId: 'b1',
        blockExcerpt: 'forged excerpt',
      });
      expect(res.status).toBe(201);
      expect(s.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ blockId: 'b1', blockExcerpt: 'First block text' })
      );
      expect(res.body.blockExcerpt).toBe('First block text');
    });

    it('keeps at most 200 characters of the block text', async () => {
      const res = await post(COMMENTER, { content: 'long', blockId: 'b2' });
      expect(res.status).toBe(201);
      expect(s.createComment.mock.calls[0][0].blockExcerpt).toHaveLength(200);
    });

    it('refuses a block id the page does not have, and stores nothing', async () => {
      const res = await post(COMMENTER, { content: 'x', blockId: 'nope' });
      expect(res.status).toBe(400);
      expect(s.createComment).not.toHaveBeenCalled();
    });

    it.each([[42], [['b1']], [{ id: 'b1' }], [''], ['b'.repeat(201)]])(
      'refuses the block id %j',
      async (blockId) => {
        const res = await post(COMMENTER, { content: 'x', blockId });
        expect(res.status).toBe(400);
        expect(s.createComment).not.toHaveBeenCalled();
      }
    );

    it('refuses a reply that carries a block id', async () => {
      rows = [base({ id: 7 })];
      const res = await post(COMMENTER, { content: 'x', parentId: 7, blockId: 'b1' });
      expect(res.status).toBe(400);
      expect(s.createComment).not.toHaveBeenCalled();
    });

    it('a comment without a block id stays page-level', async () => {
      const res = await post(COMMENTER, { content: 'page level' });
      expect(res.status).toBe(201);
      expect(s.createComment.mock.calls[0][0].blockId ?? null).toBeNull();
      expect(s.createComment.mock.calls[0][0].blockExcerpt ?? null).toBeNull();
    });

    it('a body cannot set the resolved state on create', async () => {
      const res = await post(COMMENTER, {
        content: 'x',
        resolvedAt: '2026-01-01T00:00:00Z',
        resolvedByUserId: OWNER,
      });
      expect(res.status).toBe(201);
      const stored = s.createComment.mock.calls[0][0];
      expect(stored.resolvedAt ?? null).toBeNull();
      expect(stored.resolvedByUserId ?? null).toBeNull();
    });

    it('a viewer cannot comment on a block', async () => {
      const res = await post(VIEWER, { content: 'x', blockId: 'b1' });
      expect(res.status).toBe(403);
      expect(s.createComment).not.toHaveBeenCalled();
    });

    it('a page in the trash takes no block comment', async () => {
      page = undefined;
      const res = await post(COMMENTER, { content: 'x', blockId: 'b1' });
      expect(res.status).toBe(404);
    });

    it('an edit changes the text only: page, thread, anchor and resolved state come from storage', async () => {
      rows = [base({ id: 7, authorUserId: COMMENTER, blockId: 'b1', blockExcerpt: 'e' })];
      s.updateComment.mockImplementation(async (_id: number, data: any) => ({
        id: 7,
        resolvedByUserId: 9,
        ...data,
      }));
      const res = await request(app).put('/api/comments/7').set(as(COMMENTER)).send({
        content: 'edited',
        pageId: 99,
        parentId: 8,
        blockId: 'b2',
        blockExcerpt: 'z',
        resolvedAt: '2026-01-01',
        resolvedByUserId: COMMENTER,
      });
      expect(res.status).toBe(200);
      expect(s.updateComment).toHaveBeenCalledWith(7, { content: 'edited' });
      expect(res.body).not.toHaveProperty('resolvedByUserId');
    });

    it('the answer to a new comment does not carry the resolver account id', async () => {
      const res = await post(COMMENTER, { content: 'x' });
      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('resolvedByUserId');
    });
  });

  describe('a page saved without blocks', () => {
    beforeEach(() => {
      page = { ...page, blocks: [], content: 'Alpha line\n\nBeta line' };
    });

    it('may be anchored to a block seeded from its content, with the same id on every request', async () => {
      const first = await post(COMMENTER, { content: 'a', blockId: `block_seed_${PAGE_ID}_1` });
      const second = await post(COMMENTER, { content: 'b', blockId: `block_seed_${PAGE_ID}_1` });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.blockExcerpt).toBe('Beta line');
      expect(second.body.blockExcerpt).toBe('Beta line');
    });

    it('refuses a seeded id the content does not produce', async () => {
      const res = await post(COMMENTER, { content: 'a', blockId: `block_seed_${PAGE_ID}_7` });
      expect(res.status).toBe(400);
      expect(s.createComment).not.toHaveBeenCalled();
    });

    it('a thread on a seeded block is not attached to the block that took its place when the content shifts', async () => {
      rows = [base({ id: 7, blockId: `block_seed_${PAGE_ID}_1`, blockExcerpt: 'Beta line' })];
      const list = () => request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(VIEWER));
      expect((await list()).body[0]).toMatchObject({ blockExists: true });
      // A paragraph is put first by a content-only update: seeded id _1 now names "Alpha line".
      page = { ...page, content: 'New first\n\nAlpha line\n\nBeta line' };
      expect((await list()).body[0]).toMatchObject({
        blockId: `block_seed_${PAGE_ID}_1`,
        blockExcerpt: 'Beta line',
        blockExists: false,
      });
      // A seeded id past the end of the shifted content is gone as well.
      page = { ...page, content: 'Only one' };
      expect((await list()).body[0]).toMatchObject({ blockExists: false });
    });

    it('lists the thread as anchored to an existing block', async () => {
      rows = [base({ id: 7, blockId: `block_seed_${PAGE_ID}_0`, blockExcerpt: 'Alpha line' })];
      const res = await request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(VIEWER));
      expect(res.body[0]).toMatchObject({ blockExists: true });
    });
  });

  describe('GET /api/pages/:id/access', () => {
    it.each([
      ['an owner', OWNER, { canEdit: true, canComment: true }],
      ['an editor', EDITOR, { canEdit: true, canComment: true }],
      ['a commenter', COMMENTER, { canEdit: false, canComment: true }],
      ['a viewer', VIEWER, { canEdit: false, canComment: false }],
    ])('tells %s what they may do', async (_label, who, expected) => {
      const res = await request(app).get(`/api/pages/${PAGE_ID}/access`).set(as(who));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expected);
    });
  });

  describe.each([
    ['resolve', 'resolve'],
    ['reopen', 'reopen'],
  ])('%s', (_label, action) => {
    const call = (who: number | null, id = 7) => {
      const req = request(app).post(`/api/comments/${id}/${action}`);
      return who === null ? req : req.set(as(who));
    };
    beforeEach(() => {
      rows = [
        base({
          id: 7,
          resolvedAt: action === 'reopen' ? new Date('2026-02-01T00:00:00Z') : null,
          resolvedByUserId: action === 'reopen' ? OWNER : null,
        }),
        base({ id: 8, parentId: 7 }),
      ];
    });

    it('a commenter may', async () => {
      const res = await call(COMMENTER);
      expect(res.status).toBe(200);
      expect(s.setCommentResolved).toHaveBeenCalledWith(7, action === 'resolve' ? COMMENTER : null);
    });

    it('an editor and an owner may', async () => {
      expect((await call(OWNER)).status).toBe(200);
    });

    it('a viewer is refused and nothing changes', async () => {
      const res = await call(VIEWER);
      expect(res.status).toBe(403);
      expect(s.setCommentResolved).not.toHaveBeenCalled();
    });

    it('an account that cannot read the page is answered as for an unknown comment', async () => {
      const res = await call(OUTSIDER);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Comment not found' });
      expect(s.setCommentResolved).not.toHaveBeenCalled();
    });

    it('a caller without a session is refused', async () => {
      const res = await call(null);
      expect(res.status).toBe(401);
      expect(s.setCommentResolved).not.toHaveBeenCalled();
    });

    it('a comment of a page in the trash is not changed', async () => {
      page = undefined;
      const res = await call(COMMENTER);
      expect(res.status).toBe(404);
      expect(s.setCommentResolved).not.toHaveBeenCalled();
    });

    it('a reply cannot be changed on its own', async () => {
      const res = await call(COMMENTER, 8);
      expect(res.status).toBe(400);
      expect(s.setCommentResolved).not.toHaveBeenCalled();
    });

    it('an unknown comment is 404', async () => {
      expect((await call(COMMENTER, 999)).status).toBe(404);
    });

    it.each(['abc', '0', '-1', '1.5'])('the id %j is refused', async (id) => {
      const res = await request(app).post(`/api/comments/${id}/${action}`).set(as(COMMENTER));
      expect(res.status).toBe(400);
    });

    it('sends no notification', async () => {
      await call(COMMENTER);
      expect(s.createNotification).not.toHaveBeenCalled();
      expect(s.createCommentWithNotifications).not.toHaveBeenCalled();
    });
  });

  it('resolving a resolved thread keeps who resolved it and when', async () => {
    rows = [base({ id: 7 })];
    const first = await request(app).post('/api/comments/7/resolve').set(as(COMMENTER));
    const second = await request(app).post('/api/comments/7/resolve').set(as(OWNER));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.resolvedAt).toBe(first.body.resolvedAt);
    expect(rows[0].resolvedByUserId).toBe(COMMENTER);
  });

  it('reopening an open thread answers 200 and it stays open', async () => {
    rows = [base({ id: 7 })];
    const res = await request(app).post('/api/comments/7/reopen').set(as(COMMENTER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 7, resolvedAt: null, resolvedBy: null });
  });

  describe('listing', () => {
    it('carries the anchor, the resolved state and the resolver by name only', async () => {
      rows = [
        base({
          id: 7,
          blockId: 'b1',
          blockExcerpt: 'First block text',
          resolvedAt: new Date('2026-02-01T00:00:00Z'),
          resolvedByUserId: COMMENTER,
          resolvedByName: 'Cy Commenter',
        }),
        base({ id: 8, parentId: 7 }),
        base({ id: 9 }),
      ];
      const res = await request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(VIEWER));
      expect(res.status).toBe(200);
      const [thread, reply, plain] = res.body;
      expect(thread).toMatchObject({
        blockId: 'b1',
        blockExcerpt: 'First block text',
        resolvedBy: 'Cy Commenter',
        blockExists: true,
      });
      expect(thread.resolvedAt).toBe('2026-02-01T00:00:00.000Z');
      // A reply is listed with its thread's anchor and state.
      expect(reply).toMatchObject({ blockId: 'b1', resolvedBy: 'Cy Commenter', blockExists: true });
      expect(plain).toMatchObject({
        blockId: null,
        blockExcerpt: null,
        resolvedAt: null,
        resolvedBy: null,
        blockExists: false,
      });
      for (const comment of res.body) {
        expect(comment).not.toHaveProperty('resolvedByUserId');
        expect(comment).not.toHaveProperty('resolvedByName');
      }
    });

    it('says the anchored block is gone once it is no longer among the page blocks', async () => {
      rows = [base({ id: 7, blockId: 'gone', blockExcerpt: 'old text' })];
      const res = await request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(VIEWER));
      expect(res.body[0]).toMatchObject({
        blockId: 'gone',
        blockExcerpt: 'old text',
        blockExists: false,
      });
    });

    it('a resolver whose account is gone is shown as Unknown User', async () => {
      rows = [
        base({
          id: 7,
          resolvedAt: new Date('2026-02-01T00:00:00Z'),
          resolvedByUserId: null,
          resolvedByName: null,
        }),
      ];
      const res = await request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(VIEWER));
      expect(res.body[0].resolvedBy).toBe('Unknown User');
    });

    it('an account that cannot read the page gets no comments', async () => {
      rows = [base({ id: 7, blockId: 'b1', blockExcerpt: 'secret text' })];
      const res = await request(app).get(`/api/pages/${PAGE_ID}/comments`).set(as(OUTSIDER));
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('secret text');
    });
  });
});
