/**
 * A realtime save of a page that was trashed while open writes nothing, is not reported as saved,
 * and tells the connected editors once.
 *
 * Rules under test, over real Socket.IO connections to the real routes, with a storage that
 * answers a trashed page as storage does (the page is not found and nothing is updated):
 * - /yjs: the debounced save of a trashed page is refused; every client of that page gets one
 *   `yjs:error` with code PAGE_NOT_EDITABLE; the save is not counted as succeeded, the dirty flag
 *   is cleared, no further save is attempted for later edits, and a manual `yjs:save` answers
 *   `{ success: false }` instead of `{ success: true }`;
 * - /collab: the same for the legacy channel (`collab:error`, code PAGE_NOT_EDITABLE);
 * - a live page is saved and nobody is told anything (a guard that holds before and after).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as Y from 'yjs';

const SECRET = 'collab-trashed-page-secret';
const PAGE = 3;
const DEBOUNCE_MS = 500;
const EDITORS = [4401, 4402];
const tokenOf = (id: number) =>
  jwt.sign({ id, email: `editor-${id}@example.com`, role: 'user' }, SECRET, { expiresIn: '1h' });

let trashed = false; // page PAGE
const trashedPages = new Set<number>(); // other pages
const storedBlocks = new Map<number, any[]>();
const isTrashed = (id: number) => (id === PAGE ? trashed : trashedPages.has(id));
const updateWikiPage = vi.fn();

const fakeStorage: any = {
  getUserAccount: async (id: number) => ({ id, email: `editor-${id}@example.com`, isActive: true }),
  getUserOrganizationId: async () => 1,
  getNotificationRecipientOrganizationId: async () => 1,
  getUnreadNotificationCount: async () => 0,
  checkPagePermission: async () => true,
  getUserPagePermission: async () => 'editor',
  // As the database layer: a trashed page is not found, and updating it changes nothing
  getWikiPage: async (id: number) =>
    isTrashed(id)
      ? undefined
      : {
          id,
          title: 'Plan',
          slug: 'plan',
          content: '',
          blocks: storedBlocks.get(id) ?? [],
          tags: [],
          metadata: {},
        },
  updateWikiPage: async (id: number, data: any) => {
    updateWikiPage(id, data);
    if (isTrashed(id)) return undefined;
    if (data.blocks) storedBlocks.set(id, data.blocks);
    return { id, title: 'Plan', content: '', blocks: storedBlocks.get(id) ?? [] };
  },
  // What the trash restore route reads and writes
  getTrashedTogetherIds: async (id: number) => [id],
  restorePages: async (ids: number[]) => {
    for (const id of ids) {
      if (id === PAGE) trashed = false;
      trashedPages.delete(id);
    }
    return ids.length;
  },
};

let server: http.Server;
let baseUrl: string;
let yjsManagerOf: () => any;
let yjsModule: any;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  process.env.PAPYR_MODE = 'team';
  process.env.FEATURE_COLLABORATION = '1';
  process.env.COLLAB_REQUIRE_AUTH = '1';
  process.env.ENFORCE_AUTH_WRITES = 'true';
  process.env.JWT_SECRET = SECRET;
  process.env.COLLAB_SAVE_DEBOUNCE_MS = String(DEBOUNCE_MS);

  vi.resetModules();
  const { registerRoutes } = await import('../routes.js');
  const yjs = await import('../services/yjs-collaboration.js');
  yjsModule = yjs;
  yjsManagerOf = () => yjs.yjsManager;
  const app: Express = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, fakeStorage));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);

afterAll(async () => {
  for (const client of clients) client.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}, 15000);

beforeEach(() => {
  trashed = false;
  trashedPages.clear();
  storedBlocks.clear();
  updateWikiPage.mockClear();
});

const open = (namespace: string, id: number): Promise<ClientSocket> =>
  new Promise((resolve, reject) => {
    const client = Client(`${baseUrl}${namespace}`, {
      transports: ['polling'],
      timeout: 4000,
      reconnection: false,
      extraHeaders: { Cookie: `accessToken=${tokenOf(id)}` },
    });
    clients.push(client);
    client.on('connect', () => resolve(client));
    client.on('connect_error', reject);
  });

/** Every `event` the socket receives, recorded from now on. */
const record = (client: ClientSocket, event: string) => {
  const seen: any[] = [];
  client.on(event, (payload: unknown) => seen.push(payload));
  return seen;
};

