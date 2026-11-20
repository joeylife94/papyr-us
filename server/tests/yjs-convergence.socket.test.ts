/**
 * Realtime editing converges over real Socket.IO connections (WP5).
 *
 * Two browsers' sessions (the real client session class, lib/yjs-session.ts) join one document on
 * a real server (the real /yjs namespace). The storage behind it is an in-memory stand-in.
 *
 * "Concurrent": a session that is told a person is composing text (IME) holds the server's
 * updates back, so both people type before either has seen the other's change; the held updates
 * are applied afterwards. Both sides' updates have reached the server by then.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import jwt from 'jsonwebtoken';
import { YjsSession, type OfflineChanges } from '../../client/src/lib/yjs-session.js';
import { readBlocks, seedBlocks, updateBlock, insertBlock } from '../../shared/yjs-blocks.js';

type Stored = {
  id: number;
  title: string;
  content: string;
  blocks: any[];
  tags: string[];
  folder: string;
  author: string;
  slug: string;
  metadata: Record<string, unknown>;
  updatedAt: Date;
};

const PAGE_ID = 77;
const DOC = `page-${PAGE_ID}`;

const block = (id: string, content: string) => ({
  id,
  type: 'paragraph',
  content,
  properties: {},
  order: 0,
  children: [],
});

let server: http.Server;
let io: SocketIOServer;
let baseUrl: string;
let manager: typeof import('../services/yjs-collaboration.js').yjsManager;
let page: Stored;
let canEditPage = true;
// A second page the person may edit, a page they may not read, and a small room limit
const OTHER_ID = 78;
const OTHER_DOC = `page-${OTHER_ID}`;
const HIDDEN_ID = 79;
let otherPage: Stored;
let legacyPermission: string | null = null;

const sockets: Socket[] = [];
const sessions: YjsSession[] = [];

const storage: any = {
  getWikiPage: async (id: number) =>
    id === PAGE_ID ? page : id === OTHER_ID ? otherPage : id === HIDDEN_ID ? page : undefined,
  updateWikiPage: async (id: number, data: Partial<Stored>) => {
    if (id !== PAGE_ID) return undefined;
    page = { ...page, ...data, updatedAt: new Date() };
    return page;
  },
  checkPagePermission: async (_user: unknown, id: number) => id !== HIDDEN_ID,
  // Like the real rule, an unknown page answers yes (the join then fails as not found)
  canEditPage: async (_user: unknown, id: number) => (id === PAGE_ID ? canEditPage : true),
  // The rule /yjs used before it followed canEditPage; the server must not read it any more.
  getUserPagePermission: async () => legacyPermission,
};

// Every socket signs in with a real access token: the realtime channel requires a session, and
// switching that off (COLLAB_REQUIRE_AUTH=0) is refused outside a developer's machine.
const TEST_JWT_SECRET = 'yjs-convergence-socket-test-secret';
const TEST_USER_ID = 501;
function signedIn() {
  const token = jwt.sign({ id: TEST_USER_ID, email: 'editor@example.com' }, TEST_JWT_SECRET, {
    expiresIn: '1h',
  });
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.COLLAB_REQUIRE_AUTH = '1';
  process.env.COLLAB_SAVE_DEBOUNCE_MS = '60000';
  process.env.COLLAB_MAX_CLIENTS_PER_DOC = '3';
  server = http.createServer();
  io = new SocketIOServer(server, { cors: { origin: false } });
  const mod = await import('../services/yjs-collaboration.js');
  mod.setupYjsCollaboration(io, storage);
  manager = mod.yjsManager;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);

afterAll(async () => {
  io.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}, 15000);

afterEach(async () => {
  sessions.splice(0).forEach((session) => session.destroy());
  sockets.splice(0).forEach((socket) => socket.disconnect());
  // Drop the document so every test starts from the stored page. unloadDoc keeps a document
  // that still has clients, so wait until the server has seen every socket leave.
  await waitFor(
    () => manager!.getDoc(DOC)?.clients.size ?? 0,
    (clients) => clients === 0
  );
  await waitFor(
    () => manager!.getDoc(OTHER_DOC)?.clients.size ?? 0,
    (clients) => clients === 0
  );
  await manager!.unloadDoc(DOC, 'ttl');
  await manager!.unloadDoc(OTHER_DOC, 'ttl');
  canEditPage = true;
  legacyPermission = null;
});

function resetOtherPage() {
  otherPage = {
    id: OTHER_ID,
    title: 'Other',
    slug: 'other',
    content: '',
    blocks: [block('o1', 'other page')],
    tags: [],
    folder: 'docs',
    author: 'a@example.com',
    metadata: {},
    updatedAt: new Date(),
  };
}

function resetPage(blocks: any[]) {
  page = {
    id: PAGE_ID,
    title: 'Collab',
    slug: 'collab',
    content: '',
    blocks,
    tags: [],
    folder: 'docs',
    author: 'a@example.com',
    metadata: {},
    updatedAt: new Date(),
  };
}

async function waitFor<T>(read: () => T | Promise<T>, accept: (value: T) => boolean, ms = 8000) {
  const deadline = Date.now() + ms;
  let last: T = await read();
  while (!accept(last)) {
    if (Date.now() > deadline) throw new Error(`timed out; last value: ${JSON.stringify(last)}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    last = await read();
  }
  return last;
}

interface Client {
  socket: Socket;
  session: YjsSession;
  /** The person is "typing" with an IME: updates from the server are held back. */
  setComposing(value: boolean): void;
  offline: OfflineChanges[];
  errors: Array<{ message: string; code?: string }>;
  blocks(): ReturnType<typeof readBlocks>;
}

