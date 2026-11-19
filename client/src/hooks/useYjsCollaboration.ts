import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { io, Socket } from 'socket.io-client';
import { Block } from '@shared/schema';
import {
  updateBlock as updateBlockIn,
  insertBlock as insertBlockIn,
  deleteBlock as deleteBlockIn,
  moveBlock as moveBlockIn,
  type BlockPatch,
} from '@shared/yjs-blocks';
import { isComposing, watchComposition } from '@/lib/collab-text';
import { YjsSession, type OfflineChanges } from '@/lib/yjs-session';

export interface User {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number; blockId?: string };
}

export type { OfflineChanges };

interface YjsCollaborationOptions {
  pageId: number;
  userId?: string;
  userName?: string;
  enabled?: boolean;
  onBlocksChange: (blocks: Block[]) => void;
  onUsersChange?: (users: User[]) => void;
  onUserCountChange?: (count: number) => void;
  onError?: (error: string) => void;
  /** The server started a new incarnation of the document and edits made offline were not applied. */
  onOfflineChanges?: (changes: OfflineChanges) => void;
}

interface YjsCollaborationState {
  isConnected: boolean;
  userCount: number;
  /** Connected, and the document is in step with the server's. */
  isSynced: boolean;
  /** A shared document exists in this browser (it stays after a disconnect, edits go to it). */
  hasDocument: boolean;
  users: User[];
}

// User color palette
const USER_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2',
  '#F8B739',
  '#52B788',
];

function getUserColor(userId: string): string {
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return USER_COLORS[hash % USER_COLORS.length];
}

/**
 * React hook for Yjs-based collaborative editing.
 *
 * Document: see shared/yjs-blocks.ts. Joining: every (re)connect sends `yjs:join`; the server
 * answers with the document's state and its epoch (the incarnation of the document). A browser
 * keeps the document it holds only while the epoch is the one it joined before: then the server's
 * state is merged into it and what the server lacks is sent back, so edits made while
 * disconnected merge. With another epoch (the server rebuilt the document) the held document is
 * not a replica of the server's, so a fresh one replaces it, and edits made offline are reported
 * through `onOfflineChanges` instead of being merged or lost.
 */
