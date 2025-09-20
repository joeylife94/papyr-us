import { io, Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';

interface User {
  id: string;
  name: string;
  teamId?: string;
}

interface DocumentChange {
  pageId: number;
  blockId: string;
  type: 'insert' | 'update' | 'delete';
  data?: any;
  timestamp: number;
  userId: string;
}

interface CursorPosition {
  x: number;
  y: number;
  selection?: { start: number; end: number };
}

interface CollaborationState {
  users: User[];
  isConnected: boolean;
  isTyping: boolean;
  typingUsers: string[];
}

class SocketManager {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  connect(url: string = 'http://localhost:5001'): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true
    });

    this.socket.on('connect', () => {
      console.log('Connected to Socket.IO server');
      this.emit('connect');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
      this.emit('disconnect');
    });

    this.socket.on('error', (error: any) => {
      console.error('Socket.IO error:', error);
      this.emit('error', error);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback: (...args: any[]) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }

    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  emit(event: string, ...args: any[]): void {
    if (this.socket) {
      this.socket.emit(event, ...args);
    }
  }

  private emitInternal(event: string, ...args: any[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in socket listener for ${event}:`, error);
        }
      });
    }
  }
}

const socketManager = new SocketManager();

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = socketManager.connect();
    socketRef.current = socket;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    emit: socketManager.emit.bind(socketManager),
    on: socketManager.on.bind(socketManager),
    off: socketManager.off.bind(socketManager)
  };
}

export function useCollaboration(pageId: number, userId: string, userName: string, teamId?: string) {
  const { socket, isConnected, emit, on, off } = useSocket();
  const [collaborationState, setCollaborationState] = useState<CollaborationState>({
    users: [],
    isConnected: false,
    isTyping: false,
    typingUsers: []
  });

  // Join document session
  useEffect(() => {
    if (socket && pageId && userId && userName) {
      emit('join-document', { pageId, userId, userName, teamId });
    }
  }, [socket, pageId, userId, userName, teamId, emit]);

  // Handle session users
  useEffect(() => {
    const handleSessionUsers = (users: User[]) => {
      setCollaborationState(prev => ({ ...prev, users }));
    };

    const handleUserJoined = (data: { userId: string; userName: string }) => {
      setCollaborationState(prev => ({
        ...prev,
        users: [...prev.users, { id: data.userId, name: data.userName }]
      }));
    };

    const handleUserLeft = (data: { userId: string }) => {
      setCollaborationState(prev => ({
        ...prev,
        users: prev.users.filter(user => user.id !== data.userId)
      }));
    };

    const handleTypingStart = (data: { userId: string; userName: string }) => {
      setCollaborationState(prev => ({
        ...prev,
        typingUsers: [...prev.typingUsers.filter(id => id !== data.userId), data.userId]
      }));
    };

    const handleTypingStop = (data: { userId: string }) => {
      setCollaborationState(prev => ({
        ...prev,
        typingUsers: prev.typingUsers.filter(id => id !== data.userId)
      }));
    };

    on('session-users', handleSessionUsers);
    on('user-joined', handleUserJoined);
    on('user-left', handleUserLeft);
    on('typing-start', handleTypingStart);
    on('typing-stop', handleTypingStop);

    return () => {
      off('session-users', handleSessionUsers);
      off('user-joined', handleUserJoined);
      off('user-left', handleUserLeft);
      off('typing-start', handleTypingStart);
      off('typing-stop', handleTypingStop);
    };
  }, [on, off]);

  // Update connection state
  useEffect(() => {
    setCollaborationState(prev => ({ ...prev, isConnected }));
  }, [isConnected]);

  // Leave document on unmount
  useEffect(() => {
    return () => {
      if (socket && pageId && userId) {
        emit('leave-document', { pageId, userId });
      }
    };
  }, [socket, pageId, userId, emit]);

  const sendDocumentChange = (change: Omit<DocumentChange, 'timestamp' | 'userId'>) => {
    emit('document-change', {
      ...change,
      userId,
      timestamp: Date.now()
    });
  };

  const sendCursorUpdate = (position: CursorPosition) => {
    emit('cursor-update', {
      pageId,
      userId,
      userName,
      position,
      timestamp: Date.now()
    });
  };

  const sendTypingStart = () => {
    emit('typing-start', { pageId, userId, userName });
  };

  const sendTypingStop = () => {
    emit('typing-stop', { pageId, userId });
  };

  return {
    ...collaborationState,
    socket,
    sendDocumentChange,
    sendCursorUpdate,
    sendTypingStart,
    sendTypingStop
  };
}

export { socketManager }; 