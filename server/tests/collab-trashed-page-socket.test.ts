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
import * as Y from 'yjs';

const SECRET = 'collab-trashed-page-secret';
const PAGE = 3;
const EDITORS = [4401, 4402];
const tokenOf = (id: number) =>
  jwt.sign({ id, email: `editor-${id}@example.com`, role: 'user' }, SECRET, { expiresIn: '1h' });

let trashed = false;
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
    trashed
      ? undefined
      : { id, title: 'Plan', slug: 'plan', content: '', blocks: [], tags: [], metadata: {} },
  updateWikiPage: async (...args: unknown[]) => {
    updateWikiPage(...args);
    return trashed ? undefined : { id: PAGE, title: 'Plan', content: '', blocks: [] };
  },
};

let server: http.Server;
let baseUrl: string;
let yjsManagerOf: () => any;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  process.env.PAPYR_MODE = 'team';
  process.env.FEATURE_COLLABORATION = '1';
  process.env.COLLAB_REQUIRE_AUTH = '1';
  process.env.ENFORCE_AUTH_WRITES = 'true';
  process.env.JWT_SECRET = SECRET;
  process.env.COLLAB_SAVE_DEBOUNCE_MS = '500';

  vi.resetModules();
  const { registerRoutes } = await import('../routes.js');
  const yjs = await import('../services/yjs-collaboration.js');
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

async function joinYjs(id: number): Promise<ClientSocket> {
  const client = await open('/yjs', id);
  const init = next(client, 'yjs:init');
  client.emit('yjs:join', { documentId: `page-${PAGE}`, pageId: PAGE });
  await init;
  return client;
}

async function joinCollab(id: number): Promise<ClientSocket> {
  const client = await open('/collab', id);
  const users = next(client, 'session-users');
  client.emit('join-document', { pageId: PAGE, userName: `editor ${id}` });
  await users;
  return client;
}

describe('a Yjs save of a page that was trashed while open', () => {
  it('tells every client once, is not counted as saved, and is not attempted again', async () => {
    const [first, second] = await Promise.all(EDITORS.map(joinYjs));
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
    expect(await refused).toMatchObject({ code: expect.not.stringMatching(/^$/) });
    // Both save windows (the debounce, and a manual save) leave the count where it was
    const saved = next(first, 'yjs:saved');
    first.emit('yjs:save', { documentId: `page-${PAGE}`, pageId: PAGE });
    expect(await saved).toMatchObject({ success: false });
    await new Promise((resolve) => setTimeout(resolve, 900));
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
    const [first, second] = await Promise.all(EDITORS.map(joinCollab));
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
    expect(await refused).toMatchObject({ code: expect.not.stringMatching(/^$/) });
    await new Promise((resolve) => setTimeout(resolve, 900));
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
