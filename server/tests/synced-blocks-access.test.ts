/**
 * /api/synced-blocks: a synced block belongs to a page (`page_id`). Creating one needs editor on
 * that page, reading one needs viewer on its page, updating or deleting one needs editor. Unknown
 * ids and blocks on missing, trashed or unreadable pages answer the same 404. The picker list is
 * the storage's page-list rule (proven on real Postgres in
 * tests/integration-layer4/synced-blocks-storage.test.ts). Bodies are validated and errors never
 * leak internals.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'synced-blocks-secret';

const testConfig = vi.hoisted(() => ({
  jwtSecret: 'synced-blocks-secret',
  adminPassword: 'test-admin',
  adminEmails: [],
  enforceAuthForWrites: true,
  allowAdminPassword: false,
  rateLimitEnabled: false,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 1000,
  adminIpWhitelist: [],
  port: 5001,
  host: '0.0.0.0',
  isProduction: false,
  isReplit: false,
}));

vi.mock('../config', () => ({ config: testConfig }));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage';

const USER_ID = 7;
const token = jwt.sign({ id: USER_ID, email: 'user@example.com', role: 'user' }, TEST_SECRET);

// Pages: 10 editable by the caller, 20 readable only (also by anonymous callers), 30 unreadable,
// 40 trashed (not live).
const LEVELS = { viewer: 1, commenter: 2, editor: 3, owner: 4 } as const;
const callerLevel: Record<number, number> = { 10: 3, 20: 1, 30: 0, 40: 3 };
const anonymousLevel: Record<number, number> = { 20: 1 };
const livePages = new Set([10, 20, 30]);

const content = [{ id: 'b1', type: 'paragraph', content: 'Shared text' }];
const block = (originalBlockId: string, pageId: number) => ({
  id: pageId + 1,
  originalBlockId,
  pageId,
  content,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});
const blocks: Record<string, ReturnType<typeof block>> = {
  synced_editable: block('synced_editable', 10),
  synced_readonly: block('synced_readonly', 20),
  synced_hidden: block('synced_hidden', 30),
  synced_trashed: block('synced_trashed', 40),
};
// Readable: synced_editable (editor) and synced_readonly (viewer). Hidden: a block on an
// unreadable page, one on a trashed page and an unknown id; all three must answer exactly alike.
const HIDDEN_BLOCKS = ['synced_hidden', 'synced_trashed', 'synced_unknown'];
const NOT_FOUND = { message: 'Synced block not found' };
const PAGE_NOT_FOUND = { message: 'Page not found' };

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  const s = storage as any;
  s.getWikiPage.mockImplementation(async (id: number) =>
    livePages.has(id) ? { id, title: `Page ${id}`, teamId: null } : undefined
  );
  s.checkPagePermission.mockImplementation(
    async (userId: number | undefined, pageId: number, level: keyof typeof LEVELS) =>
      ((userId === USER_ID ? callerLevel : userId === undefined ? anonymousLevel : {})[pageId] ??
        0) >= LEVELS[level]
  );
  s.getSyncedBlock.mockImplementation(async (id: string) => blocks[id]);
  s.createSyncedBlock.mockImplementation(async (pageId: number, id: string, body: unknown[]) => ({
    ...block(id, pageId),
    content: body,
  }));
  s.updateSyncedBlockContent.mockImplementation(async (id: string, body: unknown[]) => ({
    ...blocks[id],
    content: body,
  }));
  s.deleteSyncedBlock.mockResolvedValue(true);
  s.getPageViewer.mockImplementation(async (userId?: number) =>
    userId ? { userId, email: 'user@example.com', teamIds: [3] } : { teamIds: [] }
  );
});

afterEach(() => {
  testConfig.enforceAuthForWrites = true;
});

afterAll((done) => {
  server.close(done);
});

const asUser = (req: request.Test) => req.set('Cookie', [`accessToken=${token}`]);
const api = {
  get: (url: string) => asUser(request(app).get(url)),
  post: (url: string, body?: object) => asUser(request(app).post(url)).send(body ?? {}),
  patch: (url: string, body?: object) => asUser(request(app).patch(url)).send(body ?? {}),
  delete: (url: string) => asUser(request(app).delete(url)),
};
const anonymous = {
  get: (url: string) => request(app).get(url),
  post: (url: string, body?: object) =>
    request(app)
      .post(url)
      .send(body ?? {}),
  patch: (url: string, body?: object) =>
    request(app)
      .patch(url)
      .send(body ?? {}),
  delete: (url: string) => request(app).delete(url),
};

const expectNoWrites = () => {
  const s = storage as any;
  expect(s.createSyncedBlock).not.toHaveBeenCalled();
  expect(s.updateSyncedBlockContent).not.toHaveBeenCalled();
  expect(s.deleteSyncedBlock).not.toHaveBeenCalled();
};

const newContent = [{ id: 'b2', type: 'heading1', content: 'Changed' }];

describe('creating a synced block needs editor on its page', () => {
  const create = (pageId: unknown, originalBlockId = 'synced_new') =>
    api.post('/api/synced-blocks', { pageId, originalBlockId, content });

  it('creates the block on the page for an editor', async () => {
    const response = await create(10);
    expect(response.status).toBe(201);
    expect(storage.createSyncedBlock).toHaveBeenCalledWith(10, 'synced_new', content);
    expect(response.body).toMatchObject({ originalBlockId: 'synced_new', pageId: 10, content });
  });

  it('is forbidden to a viewer of the page', async () => {
    const response = await create(20);
    expect(response.status).toBe(403);
    expectNoWrites();
  });

  it('hides unreadable, trashed and unknown pages alike', async () => {
    for (const pageId of [30, 40, 99]) {
      const response = await create(pageId);
      expect(response.status, `page ${pageId}`).toBe(404);
      expect(response.body).toEqual(PAGE_NOT_FOUND);
    }
    expectNoWrites();
  });

  it('refuses a caller without a session', async () => {
    const response = await anonymous.post('/api/synced-blocks', {
      pageId: 10,
      originalBlockId: 'synced_new',
      content,
    });
    expect(response.status).toBe(401);
    expectNoWrites();
  });

  it('answers 409 when the id is already in use, whoever owns it', async () => {
    (storage.createSyncedBlock as any).mockResolvedValue(undefined);
    const response = await create(10, 'synced_hidden');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'This synced block ID is already in use' });
  });

  it('answers 404 when the page disappears before the insert', async () => {
    (storage.createSyncedBlock as any).mockRejectedValue(
      Object.assign(new Error('insert or update violates foreign key constraint'), {
        code: '23503',
      })
    );
    const response = await create(10);
    expect(response.status).toBe(404);
    expect(response.body).toEqual(PAGE_NOT_FOUND);
  });

  it('rejects bad input before touching storage', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ type: 'paragraph', content: `${i}` }));
    const huge = [{ type: 'paragraph', content: 'x'.repeat(300 * 1024) }];
    const bodies: Array<[string, object]> = [
      ['no pageId', { originalBlockId: 'synced_new', content }],
      ['pageId 0', { pageId: 0, originalBlockId: 'synced_new', content }],
      ['negative pageId', { pageId: -1, originalBlockId: 'synced_new', content }],
      ['fractional pageId', { pageId: 1.5, originalBlockId: 'synced_new', content }],
      ['string pageId', { pageId: '10', originalBlockId: 'synced_new', content }],
      ['huge pageId', { pageId: 2 ** 31, originalBlockId: 'synced_new', content }],
      ['no originalBlockId', { pageId: 10, content }],
      ['empty originalBlockId', { pageId: 10, originalBlockId: '', content }],
      ['long originalBlockId', { pageId: 10, originalBlockId: 'a'.repeat(129), content }],
      ['originalBlockId with a slash', { pageId: 10, originalBlockId: 'a/b', content }],
      ['numeric originalBlockId', { pageId: 10, originalBlockId: 5, content }],
      ['no content', { pageId: 10, originalBlockId: 'synced_new' }],
      ['content not a list', { pageId: 10, originalBlockId: 'synced_new', content: 'text' }],
      ['content of strings', { pageId: 10, originalBlockId: 'synced_new', content: ['a'] }],
      ['content with null', { pageId: 10, originalBlockId: 'synced_new', content: [null] }],
      ['too many blocks', { pageId: 10, originalBlockId: 'synced_new', content: many }],
      ['content too large', { pageId: 10, originalBlockId: 'synced_new', content: huge }],
      ['unknown key', { pageId: 10, originalBlockId: 'synced_new', content, createdBy: 1 }],
    ];
    for (const [name, body] of bodies) {
      const response = await api.post('/api/synced-blocks', body);
      expect(response.status, name).toBe(400);
    }
    expect(storage.checkPagePermission).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('accepts an empty block list and a 128-character id', async () => {
    const id = 'a'.repeat(128);
    const response = await api.post('/api/synced-blocks', {
      pageId: 10,
      originalBlockId: id,
      content: [],
    });
    expect(response.status).toBe(201);
    expect(storage.createSyncedBlock).toHaveBeenCalledWith(10, id, []);
  });
});

describe('reading a synced block needs viewer on its page', () => {
  it('answers an editor and a viewer of the page', async () => {
    for (const id of ['synced_editable', 'synced_readonly']) {
      const response = await api.get(`/api/synced-blocks/${id}`);
      expect(response.status, id).toBe(200);
      expect(response.body).toMatchObject({ originalBlockId: id, content });
    }
  });

  it('hides blocks on unreadable and trashed pages like unknown ids', async () => {
    for (const id of HIDDEN_BLOCKS) {
      const response = await api.get(`/api/synced-blocks/${id}`);
      expect(response.status, id).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    }
  });

  it('refuses a caller without a session', async () => {
    expect((await anonymous.get('/api/synced-blocks/synced_readonly')).status).toBe(401);
  });

  it('rejects malformed ids', async () => {
    for (const id of ['a%20b', 'a.b', 'a'.repeat(129)]) {
      expect((await api.get(`/api/synced-blocks/${id}`)).status, id).toBe(400);
    }
    expect(storage.getSyncedBlock).not.toHaveBeenCalled();
  });
});

describe('updating and deleting a synced block need editor on its page', () => {
  const writes: Array<[string, (id: string) => request.Test, number]> = [
    ['PATCH', (id) => api.patch(`/api/synced-blocks/${id}`, { content: newContent }), 200],
    ['DELETE', (id) => api.delete(`/api/synced-blocks/${id}`), 204],
  ];

  it.each(writes)('%s succeeds for an editor', async (_name, call, status) => {
    const response = await call('synced_editable');
    expect(response.status).toBe(status);
  });

  it('PATCH replaces the content and answers the block', async () => {
    const response = await api.patch('/api/synced-blocks/synced_editable', {
      content: newContent,
    });
    expect(storage.updateSyncedBlockContent).toHaveBeenCalledWith('synced_editable', newContent);
    expect(response.body).toMatchObject({ originalBlockId: 'synced_editable', pageId: 10 });
    expect(response.body.content).toEqual(newContent);
  });

  it('DELETE removes the block', async () => {
    await api.delete('/api/synced-blocks/synced_editable');
    expect(storage.deleteSyncedBlock).toHaveBeenCalledWith('synced_editable');
  });

  it.each(writes)('%s is forbidden to a viewer of the page', async (_name, call) => {
    const response = await call('synced_readonly');
    expect(response.status).toBe(403);
    expectNoWrites();
  });

  it.each(writes)('%s hides unreadable, trashed and unknown blocks alike', async (_n, call) => {
    for (const id of HIDDEN_BLOCKS) {
      const response = await call(id);
      expect(response.status, id).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    }
    expectNoWrites();
  });

  it.each([
    ['PATCH', () => anonymous.patch('/api/synced-blocks/synced_editable', { content })],
    ['DELETE', () => anonymous.delete('/api/synced-blocks/synced_editable')],
  ])('%s refuses a caller without a session', async (_name, call) => {
    expect((await call()).status).toBe(401);
    expectNoWrites();
  });

  it('PATCH rejects bad content before touching storage', async () => {
    for (const body of [{}, { content: 'x' }, { content: [1] }, { content, pageId: 30 }]) {
      const response = await api.patch('/api/synced-blocks/synced_editable', body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(storage.getSyncedBlock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('PATCH answers 404 when the block is deleted before the update', async () => {
    (storage.updateSyncedBlockContent as any).mockResolvedValue(undefined);
    const response = await api.patch('/api/synced-blocks/synced_editable', { content });
    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND);
  });
});

describe('the picker list', () => {
  it("lists the storage's readable blocks for the caller's viewer", async () => {
    const viewer = { userId: USER_ID, email: 'user@example.com', teamIds: [3] };
    (storage as any).getReadableSyncedBlocks.mockResolvedValue([
      { ...blocks.synced_editable, referenceCount: 2 },
      { ...blocks.synced_readonly, referenceCount: 0 },
    ]);
    const response = await api.get('/api/synced-blocks');
    expect(response.status).toBe(200);
    expect(storage.getPageViewer).toHaveBeenCalledWith(USER_ID);
    expect((storage as any).getReadableSyncedBlocks).toHaveBeenCalledWith(viewer);
    // The shape the picker reads: id, originalBlockId, content and referenceCount.
    expect(response.body).toEqual([
      {
        id: 11,
        originalBlockId: 'synced_editable',
        pageId: 10,
        content,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        referenceCount: 2,
      },
      expect.objectContaining({ originalBlockId: 'synced_readonly', referenceCount: 0 }),
    ]);
    expect(storage.getSyncedBlock).not.toHaveBeenCalled();
  });

  it('refuses a caller without a session', async () => {
    expect((await anonymous.get('/api/synced-blocks')).status).toBe(401);
  });
});

describe('with auth not enforced', () => {
  beforeEach(() => {
    testConfig.enforceAuthForWrites = false;
  });

  it('lets an anonymous caller read blocks on pages anyone can read, and nothing else', async () => {
    expect((await anonymous.get('/api/synced-blocks/synced_readonly')).status).toBe(200);
    for (const id of ['synced_editable', ...HIDDEN_BLOCKS]) {
      const response = await anonymous.get(`/api/synced-blocks/${id}`);
      expect(response.status, id).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    }
  });

  it('lists with the anonymous viewer', async () => {
    (storage as any).getReadableSyncedBlocks.mockResolvedValue([]);
    expect((await anonymous.get('/api/synced-blocks')).status).toBe(200);
    expect(storage.getPageViewer).toHaveBeenCalledWith(undefined);
    expect((storage as any).getReadableSyncedBlocks).toHaveBeenCalledWith({ teamIds: [] });
  });

  it('never lets an anonymous caller write', async () => {
    const readable = [
      anonymous.post('/api/synced-blocks', { pageId: 20, originalBlockId: 'synced_x', content }),
      anonymous.patch('/api/synced-blocks/synced_readonly', { content }),
      anonymous.delete('/api/synced-blocks/synced_readonly'),
    ];
    for (const call of readable) expect((await call).status).toBe(401);
    const hidden = [
      anonymous.post('/api/synced-blocks', { pageId: 10, originalBlockId: 'synced_x', content }),
      anonymous.patch('/api/synced-blocks/synced_editable', { content }),
      anonymous.delete('/api/synced-blocks/synced_hidden'),
    ];
    for (const call of hidden) expect((await call).status).toBe(404);
    expectNoWrites();
  });

  it('still applies the page rules to a signed-in caller', async () => {
    expect((await api.patch('/api/synced-blocks/synced_editable', { content })).status).toBe(200);
    expect((await api.patch('/api/synced-blocks/synced_readonly', { content })).status).toBe(403);
    expect((await api.delete('/api/synced-blocks/synced_hidden')).status).toBe(404);
  });
});

describe('errors', () => {
  it('never return internal details', async () => {
    const secret = new Error('relation "synced_blocks_secret" does not exist');
    const s = storage as any;
    s.getSyncedBlock.mockRejectedValue(secret);
    s.getReadableSyncedBlocks.mockRejectedValue(secret);
    s.createSyncedBlock.mockRejectedValue(secret);
    for (const call of [
      api.get('/api/synced-blocks/synced_editable'),
      api.patch('/api/synced-blocks/synced_editable', { content }),
      api.delete('/api/synced-blocks/synced_editable'),
      api.get('/api/synced-blocks'),
      api.post('/api/synced-blocks', { pageId: 10, originalBlockId: 'synced_new', content }),
    ]) {
      const response = await call;
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('secret');
    }
  });
});