async function join(): Promise<Client> {
  const socket = connect(`${baseUrl}/yjs`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: signedIn(),
  });
  sockets.push(socket);
  let composing = false;
  const offline: OfflineChanges[] = [];
  const errors: Client['errors'] = [];
  const session = new YjsSession(socket, {
    documentId: DOC,
    pageId: PAGE_ID,
    onBlocksChange: () => {},
    onOfflineChanges: (changes) => offline.push(changes),
    onError: (message, code) => errors.push({ message, code }),
    composition: { isComposing: () => composing },
  });
  sessions.push(session);
  await waitFor(
    () => session.synced,
    (synced) => synced
  );
  return {
    socket,
    session,
    setComposing(value) {
      composing = value;
      if (!value) session.releaseHeld();
    },
    offline,
    errors,
    blocks: () => (session.doc ? readBlocks(session.doc) : []),
  };
}

const serverBlocks = () => readBlocks(manager!.getDoc(DOC)!.ydoc);
const ids = (blocks: Array<{ id: string }>) => blocks.map((b) => b.id);

describe('two sessions on one document', () => {
  it('typing in the same block at the same time merges into one block', async () => {
    resetPage([block('b1', 'hello')]);
    const a = await join();
    const b = await join();
    expect(a.blocks()[0].content).toBe('hello');

    a.setComposing(true);
    b.setComposing(true);
    updateBlock(a.session.doc!, 'b1', { content: 'hello world' });
    updateBlock(b.session.doc!, 'b1', { content: 'hello there' });
    // Both updates are on the server; neither person has seen the other's change
    await waitFor(
      () => serverBlocks()[0].content,
      (text) => text.length === 'hello'.length + ' world'.length + ' there'.length
    );
    expect(a.blocks()[0].content).toBe('hello world');
    expect(b.blocks()[0].content).toBe('hello there');

    a.setComposing(false);
    b.setComposing(false);
    await waitFor(
      () => [a.blocks(), b.blocks(), serverBlocks()],
      ([x, y, z]) =>
        JSON.stringify(x) === JSON.stringify(y) && JSON.stringify(y) === JSON.stringify(z)
    );

    expect(ids(serverBlocks())).toEqual(['b1']);
    expect(serverBlocks()[0].content).toContain('world');
    expect(serverBlocks()[0].content).toContain('there');
    expect(serverBlocks()[0].content.startsWith('hello')).toBe(true);

    // The save writes one block
    await manager!.saveDoc(DOC, 'manual');
    expect(ids(page.blocks)).toEqual(['b1']);
    expect(page.blocks[0].content).toBe(serverBlocks()[0].content);
  });

  it('a block added and a block edited at the same time both arrive, without repeats', async () => {
    resetPage([block('b1', 'one')]);
    const a = await join();
    const b = await join();
    a.setComposing(true);
    b.setComposing(true);
    insertBlock(a.session.doc!, 1, block('b2', 'from A'));
    updateBlock(b.session.doc!, 'b1', { content: 'one, edited by B' });
    await waitFor(
      () => serverBlocks().length,
      (n) => n === 2
    );
    a.setComposing(false);
    b.setComposing(false);
    await waitFor(
      () => b.blocks().length,
      (n) => n === 2
    );
    for (const view of [a.blocks(), b.blocks(), serverBlocks()]) {
      expect(view.map((x) => [x.id, x.content])).toEqual([
        ['b1', 'one, edited by B'],
        ['b2', 'from A'],
      ]);
    }
  });
});

