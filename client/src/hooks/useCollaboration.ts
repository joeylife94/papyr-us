import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface CollaboratorCursor {
  userId: string;
  userName: string;
  position: { x: number; y: number };
  selection?: { start: number; end: number };
  color: string;
  timestamp: number;
}

export interface TypingUser {
  userId: string;
  userName: string;
  timestamp: number;
}

export interface SessionUser {
  id: string;
  name: string;
  teamId?: string;
}

interface UseCollaborationOptions {
  pageId: number;
  userId: string;
  userName: string;
  teamId?: string;
  enabled?: boolean;
}

// Generate consistent color for each user based on their ID
function getUserColor(userId: string): string {
  const colors = [
    '#EF4444', // red
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316', // orange
  ];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

export function useCollaboration({
  pageId,
  userId,
  userName,
  teamId,
  enabled = true,
}: UseCollaborationOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [cursors, setCursors] = useState<Map<string, CollaboratorCursor>>(new Map());
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map());
  const [sessionUsers, setSessionUsers] = useState<SessionUser[]>([]);

  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const cursorTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Initialize socket connection
  useEffect(() => {
    if (!enabled) return;

    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[Collab] No authentication token found');
      return;
    }

    const socketUrl = import.meta.env.VITE_WS_URL || window.location.origin;
    const newSocket = io(`${socketUrl}/collab`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('[Collab] Connected to collaboration server');
      setIsConnected(true);

      // Join document session
      newSocket.emit('join-document', {
        pageId,
        userId,
        userName,
        teamId,
      });
    });

    newSocket.on('disconnect', () => {
      console.log('[Collab] Disconnected from collaboration server');
      setIsConnected(false);
    });

    newSocket.on('session-users', (users: SessionUser[]) => {
      console.log('[Collab] Session users:', users);
      setSessionUsers(users.filter((u) => u.id !== userId));
    });

    newSocket.on('user-joined', (data: { userId: string; userName: string }) => {
      console.log('[Collab] User joined:', data.userName);
      setSessionUsers((prev) => {
        if (prev.find((u) => u.id === data.userId)) return prev;
        return [...prev, { id: data.userId, name: data.userName }];
      });
    });

    newSocket.on('user-left', (data: { userId: string }) => {
      console.log('[Collab] User left:', data.userId);
      setSessionUsers((prev) => prev.filter((u) => u.id !== data.userId));
      setCursors((prev) => {
        const newCursors = new Map(prev);
        newCursors.delete(data.userId);
        return newCursors;
      });
      setTypingUsers((prev) => {
        const newTyping = new Map(prev);
        newTyping.delete(data.userId);
        return newTyping;
      });
    });

    newSocket.on(
      'cursor-update',
      (data: {
        userId: string;
        userName: string;
        position: { x: number; y: number };
        selection?: { start: number; end: number };
        timestamp: number;
      }) => {
        if (data.userId === userId) return; // Ignore own cursor

        setCursors((prev) => {
          const newCursors = new Map(prev);
          newCursors.set(data.userId, {
            ...data,
            color: getUserColor(data.userId),
          });
          return newCursors;
        });

        // Clear old timeout
        const oldTimeout = cursorTimeoutRef.current.get(data.userId);
        if (oldTimeout) clearTimeout(oldTimeout);

        // Set timeout to remove cursor after 5 seconds of inactivity
        const timeout = setTimeout(() => {
          setCursors((prev) => {
            const newCursors = new Map(prev);
            newCursors.delete(data.userId);
            return newCursors;
          });
        }, 5000);

        cursorTimeoutRef.current.set(data.userId, timeout);
      }
    );

    newSocket.on(
      'typing-start',
      (data: { userId: string; userName: string; timestamp: number }) => {
        if (data.userId === userId) return; // Ignore own typing

        setTypingUsers((prev) => {
          const newTyping = new Map(prev);
          newTyping.set(data.userId, data);
          return newTyping;
        });

        // Clear old timeout
        const oldTimeout = typingTimeoutRef.current.get(data.userId);
        if (oldTimeout) clearTimeout(oldTimeout);

        // Auto-clear after 3 seconds
        const timeout = setTimeout(() => {
          setTypingUsers((prev) => {
            const newTyping = new Map(prev);
            newTyping.delete(data.userId);
            return newTyping;
          });
        }, 3000);

        typingTimeoutRef.current.set(data.userId, timeout);
      }
    );

    newSocket.on('typing-stop', (data: { userId: string }) => {
      setTypingUsers((prev) => {
        const newTyping = new Map(prev);
        newTyping.delete(data.userId);
        return newTyping;
      });

      const timeout = typingTimeoutRef.current.get(data.userId);
      if (timeout) {
        clearTimeout(timeout);
        typingTimeoutRef.current.delete(data.userId);
      }
    });

    setSocket(newSocket);

    return () => {
      // Cleanup
      newSocket.emit('leave-document', { pageId, userId });
      newSocket.disconnect();

      // Clear all timeouts
      typingTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      cursorTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, [enabled, pageId, userId, userName, teamId]);

  // Send cursor position with debouncing
  const sendCursorPosition = useCallback(
    (position: { x: number; y: number }, selection?: { start: number; end: number }) => {
      if (!socket || !isConnected) return;

      socket.emit('cursor-update', {
        pageId,
        userId,
        userName,
        position,
        selection,
      });
    },
    [socket, isConnected, pageId, userId, userName]
  );

  // Send typing start
  const sendTypingStart = useCallback(() => {
    if (!socket || !isConnected) return;

    socket.emit('typing-start', {
      pageId,
      userId,
      userName,
    });
  }, [socket, isConnected, pageId, userId, userName]);

  // Send typing stop
  const sendTypingStop = useCallback(() => {
    if (!socket || !isConnected) return;

    socket.emit('typing-stop', {
      pageId,
      userId,
    });
  }, [socket, isConnected, pageId, userId]);

  return {
    socket,
    isConnected,
    cursors: Array.from(cursors.values()),
    typingUsers: Array.from(typingUsers.values()),
    sessionUsers,
    sendCursorPosition,
    sendTypingStart,
    sendTypingStop,
  };
}