const next = <T = any>(client: ClientSocket, event: string, ms = 8000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const yjsUpdate = (text: string): string => {
  const doc = new Y.Doc();
  doc.getArray('blocks').push([{ id: text, type: 'paragraph', content: text, order: 0 }]);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
};

async function joinYjs(id: number, pageId = PAGE): Promise<ClientSocket> {
  const client = await open('/yjs', id);
  const init = next(client, 'yjs:init');
  client.emit('yjs:join', { documentId: `page-${pageId}`, pageId });
  await init;
  return client;
}

async function joinCollab(id: number, pageId = PAGE): Promise<ClientSocket> {
  const client = await open('/collab', id);
  const users = next(client, 'session-users');
  client.emit('join-document', { pageId, userName: `editor ${id}` });
  await users;
  return client;
}

describe('a Yjs save of a page that was trashed while open', () => {
  it('tells every client once, is not counted as saved, and is not attempted again', async () => {
    const [first, second] = await Promise.all(EDITORS.map((id) => joinYjs(id)));
    const firstErrors = record(first, 'yjs:error');
    const secondErrors = record(second, 'yjs:error');

    trashed = true;
    const told = Promise.all([next(first, 'yjs:error'), next(second, 'yjs:error')]);
    first.emit('yjs:update', { documentId: `page-${PAGE}`, update: yjsUpdate('after trash') });
    const [firstTold, secondTold] = await told;
    expect(firstTold).toMatchObject({ code: 'PAGE_NOT_EDITABLE' });
    expect(secondTold).toMatchObject({ code: 'PAGE_NOT_EDITABLE' });
    expect(updateWikiPage).toHaveBeenCalledTimes(1);

    const doc = yjsManagerOf().getDoc(`page-${PAGE}`);
    expect(doc.metrics.savesSucceeded).toBe(0);
    expect(doc.dirty).toBe(false);

    // A later edit is refused where it is sent and is never saved
    const refused = next(first, 'yjs:error');
    first.emit('yjs:update', { documentId: `page-${PAGE}`, update: yjsUpdate('later') });
    expect(await refused).toMatchObject({ code: 'EDIT_PERMISSION_REQUIRED' });
    // No save is pending or scheduled (the refusal cleared both timers), and a manual save is
    // answered as not saved without touching storage
    expect(doc.debounceTimer).toBeUndefined();
    expect(doc.snapshotTimer).toBeUndefined();
    const saved = next(first, 'yjs:saved');
    first.emit('yjs:save', { documentId: `page-${PAGE}`, pageId: PAGE });
    expect(await saved).toMatchObject({ success: false });
    expect(updateWikiPage).toHaveBeenCalledTimes(1);
    expect(doc.metrics.savesSucceeded).toBe(0);

    // One PAGE_NOT_EDITABLE per client, whatever else was answered
    expect(firstErrors.filter((e) => e.code === 'PAGE_NOT_EDITABLE')).toHaveLength(1);
    expect(secondErrors.filter((e) => e.code === 'PAGE_NOT_EDITABLE')).toHaveLength(1);
  });

  it('answers a manual save of a trashed page with success: false', async () => {
    const client = await joinYjs(EDITORS[0]);
    trashed = true;
    const saved = next(client, 'yjs:saved');
    client.emit('yjs:save', { documentId: `page-${PAGE}`, pageId: PAGE });
    expect(await saved).toMatchObject({ success: false });
  });

  it('guard: saves a live page and tells nobody anything', async () => {
    const client = await joinYjs(EDITORS[0]);
    const errors = record(client, 'yjs:error');
    client.emit('yjs:update', { documentId: `page-${PAGE}`, update: yjsUpdate('live') });
    const saved = next(client, 'yjs:saved');
    client.emit('yjs:save', { documentId: `page-${PAGE}`, pageId: PAGE });
    expect(await saved).toEqual({ success: true });
    expect(updateWikiPage).toHaveBeenCalled();
    expect(errors).toEqual([]);
  });
});

describe('a legacy collaboration save of a page that was trashed while open', () => {
  it('tells every client once and does not save again', async () => {
    const [first, second] = await Promise.all(EDITORS.map((id) => joinCollab(id)));
    const firstErrors = record(first, 'collab:error');
    const secondErrors = record(second, 'collab:error');

    trashed = true;
    const told = Promise.all([next(first, 'collab:error'), next(second, 'collab:error')]);
    first.emit('document-change', {
      pageId: PAGE,
      blockId: 'b1',
      type: 'update',
      data: { blocks: [{ id: 'b1', type: 'paragraph', content: 'after trash', order: 0 }] },
    });
    const [firstTold, secondTold] = await told;
    expect(firstTold).toMatchObject({ code: 'PAGE_NOT_EDITABLE' });
    expect(secondTold).toMatchObject({ code: 'PAGE_NOT_EDITABLE' });
    expect(updateWikiPage).toHaveBeenCalledTimes(1);

    // A later change is refused where it is sent and is never saved
    const refused = next(first, 'collab:error');
    first.emit('document-change', {
      pageId: PAGE,
      blockId: 'b1',
      type: 'update',
      data: { blocks: [{ id: 'b1', type: 'paragraph', content: 'later', order: 0 }] },
    });
    expect(await refused).toMatchObject({ code: 'EDIT_PERMISSION_REQUIRED' });
    // The legacy session is not reachable from here, so that no debounced save runs after the
    // refusal is proved by waiting out the configured debounce (COLLAB_SAVE_DEBOUNCE_MS)
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 2));
    expect(updateWikiPage).toHaveBeenCalledTimes(1);

    expect(firstErrors.filter((e) => e.code === 'PAGE_NOT_EDITABLE')).toHaveLength(1);
    expect(secondErrors.filter((e) => e.code === 'PAGE_NOT_EDITABLE')).toHaveLength(1);
  });

  it('guard: saves a live page and tells nobody anything', async () => {
    const client = await joinCollab(EDITORS[0]);
    const errors = record(client, 'collab:error');
    client.emit('document-change', {
      pageId: PAGE,
      blockId: 'b1',
      type: 'update',
      data: { blocks: [{ id: 'b1', type: 'paragraph', content: 'live', order: 0 }] },
    });
    // The debounced save runs after the configured delay and writes the page
    await vi.waitFor(() => expect(updateWikiPage).toHaveBeenCalled(), { timeout: 5000 });
    expect(errors).toEqual([]);
  });
});