describe('a client that reconnects', () => {
  it('after the server rebuilt the document starts fresh: no repeated blocks, nothing to report', async () => {
    resetPage([block('b1', 'x'), block('b2', 'y')]);
    const a = await join();
    const epoch = a.session.epoch;
    const first = manager!.getDoc(DOC)!.epoch;
    expect(epoch).toBe(first);

    a.socket.disconnect();
    await waitFor(
      () => manager!.getUserCount(DOC),
      (n) => n === 0
    );
    await manager!.unloadDoc(DOC, 'ttl'); // forced unload, as the TTL or an eviction would
    expect(manager!.getDoc(DOC)).toBeUndefined();

    a.socket.connect();
    await waitFor(
      () => a.session.synced,
      (synced) => synced
    );

    expect(a.session.epoch).not.toBe(epoch);
    expect(ids(a.blocks())).toEqual(['b1', 'b2']);
    expect(ids(serverBlocks())).toEqual(['b1', 'b2']);
    expect(a.offline).toEqual([]);
    // What the client holds is a replica of what the server holds
    expect(Y.encodeStateVector(a.session.doc!)).toEqual(
      Y.encodeStateVector(manager!.getDoc(DOC)!.ydoc)
    );
  });

  it('after the server rebuilt the document, edits made offline are handed back, not merged or dropped', async () => {
    resetPage([block('b1', 'hello'), block('b2', 'keep')]);
    const a = await join();
    a.socket.disconnect();
    await waitFor(
      () => manager!.getUserCount(DOC),
      (n) => n === 0
    );
    // Typed while the connection is down
    updateBlock(a.session.doc!, 'b1', { content: 'hello, typed offline' });
    insertBlock(a.session.doc!, 2, block('b3', 'a block added offline'));
    await manager!.unloadDoc(DOC, 'ttl');

    a.socket.connect();
    await waitFor(
      () => a.session.synced,
      (synced) => synced
    );

    // The person sees the server's page, once each block
    expect(a.blocks().map((x) => [x.id, x.content])).toEqual([
      ['b1', 'hello'],
      ['b2', 'keep'],
    ]);
    expect(serverBlocks().map((x) => [x.id, x.content])).toEqual([
      ['b1', 'hello'],
      ['b2', 'keep'],
    ]);
    // ... and is told what could not be applied, with the text
    expect(a.offline).toEqual([
      {
        blocks: [
          { id: 'b1', type: 'paragraph', text: 'hello, typed offline' },
          { id: 'b3', type: 'paragraph', text: 'a block added offline' },
        ],
        removed: 0,
      },
    ]);
  });

  it('while the server still has the document, edits made offline merge', async () => {
    resetPage([block('b1', 'hello'), block('b2', 'keep')]);
    const a = await join();
    const b = await join(); // keeps the server's document loaded
    const epoch = a.session.epoch;

    a.socket.disconnect();
    await waitFor(
      () => manager!.getUserCount(DOC),
      (n) => n === 1
    );
    updateBlock(a.session.doc!, 'b1', { content: 'hello from A' }); // offline
    updateBlock(b.session.doc!, 'b2', { content: 'keep, edited by B' }); // meanwhile
    await waitFor(
      () => serverBlocks()[1].content,
      (text) => text === 'keep, edited by B'
    );

    a.socket.connect();
    await waitFor(
      () => a.session.synced,
      (synced) => synced
    );
    await waitFor(
      () => [a.blocks(), b.blocks(), serverBlocks()].map((view) => JSON.stringify(view)),
      ([x, y, z]) => x === y && y === z
    );

    expect(a.session.epoch).toBe(epoch);
    expect(serverBlocks().map((x) => [x.id, x.content])).toEqual([
      ['b1', 'hello from A'],
      ['b2', 'keep, edited by B'],
    ]);
    expect(a.offline).toEqual([]);
  });

  it('after a restore replaced the page, a client that was connected keeps working with the new epoch', async () => {
    resetPage([block('b1', 'old')]);
    const a = await join();
    const before = a.session.epoch;
    page = { ...page, blocks: [block('r1', 'restored')] };
    await manager!.reloadFromDatabase(PAGE_ID);
    await waitFor(
      () => a.session.epoch,
      (epoch) => epoch !== before
    );
    await waitFor(
      () => ids(a.blocks()),
      (list) => list.length === 1 && list[0] === 'r1'
    );
    expect(a.session.epoch).toBe(manager!.getDoc(DOC)!.epoch);
  });
});

