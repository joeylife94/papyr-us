/**
 * One browser's session on a page's shared document (the `/yjs` namespace), without any UI
 * framework so that it can be exercised against a real server in tests.
 *
 * Joining: every (re)connect sends `yjs:join`; the server answers with the document's state and its
 * epoch (the incarnation of the document). The session keeps the document it holds only while the
 * epoch is the one it joined before: then the server's state is merged into it and what the server
 * lacks is sent back, so edits made while disconnected merge. With another epoch (the server
 * rebuilt the document from the database) the held document is not a replica of the server's, so a
 * fresh one replaces it, and the edits made offline are reported through `onOfflineChanges`
 * instead of being merged (which would duplicate content) or silently dropped.
 */
import * as Y from 'yjs';
import type { Socket } from 'socket.io-client';
import type { Block } from '@shared/schema';
import {
  YJS_SCHEMA_VERSION,
  LOCAL_ORIGIN,
  blockMaps,
  blockOrder,
  changesSince,
  readBlocks,
  type OfflineChanges,
} from '@shared/yjs-blocks';
import { emitTextChange } from './collab-text';

export type { OfflineChanges };

export interface SessionOptions {
  documentId: string;
  pageId: number;
  /** The page's blocks changed; `local` for the person's own edit, else from elsewhere. */
  onBlocksChange: (blocks: Block[], origin: 'local' | 'remote') => void;
  onStatus?: (status: {
    connected: boolean;
    synced: boolean;
    hasDocument: boolean;
    userCount?: number;
  }) => void;
  onOfflineChanges?: (changes: OfflineChanges) => void;
  onError?: (message: string, code?: string) => void;
  onLog?: (message: string, detail?: unknown) => void;
  /** IME composition: server updates are held back while this says true, until `release()`. */
  composition?: { isComposing: () => boolean };
}

// The server exchanges Yjs updates as base64. Node's Buffer does not exist in the browser
// (Vite does not polyfill it), so decode/encode with atob/btoa.
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

interface InitPayload {
  stateVector: string;
  serverStateVector?: string;
  epoch?: string;
  schema?: number;
  userCount: number;
  canEdit?: boolean;
}

export class YjsSession {
  doc: Y.Doc | null = null;
  undoManager: Y.UndoManager | null = null;
  /** False once the server refused an edit or revoked access. */
  canEdit = true;
  synced = false;
  epoch: string | null = null;

  private detachDoc: (() => void) | null = null;
  // The blocks as they were when the connection last dropped (to find offline edits)
  private baseline: Block[] | null = null;
  // Server updates held back while a person is composing text
  private held: Uint8Array[] = [];

  constructor(
    private socket: Socket,
    private options: SessionOptions
  ) {
    socket.on('connect', this.onConnect);
    socket.on('disconnect', this.onDisconnect);
    socket.on('yjs:init', this.onInit);
    socket.on('yjs:epoch', this.onEpoch);
    socket.on('yjs:update', this.onServerUpdate);
    socket.on('yjs:error', this.onServerError);
    // Already connected when the session starts: the event has passed
    if (socket.connected) this.onConnect();
  }

  get hasDocument(): boolean {
    return this.doc !== null;
  }

  destroy(): void {
    const s = this.socket;
    s.off('connect', this.onConnect);
    s.off('disconnect', this.onDisconnect);
    s.off('yjs:init', this.onInit);
    s.off('yjs:epoch', this.onEpoch);
    s.off('yjs:update', this.onServerUpdate);
    s.off('yjs:error', this.onServerError);
    this.detachDoc?.();
    this.doc?.destroy();
    this.doc = null;
    this.synced = false;
  }

  /** Applies the updates held back during a composition (when it is over). */
  releaseHeld(): void {
    if (this.options.composition?.isComposing() || this.held.length === 0) return;
    const pending = this.held;
    this.held = [];
    for (const bytes of pending) this.applyFromServer(bytes);
  }

  private status(extra: { userCount?: number } = {}) {
    this.options.onStatus?.({
      connected: this.socket.connected,
      synced: this.synced,
      hasDocument: this.doc !== null,
      ...extra,
    });
  }

  private applyFromServer(bytes: Uint8Array) {
    if (this.doc) Y.applyUpdate(this.doc, bytes, 'server');
  }

  private onConnect = () => {
    this.options.onLog?.('Connected to collaboration server');
    this.synced = false;
    this.status();
    this.socket.emit('yjs:join', {
      documentId: this.options.documentId,
      pageId: this.options.pageId,
      schema: YJS_SCHEMA_VERSION,
    });
  };

  private onDisconnect = () => {
    this.options.onLog?.('Disconnected from collaboration server');
    this.synced = false;
    this.held = [];
    if (this.doc) this.baseline = readBlocks(this.doc);
    this.status();
  };