const restoreViaRoute = (pageId: number) =>
  request(baseUrl)
    .post(`/api/trash/${pageId}/restore`)
    .set('Cookie', `accessToken=${tokenOf(EDITORS[0])}`);

const writesTo = (pageId: number) =>
  updateWikiPage.mock.calls.filter((call) => call[0] === pageId).length;

const block = (id: string) => ({ id, type: 'paragraph', content: id, order: 0 });

describe('a page restored from the trash after a refused realtime save', () => {
  const YJS_PAGE = 4;
  const COLLAB_PAGE = 6;

  it('Yjs: editors can edit again, the document is re-read from the database, and saves persist', async () => {
    const documentId = `page-${YJS_PAGE}`;
    const [first, second] = await Promise.all(EDITORS.map((id) => joinYjs(id, YJS_PAGE)));
    trashedPages.add(YJS_PAGE);
    const told = Promise.all([next(first, 'yjs:error'), next(second, 'yjs:error')]);
    first.emit('yjs:update', { documentId, update: yjsUpdate('typed while trashed') });
    for (const e of await told) expect(e).toMatchObject({ code: 'PAGE_NOT_EDITABLE' });

    // The restored page holds other content than the document did
    storedBlocks.set(YJS_PAGE, [block('restored')]);
    expect((await restoreViaRoute(YJS_PAGE)).status).toBe(200);

    // The document was re-read from the database: what it held while trashed is gone
    const doc = yjsModule.yjsManager.getDoc(documentId);
    expect(
      doc.ydoc
        .getArray('blocks')
        .toArray()
        .map((b: any) => b.id)
    ).toEqual(['restored']);
    expect(doc.pageNotEditable).toBe(false);

    // The editors can edit and save again
    updateWikiPage.mockClear();
    const errors = record(second, 'yjs:error');
    first.emit('yjs:update', { documentId, update: yjsUpdate('typed after restore') });
    const saved = next(first, 'yjs:saved');
    first.emit('yjs:save', { documentId, pageId: YJS_PAGE });
    expect(await saved).toEqual({ success: true });
    expect(updateWikiPage).toHaveBeenCalledTimes(1);
    expect(storedBlocks.get(YJS_PAGE)!.map((b: any) => b.id)).toContain('typed after restore');
    expect(errors).toEqual([]);
    // canEdit is back for the second editor too: its update is applied, not refused
    const received = next(first, 'yjs:update');
    second.emit('yjs:update', { documentId, update: yjsUpdate('second after restore') });
    await received;
  });

  it('Yjs: a rejoin while the page is still trashed is refused once more and does not loop', async () => {
    const documentId = `page-5`;
    const first = await joinYjs(EDITORS[0], 5);
    const firstErrors = record(first, 'yjs:error');
    trashedPages.add(5);
    const told = next(first, 'yjs:error');
    first.emit('yjs:update', { documentId, update: yjsUpdate('one') });
    expect(await told).toMatchObject({ code: 'PAGE_NOT_EDITABLE' });
    expect(writesTo(5)).toBe(1);

    // Another editor joins while the page is still trashed and edits
    const second = await joinYjs(EDITORS[1], 5);
    const secondErrors = record(second, 'yjs:error');
    const toldAgain = Promise.all([next(first, 'yjs:error'), next(second, 'yjs:error')]);
    second.emit('yjs:save', { documentId, pageId: 5 });
    for (const e of await toldAgain) expect(e).toMatchObject({ code: 'PAGE_NOT_EDITABLE' });
    expect(writesTo(5)).toBe(2);

    // Exactly one more event each, and the document stops saving again: a manual save is
    // answered without a write
    const saved = next(second, 'yjs:saved');
    second.emit('yjs:save', { documentId, pageId: 5 });
    expect(await saved).toMatchObject({ success: false });
    expect(writesTo(5)).toBe(2);
    const doc = yjsModule.yjsManager.getDoc(documentId);
    expect(doc.pageNotEditable).toBe(true);
    expect(doc.debounceTimer).toBeUndefined();
    expect(firstErrors.filter((e) => e.code === 'PAGE_NOT_EDITABLE')).toHaveLength(2);
    expect(secondErrors.filter((e) => e.code === 'PAGE_NOT_EDITABLE')).toHaveLength(1);
  });

  it('legacy: editors can edit again and their saves persist', async () => {
    const [first, second] = await Promise.all(EDITORS.map((id) => joinCollab(id, COLLAB_PAGE)));
    trashedPages.add(COLLAB_PAGE);
    const told = Promise.all([next(first, 'collab:error'), next(second, 'collab:error')]);
    first.emit('document-change', {
      pageId: COLLAB_PAGE,
      blockId: 'b1',
      type: 'update',
      data: { blocks: [block('typed while trashed')] },
    });
    for (const e of await told) expect(e).toMatchObject({ code: 'PAGE_NOT_EDITABLE' });

    expect((await restoreViaRoute(COLLAB_PAGE)).status).toBe(200);

    updateWikiPage.mockClear();
    const errors = record(second, 'collab:error');
    const saved = vi.waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1), {
      timeout: 5000,
    });
    first.emit('document-change', {
      pageId: COLLAB_PAGE,
      blockId: 'b1',
      type: 'update',
      data: { blocks: [block('typed after restore')] },
    });
    await saved;
    expect(storedBlocks.get(COLLAB_PAGE)!.map((b: any) => b.id)).toEqual(['typed after restore']);
    expect(errors).toEqual([]);
  });
});