describe('who may edit', () => {
  it('follows canEditPage, not the permission rows /yjs used to read', async () => {
    resetPage([block('b1', 'one')]);
    // A page REST writes let this person edit (e.g. a legacy open page without
    // permission rows), where the old /yjs rule found no permission
    canEditPage = true;
    legacyPermission = null;
    const editor = await join();
    updateBlock(editor.session.doc!, 'b1', { content: 'one, edited' });
    await waitFor(
      () => serverBlocks()[0].content,
      (text) => text === 'one, edited'
    );
    expect(editor.errors).toEqual([]);
  });

  it('refuses updates when canEditPage says no, even if the permission rows would allow it', async () => {
    resetPage([block('b1', 'one')]);
    canEditPage = false;
    legacyPermission = 'editor';
    const reader = await join();
    updateBlock(reader.session.doc!, 'b1', { content: 'one, tampered' });
    await waitFor(
      () => reader.errors.map((e) => e.code),
      (codes) => codes.includes('EDIT_PERMISSION_REQUIRED')
    );
    expect(serverBlocks()[0].content).toBe('one');
    expect(reader.session.canEdit).toBe(false);
  });

  it('refuses a client of another document shape and a page that does not exist', async () => {
    resetPage([block('b1', 'one')]);
    const socket = connect(`${baseUrl}/yjs`, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: signedIn(),
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const codes: string[] = [];
    socket.on('yjs:error', (e: { code?: string }) => codes.push(e.code ?? ''));
    socket.emit('yjs:join', { documentId: DOC, pageId: PAGE_ID }); // no schema: an old client
    socket.emit('yjs:join', { documentId: 'page-999', pageId: 999, schema: 2 });
    await waitFor(
      () => codes.length,
      (n) => n >= 2
    );
    expect(codes.sort()).toEqual(['CLIENT_OUTDATED', 'PAGE_NOT_FOUND']);
    expect(manager!.getDoc(DOC)).toBeUndefined();
    expect(manager!.getDoc('page-999')).toBeUndefined();
  });
});

describe('what the server stores', () => {
  it('seeds the document from the stored blocks and saves them back as the same JSON', async () => {
    const stored = [
      { ...block('h', 'Title'), type: 'heading1' },
      { ...block('t', 'todo'), type: 'checkbox', properties: { checked: true } },
      { ...block('c', 'let a = 1;'), type: 'code', properties: { language: 'ts' } },
    ].map((b, order) => ({ ...b, order }));
    resetPage(stored);
    const a = await join();
    expect(a.blocks()).toEqual(stored);
    updateBlock(a.session.doc!, 't', { properties: { checked: false } });
    await waitFor(
      () => serverBlocks()[1].properties,
      (p) => (p as any).checked === false
    );
    await manager!.saveDoc(DOC, 'manual');
    expect(page.blocks).toEqual([
      stored[0],
      { ...stored[1], properties: { checked: false } },
      stored[2],
    ]);
    // the doc the server seeded is a plain Y.Doc seeded by the shared module
    const check = new Y.Doc();
    seedBlocks(check, stored as any);
    expect(readBlocks(check)).toEqual(stored);
  });
});

describe("a socket's right to edit belongs to the page it joined", () => {
  /** A raw socket: joins as told and reports what the server answered. */
  async function raw() {
    const socket = connect(`${baseUrl}/yjs`, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: signedIn(),
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const errors: string[] = [];
    socket.on('yjs:error', (e: { code?: string; message: string }) =>
      errors.push(e.code ?? e.message)
    );
    const inits: any[] = [];
    socket.on('yjs:init', (payload) => inits.push(payload));
    const answered = () => errors.length + inits.length;
    return {
      socket,
      errors,
      inits,
      /** Sends a join and waits for the server's answer to it. */
      async join(documentId: string, pageId: number, schema: number | null = 2) {
        const before = answered();
        socket.emit('yjs:join', {
          documentId,
          pageId,
          ...(schema === null ? {} : { schema }),
        });
        await waitFor(answered, (n) => n > before);
      },
      /** An update that sets the text of block b1 on page 77, sent for `documentId`. */
      async edit(documentId: string, text: string) {
        // Any state this person was given that holds block b1 (page 77's)
        const doc = new Y.Doc();
        for (const init of inits) Y.applyUpdate(doc, Buffer.from(init.stateVector, 'base64'));
        let update: Uint8Array | null = null;
        doc.on('update', (u: Uint8Array) => (update = u));
        expect(updateBlock(doc, 'b1', { content: text })).toBe(true);
        const before = errors.length;
        socket.emit('yjs:update', {
          documentId,
          update: Buffer.from(update!).toString('base64'),
        });
        socket.emit('yjs:save', { documentId, pageId: PAGE_ID });
        // The server answers a refused update with an error; an accepted one with nothing
        await new Promise((resolve) => setTimeout(resolve, 300));
        return errors.slice(before);
      },
    };
  }

  const viewerOnPage77 = async () => {
    resetPage([block('b1', 'one')]);
    resetOtherPage();
    canEditPage = false;
    const client = await raw();
    await client.join(DOC, PAGE_ID);
    expect(client.inits[0].canEdit).toBe(false);
    return client;
  };
  const untouched = () => expect(serverBlocks()[0].content).toBe('one');

  it('a join refused as outdated leaves the previous page and its rights as they were', async () => {
    const client = await viewerOnPage77();
    await client.join(OTHER_DOC, OTHER_ID, null); // editable page, no schema
    expect(client.errors).toContain('CLIENT_OUTDATED');
    expect(await client.edit(DOC, 'one, tampered')).toContain('EDIT_PERMISSION_REQUIRED');
    untouched();
    expect(page.blocks[0].content).toBe('one');
  });

  it('a join for a page that does not exist leaves the previous page and its rights as they were', async () => {
    const client = await viewerOnPage77();
    await client.join('page-99999', 99999);
    expect(client.errors).toContain('PAGE_NOT_FOUND');
    expect(await client.edit(DOC, 'one, tampered')).toContain('EDIT_PERMISSION_REQUIRED');
    untouched();
  });

  it('a join refused for access leaves the previous page and its rights as they were', async () => {
    const client = await viewerOnPage77();
    await client.join(`page-${HIDDEN_ID}`, HIDDEN_ID);
    expect(client.errors).toContain('PERMISSION_DENIED');
    expect(await client.edit(DOC, 'one, tampered')).toContain('EDIT_PERMISSION_REQUIRED');
    untouched();
  });

  it('a join refused because the room is full leaves the previous page and its rights as they were', async () => {
    const client = await viewerOnPage77();
    const fillers = [await raw(), await raw(), await raw()];
    for (const filler of fillers) await filler.join(OTHER_DOC, OTHER_ID);
    expect(fillers.map((f) => f.inits.length)).toEqual([1, 1, 1]); // room limit is 3
    const before = client.errors.length;
    await client.join(OTHER_DOC, OTHER_ID);
    expect(client.errors.length).toBeGreaterThan(before);
    expect(client.inits).toHaveLength(1);
    expect(await client.edit(DOC, 'one, tampered')).toContain('EDIT_PERMISSION_REQUIRED');
    untouched();
  });

  it("after a successful join to another page the right is that page's, and the old page is no longer joined", async () => {
    const client = await viewerOnPage77();
    await client.join(OTHER_DOC, OTHER_ID); // editable
    expect(client.inits[1].canEdit).toBe(true);
    expect(await client.edit(DOC, 'one, tampered')).toContain('NOT_JOINED');
    untouched();
  });

  it('two joins sent back to back are decided one after the other', async () => {
    resetPage([block('b1', 'one')]);
    resetOtherPage();
    canEditPage = false;
    const client = await raw();
    client.socket.emit('yjs:join', { documentId: OTHER_DOC, pageId: OTHER_ID, schema: 2 });
    client.socket.emit('yjs:join', { documentId: DOC, pageId: PAGE_ID, schema: 2 });
    await waitFor(
      () => client.inits.length,
      (n) => n === 2
    );
    // The last join won: page 77, where the person may only read
    expect(await client.edit(DOC, 'one, tampered')).toContain('EDIT_PERMISSION_REQUIRED');
    untouched();
  });
});
