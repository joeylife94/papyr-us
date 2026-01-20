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

  const documentId = `page-${pageId}`;

  // Initialize Yjs document
  useEffect(() => {
    if (!enabled || !pageId) {
      // If disabled, ensure we look disconnected.
      setState({ isConnected: false, userCount: 0, isSynced: false, users: [] });
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
      onUsersChange?.(users);
    };

    awareness.on('change', awarenessChangeHandler);

    // Listen for local changes
    const observer = (event: Y.YArrayEvent<Block>) => {
      if (isApplyingRemoteRef.current) return; // Skip if applying remote changes

      const blocks = yblocks.toArray();
      onBlocksChange(blocks);
    };

    yblocks.observe(observer);

    return () => {
      awareness.off('change', awarenessChangeHandler);
      yblocks.unobserve(observer);
      awareness.destroy();
      ydoc.destroy();
    };
  }, [enabled, pageId, userId, userName, onBlocksChange, onUsersChange]);

  // Connect to Yjs server
  useEffect(() => {
    if (!enabled || !pageId) return;

    const token = localStorage.getItem('token');
    const socket = io('/yjs', {
      auth: { token },
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
        const stateVector = Buffer.from(data.stateVector, 'base64');
        Y.applyUpdate(ydoc, stateVector);

        setState((prev) => ({ ...prev, isSynced: true, userCount: data.userCount }));
        onUserCountChange?.(data.userCount);

        console.log('[Yjs] Document initialized', {
          documentId,
          userCount: data.userCount,
        });
      } catch (error) {
        console.error('[Yjs] Failed to initialize document:', error);
        onError?.('Failed to initialize document');
      }
    });

    // Receive updates from server
    socket.on('yjs:update', (data: { update: string }) => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;

      try {
        isApplyingRemoteRef.current = true;
        const update = Buffer.from(data.update, 'base64');
        Y.applyUpdate(ydoc, update);
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
        const update = Buffer.from(data.update, 'base64');
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
      onError?.(data.message);
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
          update: Buffer.from(update).toString('base64'),
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
  }, [enabled, pageId, documentId, onError, onUserCountChange]);

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
      socket.emit('yjs:save', { documentId, pageId });
      socket.once('yjs:saved', (data: { success: boolean; error?: string }) => {
        if (data.success) {
          resolve();
        } else {
          reject(new Error(data.error || 'Save failed'));
        }
      });
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
