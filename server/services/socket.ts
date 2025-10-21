import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { DBStorage } from '../storage.js';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

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

interface CollaborationSession {
  pageId: number;
  users: Map<string, User>;
  changes: DocumentChange[];
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

class CollaborationManager {
  private sessions = new Map<number, CollaborationSession>();
  private userSessions = new Map<string, number>(); // userId -> pageId

  createSession(pageId: number): CollaborationSession {
    const session: CollaborationSession = {
      pageId,
      users: new Map(),
      changes: [],
    };
    this.sessions.set(pageId, session);
    return session;
  }

  getSession(pageId: number): CollaborationSession | undefined {
    return this.sessions.get(pageId);
  }

  joinSession(pageId: number, user: User): void {
    let session = this.getSession(pageId);
    if (!session) {
      session = this.createSession(pageId);
    }

    session.users.set(user.id, user);
    this.userSessions.set(user.id, pageId);
  }

  leaveSession(userId: string): void {
    const pageId = this.userSessions.get(userId);
    if (pageId) {
      const session = this.getSession(pageId);
      if (session) {
        session.users.delete(userId);
        if (session.users.size === 0) {
          this.sessions.delete(pageId);
        }
      }
      this.userSessions.delete(userId);
    }
  }

  addChange(pageId: number, change: DocumentChange): void {
    const session = this.getSession(pageId);
    if (session) {
      session.changes.push(change);
      // Keep only last 100 changes to prevent memory issues
      if (session.changes.length > 100) {
        session.changes = session.changes.slice(-100);
      }
    }
  }

  getUsersInSession(pageId: number): User[] {
    const session = this.getSession(pageId);
    return session ? Array.from(session.users.values()) : [];
  }
}

const collaborationManager = new CollaborationManager();

export function setupSocketIO(server: HTTPServer, storage: DBStorage) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Setup /collab namespace with optional JWT authentication
  const collabNamespace = io.of('/collab');

  // Check if authentication is required (can be disabled for testing)
  const requireAuth = process.env.COLLAB_REQUIRE_AUTH !== '0';

  // JWT authentication middleware for /collab namespace
  if (requireAuth) {
    collabNamespace.use((socket: AuthenticatedSocket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        console.warn('[Socket.IO] Connection rejected: No token provided');
        return next(new Error('Authentication required'));
      }

      try {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: string; email: string };
        socket.userId = decoded.id;
        socket.userEmail = decoded.email;
        console.log(`[Socket.IO] User authenticated: ${socket.userEmail} (${socket.userId})`);
        next();
      } catch (error) {
        console.warn(
          '[Socket.IO] Invalid token:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        return next(new Error('Invalid token'));
      }
    });
  } else {
    console.warn('[Socket.IO] Authentication disabled (COLLAB_REQUIRE_AUTH=0)');
  }

  collabNamespace.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[Collab] User connected: ${socket.userEmail} (${socket.id})`);

    // Join a document session
    socket.on(
      'join-document',
      async (data: { pageId: number; userId: string; userName: string; teamId?: string }) => {
        const user: User = {
          id: data.userId,
          name: data.userName,
          teamId: data.teamId,
        };

        collaborationManager.joinSession(data.pageId, user);

        // Join the room for this document using page:<id> format
        const roomName = `page:${data.pageId}`;
        socket.join(roomName);

        // Notify others that user joined
        socket.to(roomName).emit('user-joined', {
          userId: data.userId,
          userName: data.userName,
          timestamp: Date.now(),
        });

        // Send current users in the session
        const users = collaborationManager.getUsersInSession(data.pageId);
        socket.emit('session-users', users);

        console.log(`[Collab] User ${data.userName} joined document ${data.pageId}`);
      }
    );

    // Handle document changes
    socket.on(
      'document-change',
      async (data: {
        pageId: number;
        blockId: string;
        type: 'insert' | 'update' | 'delete';
        data?: any;
        userId: string;
      }) => {
        const change: DocumentChange = {
          ...data,
          timestamp: Date.now(),
        };

        // Store the change
        collaborationManager.addChange(data.pageId, change);

        // Broadcast to other users in the same document using page:<id> format
        const roomName = `page:${data.pageId}`;
        socket.to(roomName).emit('document-change', change);

        // Save to database if it's a significant change
        if (data.type === 'update' && data.data) {
          try {
            await storage.updateWikiPage(data.pageId, {
              blocks: data.data.blocks,
            });
          } catch (error) {
            console.error('[Collab] Error saving document change:', error);
          }
        }
      }
    );

    // Handle cursor position updates
    socket.on(
      'cursor-update',
      (data: {
        pageId: number;
        userId: string;
        userName: string;
        position: { x: number; y: number };
        selection?: { start: number; end: number };
      }) => {
        const roomName = `page:${data.pageId}`;
        socket.to(roomName).emit('cursor-update', {
          ...data,
          timestamp: Date.now(),
        });
      }
    );

    // Handle typing indicators
    socket.on('typing-start', (data: { pageId: number; userId: string; userName: string }) => {
      const roomName = `page:${data.pageId}`;
      socket.to(roomName).emit('typing-start', {
        ...data,
        timestamp: Date.now(),
      });
    });

    socket.on('typing-stop', (data: { pageId: number; userId: string }) => {
      const roomName = `page:${data.pageId}`;
      socket.to(roomName).emit('typing-stop', {
        ...data,
        timestamp: Date.now(),
      });
    });

    // Handle user presence for member notifications
    socket.on('join-member', (data: { memberId: number | string }) => {
      const memberRoom = `user:${data.memberId}`;
      socket.join(memberRoom);
      console.log(`[Collab] User ${socket.userEmail} joined member room: ${memberRoom}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`[Collab] User disconnected: ${socket.userEmail} (${socket.id})`);

      // Find which document this user was in
      const userId = socket.userId || socket.id;
      collaborationManager.leaveSession(userId);
    });

    // Handle leaving a document
    socket.on('leave-document', (data: { pageId: number; userId: string }) => {
      collaborationManager.leaveSession(data.userId);
      const roomName = `page:${data.pageId}`;
      socket.leave(roomName);

      socket.to(roomName).emit('user-left', {
        userId: data.userId,
        timestamp: Date.now(),
      });
    });
  });

  return io;
}

export { collaborationManager };