  private onInit = (data: InitPayload) => {
    try {
      if (data.schema !== YJS_SCHEMA_VERSION || typeof data.epoch !== 'string') {
        this.options.onError?.('The server speaks another collaboration version');
        return;
      }
      this.held = [];
      const bytes = base64ToBytes(data.stateVector);
      this.canEdit = data.canEdit !== false;

      if (this.doc && this.epoch === data.epoch) {
        // Same document: merge the server's state, then send what the server lacks (edits made
        // while disconnected).
        this.applyFromServer(bytes);
        const missing = Y.encodeStateAsUpdate(
          this.doc,
          data.serverStateVector ? base64ToBytes(data.serverStateVector) : undefined
        );
        // An update with nothing in it is two bytes long
        if (missing.byteLength > 2 && this.canEdit) {
          this.socket.emit('yjs:update', {
            documentId: this.options.documentId,
            update: bytesToBase64(missing),
          });
        }
      } else {
        // First join, or the server rebuilt the document: start from a fresh one.
        let lost: OfflineChanges | null = null;
        if (this.doc) {
          if (this.baseline) lost = changesSince(this.baseline, readBlocks(this.doc));
          this.detachDoc?.();
          this.doc.destroy();
        }
        this.doc = new Y.Doc();
        this.detachDoc = this.attach(this.doc);
        this.applyFromServer(bytes);
        if (lost) this.options.onOfflineChanges?.(lost);
      }
      this.epoch = data.epoch;
      this.synced = true;
      this.baseline = readBlocks(this.doc!);
      this.status({ userCount: data.userCount });
      this.options.onLog?.('Document initialized', {
        documentId: this.options.documentId,
        userCount: data.userCount,
      });
    } catch (error) {
      console.error('[Yjs] Failed to initialize document:', error);
      this.options.onError?.('Failed to initialize document');
    }
  };

  // The server replaced the document's contents (a version restore): same document, new epoch
  private onEpoch = (data: { epoch?: string }) => {
    if (this.synced && typeof data?.epoch === 'string') this.epoch = data.epoch;
  };

  private onServerUpdate = (data: { update: string }) => {
    // Until the server's state has arrived, that state includes this update
    if (!this.doc || !this.synced) return;
    try {
      const update = base64ToBytes(data.update);
      if (this.options.composition?.isComposing()) {
        this.held.push(update);
        return;
      }
      this.applyFromServer(update);
      this.options.onLog?.('Applied remote update');
    } catch (error) {
      console.error('[Yjs] Failed to apply update:', error);
    }
  };

  private onServerError = (data: { message: string; code?: string }) => {
    if (data.code === 'EDIT_PERMISSION_REQUIRED' || data.code === 'ACCESS_REVOKED') {
      this.canEdit = false;
    }
    this.options.onError?.(data.message, data.code);
  };

  private attach(doc: Y.Doc): () => void {
    const order = blockOrder(doc);
    const maps = blockMaps(doc);
    const undo = new Y.UndoManager([order, maps], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 500,
    });
    this.undoManager = undo;

    const onUpdate = (update: Uint8Array, origin: unknown) => {
      // What came from the server is not sent back. What is made while not in step with the
      // server is sent in one piece when the next `yjs:init` arrives.
      if (origin === 'server' || !this.synced || !this.socket.connected) return;
      this.socket.emit('yjs:update', {
        documentId: this.options.documentId,
        update: bytesToBase64(update),
      });
    };

    // The text changes of a block reach its input before the page is rendered again (the input
    // still shows the old text then), so the caret can be carried through them.
    const onDeep = (events: Array<Y.YEvent<any>>, transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      for (const event of events) {
        if (!(event.target instanceof Y.Text)) continue;
        const block = event.target.parent;
        if (!(block instanceof Y.Map)) continue;
        const id = block.get('id');
        if (typeof id !== 'string') continue;
        emitTextChange({
          blockId: id,
          delta: event.delta as any,
          text: event.target.toString(),
          origin: transaction.origin,
        });
      }
    };

    const onAfter = (transaction: Y.Transaction) => {
      if (transaction.changed.size === 0) return;
      this.options.onBlocksChange(
        readBlocks(doc),
        transaction.origin === LOCAL_ORIGIN ? 'local' : 'remote'
      );
    };

    doc.on('update', onUpdate);
    maps.observeDeep(onDeep);
    doc.on('afterTransaction', onAfter);
    return () => {
      doc.off('update', onUpdate);
      maps.unobserveDeep(onDeep);
      doc.off('afterTransaction', onAfter);
      undo.destroy();
      if (this.undoManager === undo) this.undoManager = null;
    };
  }
}
