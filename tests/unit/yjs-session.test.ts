/**
 * The browser's session on the shared document (client/src/lib/yjs-session.ts), driven with a
 * stand-in socket: what it does with updates that arrive while a person is composing text.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { YjsSession, bytesToBase64 } from '../../client/src/lib/yjs-session';
import { YJS_SCHEMA_VERSION, readBlocks, seedBlocks, updateBlock } from '../../shared/yjs-blocks';

class FakeSocket {
  connected = true;
  emitted: Array<[string, unknown]> = [];
  private handlers = new Map<string, Set<(payload: any) => void>>();
  on(event: string, handler: (payload: any) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }
  off(event: string, handler: (payload: any) => void) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push([event, payload]);
    return this;
  }
  receive(event: string, payload?: unknown) {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
  }
}

function join(composing: { value: boolean }) {
  const server = new Y.Doc();
  seedBlocks(server, [
    { id: 'b1', type: 'paragraph', content: 'Base', properties: {}, order: 0, children: [] },
  ]);
  const socket = new FakeSocket();
  const session = new YjsSession(socket as any, {
    documentId: 'page-1',
    pageId: 1,
    onBlocksChange: () => {},
    composition: { isComposing: () => composing.value },
  });
  socket.receive('yjs:init', {
    stateVector: bytesToBase64(Y.encodeStateAsUpdate(server)),
    serverStateVector: bytesToBase64(Y.encodeStateVector(server)),
    epoch: 'e1',
    schema: YJS_SCHEMA_VERSION,
    userCount: 2,
    canEdit: true,
  });
  // A collaborator's document, and the updates its edits produce
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(server));
  const updates: string[] = [];
  peer.on('update', (update: Uint8Array) => updates.push(bytesToBase64(update)));
  return { socket, session, peer, updates };
}

describe('server updates that arrive during a composition', () => {
  it('are held while it is open and applied, in order, when it ends', () => {
    const composing = { value: true };
    const { socket, session, peer, updates } = join(composing);
    updateBlock(peer, 'b1', { content: 'Base one' });
    updateBlock(peer, 'b1', { content: 'Base one two' });
    for (const update of updates) socket.receive('yjs:update', { update });
    expect(readBlocks(session.doc!)[0].content).toBe('Base');

    composing.value = false;
    session.releaseHeld();
    expect(readBlocks(session.doc!)[0].content).toBe('Base one two');
  });

  it('the next update releases what was held first, when the composition ended without a release', () => {
    const composing = { value: true };
    const { socket, session, peer, updates } = join(composing);
    updateBlock(peer, 'b1', { content: 'Base one' });
    socket.receive('yjs:update', { update: updates[0] });
    expect(readBlocks(session.doc!)[0].content).toBe('Base');

    // The field went away or lost focus: composing is over, but nobody called releaseHeld()
    composing.value = false;
    updateBlock(peer, 'b1', { content: 'Base one two' });
    socket.receive('yjs:update', { update: updates[1] });
    expect(readBlocks(session.doc!)[0].content).toBe('Base one two');

    // Nothing is left waiting, and later updates keep applying
    updateBlock(peer, 'b1', { content: 'Base one two three' });
    socket.receive('yjs:update', { update: updates[2] });
    expect(readBlocks(session.doc!)[0].content).toBe('Base one two three');
    expect(Y.encodeStateVector(session.doc!)).toEqual(Y.encodeStateVector(peer));
  });
});

describe('undo and redo', () => {
  it('an internal failure of the undo stack is contained and leaves the document as it is', () => {
    const { session } = join({ value: false });
    updateBlock(session.doc!, 'b1', { content: 'Base typed' });
    const before = readBlocks(session.doc!);
    expect(session.canStep).toBe(true);
    let cleared = false;
    (session as any).undoManager = {
      undo: () => {
        throw new Error('broken stack');
      },
      redo: () => {
        throw new Error('broken stack');
      },
      clear: () => {
        cleared = true;
      },
    };
    const logged = console.error;
    console.error = () => {};
    try {
      expect(() => session.step('undo')).not.toThrow();
      expect(() => session.step('redo')).not.toThrow();
    } finally {
      console.error = logged;
    }
    expect(cleared).toBe(true);
    expect(readBlocks(session.doc!)).toEqual(before);
  });

  it('is not available without the right to edit', () => {
    const { session } = join({ value: false });
    session.canEdit = false;
    expect(session.canStep).toBe(false);
    expect(session.step('undo')).toBe(false);
  });
});