describe('the pageNotEditable checks of the Yjs manager', () => {
  const cfg = {
    saveDebounceMs: 500,
    snapshotIntervalMs: 5000,
    docTtlMs: 60_000,
    maxDocs: 10,
    maxClientsPerDoc: 5,
    rateLimitUpdatesPerSec: 100,
    rateLimitAwarenessPerSec: 100,
    rateLimitSavesPerMin: 60,
    maxUpdateBytes: 1024 * 1024,
    requireAuth: true,
  };
  const namespace: any = { sockets: new Map(), to: () => ({ emit: () => undefined }) };

  it('a document that found its page not editable is not marked dirty and is not saved', async () => {
    const manager = new yjsModule.YjsCollaborationManager(namespace, fakeStorage, cfg);
    const doc = await manager.getOrCreate('page-7', 7);
    doc.pageNotEditable = true;
    updateWikiPage.mockClear();

    manager.markDirty('page-7');
    expect(doc.dirty).toBe(false);
    expect(doc.debounceTimer).toBeUndefined();

    doc.dirty = true; // as if an edit had been applied before the page was found not editable
    expect(await manager.saveDoc('page-7', 'manual')).toBe('not-editable');
    expect(await manager.saveDoc('page-7', 'interval')).toBe('not-editable');
    expect(updateWikiPage).not.toHaveBeenCalled();
    await manager.unloadDoc('page-7', 'ttl');
  });

  it('guard: a document whose page is editable is marked dirty and saved', async () => {
    const manager = new yjsModule.YjsCollaborationManager(namespace, fakeStorage, cfg);
    const doc = await manager.getOrCreate('page-8', 8);
    updateWikiPage.mockClear();
    doc.ydoc.getArray('blocks').push([block('edited')]);
    expect(doc.dirty).toBe(true);
    expect(await manager.saveDoc('page-8', 'manual')).toBe('saved');
    expect(updateWikiPage).toHaveBeenCalledTimes(1);
    await manager.unloadDoc('page-8', 'ttl');
  });
});