export function useYjsCollaboration({
  pageId,
  userId = 'anonymous',
  userName = 'Anonymous User',
  enabled = true,
  onBlocksChange,
  onUsersChange,
  onUserCountChange,
  onError,
  onOfflineChanges,
}: YjsCollaborationOptions) {
  const [state, setState] = useState<YjsCollaborationState>({
    isConnected: false,
    userCount: 0,
    isSynced: false,
    hasDocument: false,
    users: [],
  });

  const socketRef = useRef<Socket | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const sessionRef = useRef<YjsSession | null>(null);

  // Callers pass inline callbacks, so read them through a ref instead of listing them as
  // effect dependencies; otherwise every render tears down and recreates the Y.Doc and the
  // /yjs socket, which reconnects in a loop and never finishes the initial sync.
  const callbacksRef = useRef({
    onBlocksChange,
    onUsersChange,
    onUserCountChange,
    onError,
    onOfflineChanges,
  });
  callbacksRef.current = {
    onBlocksChange,
    onUsersChange,
    onUserCountChange,
    onError,
    onOfflineChanges,
  };

  const documentId = `page-${pageId}`;

  // Presence (awareness). It lives on its own document: the shared one is replaced whenever the
  // server rebuilds it.
  useEffect(() => {
    if (!enabled || !pageId) {
      // If disabled, ensure we look disconnected. Keep the previous state when it already
      // is, so re-running this effect never forces a re-render.
      setState((prev) =>
        !prev.isConnected &&
        prev.userCount === 0 &&
        !prev.isSynced &&
        !prev.hasDocument &&
        prev.users.length === 0
          ? prev
          : { isConnected: false, userCount: 0, isSynced: false, hasDocument: false, users: [] }
      );
      return;
    }

    const awarenessDoc = new Y.Doc();
    const awareness = new Awareness(awarenessDoc);
    awarenessRef.current = awareness;

    awareness.setLocalState({
      user: {
        id: userId,
        name: userName,
        color: getUserColor(userId),
      },
    });

    // Listen for awareness changes (other users' cursors)
    const awarenessChangeHandler = () => {
      const users: User[] = [];
      awareness.getStates().forEach((state: any, clientId: number) => {
        if (clientId !== awareness.clientID && state.user) {
          users.push({
            id: state.user.id,
            name: state.user.name,
            color: state.user.color,
            cursor: state.user.cursor,
          });
        }
      });

      setState((prev) => ({ ...prev, users }));
      callbacksRef.current.onUsersChange?.(users);
    };

    awareness.on('change', awarenessChangeHandler);

    return () => {
      awareness.off('change', awarenessChangeHandler);
      awareness.destroy();
      awarenessDoc.destroy();
      if (awarenessRef.current === awareness) awarenessRef.current = null;
    };
  }, [enabled, pageId, userId, userName]);

  // The shared document and its connection to the server (see lib/yjs-session.ts)
  useEffect(() => {
    if (!enabled || !pageId) return;

    // Auth is handled via httpOnly cookies — no localStorage token needed
    const socket = io('/yjs', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const session = new YjsSession(socket, {
      documentId,
      pageId,
      composition: { isComposing },
      onBlocksChange: (blocks, origin) => {
        // A change from elsewhere is rendered before anything else can happen, so the next
        // keystroke is always made against the text on screen. The person's own edits render
        // with the event that made them.
        if (origin === 'local') callbacksRef.current.onBlocksChange(blocks);
        else flushSync(() => callbacksRef.current.onBlocksChange(blocks));
      },
      onStatus: ({ connected, synced, hasDocument, userCount }) => {
        setState((prev) => ({
          ...prev,
          isConnected: connected,
          isSynced: synced,
          hasDocument,
          userCount: userCount ?? prev.userCount,
        }));
        if (userCount !== undefined) callbacksRef.current.onUserCountChange?.(userCount);
      },
      onOfflineChanges: (changes) => callbacksRef.current.onOfflineChanges?.(changes),
      onError: (message) => {
        console.error('[Yjs] Server error:', message);
        callbacksRef.current.onError?.(message);
      },
      onLog: (message, detail) => console.log(`[Yjs] ${message}`, ...(detail ? [detail] : [])),
    });
    sessionRef.current = session;
    const stopWatchingComposition = watchComposition(() => session.releaseHeld());

    // Receive awareness updates from server
    socket.on('yjs:awareness', (data: { update: string }) => {
      // Presence is not wired up yet: the server relays `awarenessUpdate`, not `update`, and
      // this client never sends its own.
      void data;
      console.log('[Yjs] Received awareness update');
    });

    // Undo and redo (Ctrl/Cmd+Z, the Edit menu) act on this person's own edits only: the
    // browser's own undo would also have to cross collaborators' changes, which it cannot.
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[data-block-row]')) return;
      const undo = session.undoManager;
      if (!undo || !session.canEdit) return;
      event.preventDefault();
      if (event.inputType === 'historyUndo') undo.undo();
      else undo.redo();
    };
    document.addEventListener('beforeinput', onBeforeInput, true);

    return () => {
      document.removeEventListener('beforeinput', onBeforeInput, true);
      stopWatchingComposition();
      session.destroy();
      if (sessionRef.current === session) sessionRef.current = null;
      if (socketRef.current === socket) socketRef.current = null;
      socket.disconnect();
      setState((prev) => ({ ...prev, hasDocument: false, isSynced: false, isConnected: false }));
    };
  }, [enabled, pageId, documentId]);

  const editable = () => {
    const session = sessionRef.current;
    if (!session?.doc) return null;
    if (!session.canEdit) {
      callbacksRef.current.onError?.('You do not have permission to edit this page.');
      return null;
    }
    return session.doc;
  };

  // Insert block at index
  const insertBlock = useCallback((index: number, block: Block) => {
    const doc = editable();
    return doc ? insertBlockIn(doc, index, block) : false;
  }, []);

  // Update the block with this id: `content` as a text edit (`caret` is the caret after it),
  // `properties` key by key.
  const updateBlock = useCallback((blockId: string, patch: BlockPatch, caret?: number) => {
    const doc = editable();
    return doc ? updateBlockIn(doc, blockId, patch, caret) : false;
  }, []);

  // Delete the block with this id
  const deleteBlock = useCallback((blockId: string) => {
    const doc = editable();
    return doc ? deleteBlockIn(doc, blockId) : false;
  }, []);

  // Move a block (issue #103 E3) as one change; `to` is its index in the resulting list.
  const moveBlock = useCallback((blockId: string, to: number) => {
    const doc = editable();
    return doc ? moveBlockIn(doc, blockId, to) : false;
  }, []);

  // Update cursor position
  const updateCursor = useCallback((cursor: { x: number; y: number; blockId?: string }) => {
    const awareness = awarenessRef.current;
    if (!awareness) return;

    const currentState = awareness.getLocalState() as any;
    if (currentState?.user) {
      awareness.setLocalState({
        user: {
          ...currentState.user,
          cursor,
        },
      });
    }
  }, []);

  // Manual save to database
  const saveToDatabase = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return Promise.reject(new Error('Not connected'));

    return new Promise<void>((resolve, reject) => {
      const SAVE_TIMEOUT_MS = 15_000;
      const timeout = setTimeout(() => {
        socket.off('yjs:saved', handler);
        reject(new Error('Save timed out after 15s'));
      }, SAVE_TIMEOUT_MS);

      const handler = (data: { success: boolean; error?: string }) => {
        clearTimeout(timeout);
        if (data.success) {
          resolve();
        } else {
          reject(new Error(data.error || 'Save failed'));
        }
      };

      socket.emit('yjs:save', { documentId, pageId });
      socket.once('yjs:saved', handler);
    });
  }, [documentId, pageId]);

  return {
    ...state,
    insertBlock,
    updateBlock,
    deleteBlock,
    moveBlock,
    updateCursor,
    saveToDatabase,
  };
}
