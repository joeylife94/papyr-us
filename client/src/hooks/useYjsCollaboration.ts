import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { io, Socket } from 'socket.io-client';
import { Block } from '@shared/schema';

export interface User {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number; blockId?: string };
}

interface YjsCollaborationOptions {
  pageId: number;
  userId?: string;
  userName?: string;
  enabled?: boolean;
  onBlocksChange: (blocks: Block[]) => void;
  onUsersChange?: (users: User[]) => void;
  onUserCountChange?: (count: number) => void;
  onError?: (error: string) => void;
}

interface YjsCollaborationState {
  isConnected: boolean;
  userCount: number;
  isSynced: boolean;
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

// The server exchanges Yjs updates as base64. Node's Buffer does not exist in the browser
// (Vite does not polyfill it), so decode/encode with atob/btoa.
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function getUserColor(userId: string): string {
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return USER_COLORS[hash % USER_COLORS.length];
}

/**
 * React hook for Yjs-based collaborative editing
 * Provides conflict-free concurrent editing using CRDT
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
}: YjsCollaborationOptions) {
  const [state, setState] = useState<YjsCollaborationState>({
    isConnected: false,
    userCount: 0,
    isSynced: false,
    users: [],
  });

  const socketRef = useRef<Socket | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const yblocksRef = useRef<Y.Array<Block> | null>(null);
  const isApplyingRemoteRef = useRef(false);

  // Callers pass inline callbacks, so read them through a ref instead of listing them as
  // effect dependencies; otherwise every render tears down and recreates the Y.Doc and the
  // /yjs socket, which reconnects in a loop and never finishes the initial sync.
  const callbacksRef = useRef({ onBlocksChange, onUsersChange, onUserCountChange, onError });
  callbacksRef.current = { onBlocksChange, onUsersChange, onUserCountChange, onError };

  const documentId = `page-${pageId}`;

  // Initialize Yjs document
  useEffect(() => {
    if (!enabled || !pageId) {
      // If disabled, ensure we look disconnected. Keep the previous state when it already
      // is, so re-running this effect never forces a re-render.
      setState((prev) =>
        !prev.isConnected && prev.userCount === 0 && !prev.isSynced && prev.users.length === 0
          ? prev
          : { isConnected: false, userCount: 0, isSynced: false, users: [] }
      );
      return;
    }

    // Create Yjs document
    const ydoc = new Y.Doc();
    const yblocks = ydoc.getArray<Block>('blocks');
    const awareness = new Awareness(ydoc);

    ydocRef.current = ydoc;
    yblocksRef.current = yblocks;
    awarenessRef.current = awareness;

    // Set local awareness state
    const userColor = getUserColor(userId);
    awareness.setLocalState({
      user: {
        id: userId,
        name: userName,
        color: userColor,
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

    // Mirror every change (local edits and updates from other collaborators) into React.
    // Skipping remote updates here meant other users' edits were applied to the Y.Doc but
    // never rendered.
    const observer = () => {
      const blocks = yblocks.toArray();
      callbacksRef.current.onBlocksChange(blocks);
    };

    yblocks.observe(observer);

    return () => {
      awareness.off('change', awarenessChangeHandler);
      yblocks.unobserve(observer);
      awareness.destroy();
      ydoc.destroy();
    };
  }, [enabled, pageId, userId, userName]);

  // Connect to Yjs server
  useEffect(() => {
    if (!enabled || !pageId) return;

    // Auth is handled via httpOnly cookies — no localStorage token needed
    const socket = io('/yjs', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('[Yjs] Connected to collaboration server');
      setState((prev) => ({ ...prev, isConnected: true }));

      // Join document
      socket.emit('yjs:join', { documentId, pageId });
    });

    socket.on('disconnect', () => {
      console.log('[Yjs] Disconnected from collaboration server');
      setState((prev) => ({ ...prev, isConnected: false, isSynced: false }));
    });

    // Initialize with server state
    socket.on('yjs:init', (data: { stateVector: string; userCount: number }) => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;

      try {
        const stateVector = base64ToBytes(data.stateVector);
        // 'server' origin keeps the update handler below from echoing it back.
        Y.applyUpdate(ydoc, stateVector, 'server');

        setState((prev) => ({ ...prev, isSynced: true, userCount: data.userCount }));
        callbacksRef.current.onUserCountChange?.(data.userCount);

        console.log('[Yjs] Document initialized', {
          documentId,
          userCount: data.userCount,
        });
      } catch (error) {
        console.error('[Yjs] Failed to initialize document:', error);
        callbacksRef.current.onError?.('Failed to initialize document');
      }
    });

    // Receive updates from server
    socket.on('yjs:update', (data: { update: string }) => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;

      try {
        isApplyingRemoteRef.current = true;
        const update = base64ToBytes(data.update);
        Y.applyUpdate(ydoc, update, 'server');
        isApplyingRemoteRef.current = false;

        console.log('[Yjs] Applied remote update');
      } catch (error) {
        console.error('[Yjs] Failed to apply update:', error);
        isApplyingRemoteRef.current = false;
      }
    });

    // Receive awareness updates from server
    socket.on('yjs:awareness', (data: { update: string }) => {
      const awareness = awarenessRef.current;
      if (!awareness) return;

      try {
        const update = base64ToBytes(data.update);
        const updateArray = Array.from(update);
        // Apply awareness update (this will trigger the 'change' event)
        // Note: y-protocols uses specific encoding, we'll handle this in a simple way
        console.log('[Yjs] Received awareness update');
      } catch (error) {
        console.error('[Yjs] Failed to apply awareness update:', error);
      }
    });

    // Error handling
    socket.on('yjs:error', (data: { message: string }) => {
      console.error('[Yjs] Server error:', data.message);
      callbacksRef.current.onError?.(data.message);
    });

    // Setup update broadcasting to server
    const ydoc = ydocRef.current;
    if (ydoc) {
      const updateHandler = (update: Uint8Array, origin: any) => {
        // Don't send update if it came from the server
        if (origin === 'server') return;

        // Send update to server
        socket.emit('yjs:update', {
          documentId,
          update: bytesToBase64(update),
        });
      };

      ydoc.on('update', updateHandler);

      return () => {
        ydoc.off('update', updateHandler);
        socket.disconnect();
      };
    }

    return () => {
      socket.disconnect();
    };
  }, [enabled, pageId, documentId]);

  // Update blocks (called from BlockEditor)
  const updateBlocks = useCallback((blocks: Block[]) => {
    const yblocks = yblocksRef.current;
    if (!yblocks || isApplyingRemoteRef.current) return;

    // Apply changes to Yjs array
    ydocRef.current?.transact(() => {
      yblocks.delete(0, yblocks.length);
      yblocks.push(blocks);
    });
  }, []);

  // Insert block at index
  const insertBlock = useCallback((index: number, block: Block) => {
    const yblocks = yblocksRef.current;
    if (!yblocks) return;

    ydocRef.current?.transact(() => {
      yblocks.insert(index, [block]);
    });
  }, []);

  // Update block at index
  const updateBlock = useCallback((index: number, block: Partial<Block>) => {
    const yblocks = yblocksRef.current;
    if (!yblocks || index >= yblocks.length) return;

    ydocRef.current?.transact(() => {
      const currentBlock = yblocks.get(index);
      yblocks.delete(index, 1);
      yblocks.insert(index, [{ ...currentBlock, ...block }]);
    });
  }, []);

  // Delete block at index
  const deleteBlock = useCallback((index: number) => {
    const yblocks = yblocksRef.current;
    if (!yblocks || index >= yblocks.length) return;

    ydocRef.current?.transact(() => {
      yblocks.delete(index, 1);
    });
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
    updateBlocks,
    insertBlock,
    updateBlock,
    deleteBlock,
    updateCursor,
    saveToDatabase,
  };
}
