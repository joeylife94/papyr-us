import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { DBStorage } from '../storage.js';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import logger from './logger.js';

type SaveReason = 'debounce' | 'interval' | 'ttl' | 'eviction';

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parsePositiveInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

type LegacyCollabConfig = {
  requireAuth: boolean;
  saveDebounceMs: number;
  snapshotIntervalMs: number;
  docTtlMs: number;
  maxDocs: number;
  maxClientsPerDoc: number;
  rateLimitDocChangesPerSec: number;
  rateLimitCursorPerSec: number;
  rateLimitTypingPerSec: number;
  rateLimitSavesPerMin: number;
};

function getLegacyCollabConfig(): LegacyCollabConfig {
  const requireAuth = process.env.COLLAB_REQUIRE_AUTH !== '0';
  const saveDebounceMs = clampInt(process.env.COLLAB_SAVE_DEBOUNCE_MS, 3000, 500, 60000);
  const snapshotIntervalMs = clampInt(
    process.env.COLLAB_SNAPSHOT_INTERVAL_MS,
    60000,
    5000,
    10 * 60 * 1000
  );
  const docTtlMs = clampInt(process.env.COLLAB_DOC_TTL_MS, 5 * 60 * 1000, 10_000, 60 * 60 * 1000);
  const maxDocs = clampInt(process.env.COLLAB_MAX_DOCS, 50, 1, 500);
  const maxClientsPerDoc = clampInt(process.env.COLLAB_MAX_CLIENTS_PER_DOC, 20, 1, 200);
  const rateLimitDocChangesPerSec = clampInt(
    process.env.COLLAB_RATE_LIMIT_DOC_CHANGES_PER_SEC,
    50,
    5,
    2000
  );
  const rateLimitCursorPerSec = clampInt(process.env.COLLAB_RATE_LIMIT_CURSOR_PER_SEC, 30, 5, 2000);
  const rateLimitTypingPerSec = clampInt(process.env.COLLAB_RATE_LIMIT_TYPING_PER_SEC, 20, 5, 2000);
  const rateLimitSavesPerMin = clampInt(process.env.COLLAB_RATE_LIMIT_SAVES_PER_MIN, 6, 1, 60);

  const safeSnapshotIntervalMs = Math.max(snapshotIntervalMs, saveDebounceMs);

  return {
    requireAuth,
    saveDebounceMs,
    snapshotIntervalMs: safeSnapshotIntervalMs,
    docTtlMs,
    maxDocs,
    maxClientsPerDoc,
    rateLimitDocChangesPerSec,
    rateLimitCursorPerSec,
    rateLimitTypingPerSec,
    rateLimitSavesPerMin,
  };
}

type RateWindow = { startedAt: number; count: number };

function createRateLimiter() {
  const windows = new Map<string, RateWindow>();
  return {
    allow(key: string, limitPerSec: number): boolean {
      const now = Date.now();
      const win = windows.get(key);
      if (!win || now - win.startedAt >= 1000) {
        windows.set(key, { startedAt: now, count: 1 });
        return true;
      }
      if (win.count >= limitPerSec) return false;
      win.count += 1;
      return true;
    },
  };
}

type SaveWindow = { startedAt: number; count: number };

function createSaveLimiter() {
  const windows = new Map<string, SaveWindow>();
  return {
    allow(key: string, limitPerMin: number): boolean {
      const now = Date.now();
      const win = windows.get(key);
      if (!win || now - win.startedAt >= 60_000) {
        windows.set(key, { startedAt: now, count: 1 });
        return true;
      }
      if (win.count >= limitPerMin) return false;
      win.count += 1;
      return true;
    },
  };
}

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
  lastAccessAt: number;
  dirty: boolean;
  latestBlocks?: any[];
  debounceTimer?: NodeJS.Timeout;
  snapshotTimer?: NodeJS.Timeout;
  ttlTimer?: NodeJS.Timeout;
  metrics: {
    savesAttempted: number;
    savesSucceeded: number;
    savesFailed: number;
    lastSaveAt?: number;
    lastSaveReason?: SaveReason;
    lastSaveDurationMs?: number;
  };
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

class CollaborationManager {
  private sessions = new Map<number, CollaborationSession>();
  private userSessions = new Map<string, number>(); // userId -> pageId
  private saveLimiter = createSaveLimiter();

  constructor(
    private storage: DBStorage,
    private cfg: LegacyCollabConfig
  ) {}

  createSession(pageId: number): CollaborationSession {
    this.ensureCapacityFor(pageId);

    const session: CollaborationSession = {
      pageId,
      users: new Map(),
      changes: [],
      lastAccessAt: Date.now(),
      dirty: false,
      metrics: {
        savesAttempted: 0,
        savesSucceeded: 0,
        savesFailed: 0,
      },
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

    // Cancel TTL unload if someone joins.
    if (session.ttlTimer) {
      clearTimeout(session.ttlTimer);
      session.ttlTimer = undefined;
    }

    session.lastAccessAt = Date.now();

    session.users.set(user.id, user);
    this.userSessions.set(user.id, pageId);

    this.ensureSnapshotTimer(session);
  }

  leaveSession(userId: string): void {
    const pageId = this.userSessions.get(userId);
    if (pageId) {
      const session = this.getSession(pageId);
      if (session) {
        session.users.delete(userId);
        session.lastAccessAt = Date.now();
        if (session.users.size === 0) {
          this.stopSnapshotTimer(session);
          this.scheduleTtlUnload(session);
        }
      }
      this.userSessions.delete(userId);
    }
  }

  addChange(pageId: number, change: DocumentChange): void {
    const session = this.getSession(pageId);
    if (session) {
      session.lastAccessAt = Date.now();
      session.changes.push(change);
      // Keep only last 100 changes to prevent memory issues
      if (session.changes.length > 100) {
        session.changes = session.changes.slice(-100);
      }

      // Capture latest blocks for persistence (when available)
      const blocks = change.data?.blocks;
      if (Array.isArray(blocks)) {
        session.latestBlocks = blocks;
        this.markDirty(pageId);
      }
    }
  }

  getUsersInSession(pageId: number): User[] {
    const session = this.getSession(pageId);
    return session ? Array.from(session.users.values()) : [];
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getUserCount(pageId: number): number {
    return this.sessions.get(pageId)?.users.size || 0;
  }

  private ensureCapacityFor(incomingPageId: number): void {
    if (this.sessions.size < this.cfg.maxDocs) return;

    // Evict least recently used inactive sessions.
    const candidates = Array.from(this.sessions.values()).filter((s) => s.users.size === 0);
    if (candidates.length === 0) {
      throw new Error(
        `Collaboration capacity exceeded (COLLAB_MAX_DOCS=${this.cfg.maxDocs}); cannot open page:${incomingPageId}`
      );
    }

    candidates.sort((a, b) => a.lastAccessAt - b.lastAccessAt);
    const victim = candidates[0];
    void this.unloadSession(victim.pageId, 'eviction');
  }

  private ensureSnapshotTimer(session: CollaborationSession): void {
    if (session.snapshotTimer) return;
    session.snapshotTimer = setInterval(() => {
      if (session.users.size === 0) return;
      if (!session.dirty) return;
      void this.saveSession(session.pageId, 'interval');
    }, this.cfg.snapshotIntervalMs);
  }

  private stopSnapshotTimer(session: CollaborationSession): void {
    if (!session.snapshotTimer) return;
    clearInterval(session.snapshotTimer);
    session.snapshotTimer = undefined;
  }

  private scheduleTtlUnload(session: CollaborationSession): void {
    if (session.ttlTimer) clearTimeout(session.ttlTimer);
    session.ttlTimer = setTimeout(() => {
      session.ttlTimer = undefined;
      void this.unloadSession(session.pageId, 'ttl');
    }, this.cfg.docTtlMs);
  }

  private scheduleDebouncedSave(session: CollaborationSession): void {
    if (session.debounceTimer) clearTimeout(session.debounceTimer);
    session.debounceTimer = setTimeout(() => {
      session.debounceTimer = undefined;
      void this.saveSession(session.pageId, 'debounce');
    }, this.cfg.saveDebounceMs);
  }

  markDirty(pageId: number): void {
    const session = this.sessions.get(pageId);
    if (!session) return;
    session.dirty = true;
    session.lastAccessAt = Date.now();
    this.scheduleDebouncedSave(session);
  }

  async saveSession(pageId: number, reason: SaveReason): Promise<void> {
    const session = this.sessions.get(pageId);
    if (!session) return;
    if (!session.dirty) return;
    if (!Array.isArray(session.latestBlocks)) return;

    const key = `page:${pageId}`;
    if (!this.saveLimiter.allow(key, this.cfg.rateLimitSavesPerMin)) {
      logger.warn('Throttled legacy collab save (rate limit)', { pageId, reason });
      return;
    }

    session.metrics.savesAttempted += 1;
    const startedAt = Date.now();

    try {
      await this.storage.updateWikiPage(pageId, { blocks: session.latestBlocks });

      session.dirty = false;
      session.metrics.savesSucceeded += 1;
      session.metrics.lastSaveAt = Date.now();
      session.metrics.lastSaveReason = reason;
      session.metrics.lastSaveDurationMs = Date.now() - startedAt;

      logger.info('Saved legacy collab snapshot to database', {
        pageId,
        blockCount: session.latestBlocks.length,
        reason,
        savesSucceeded: session.metrics.savesSucceeded,
        savesFailed: session.metrics.savesFailed,
        lastSaveDurationMs: session.metrics.lastSaveDurationMs,
      });
    } catch (error) {
      session.metrics.savesFailed += 1;
      logger.error('Failed to save legacy collab snapshot to database', {
        pageId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async unloadSession(pageId: number, reason: Exclude<SaveReason, never>): Promise<void> {
    const session = this.sessions.get(pageId);
    if (!session) return;
    if (session.users.size > 0) return;

    if (session.dirty) {
      await this.saveSession(pageId, reason);
    }

    if (session.debounceTimer) clearTimeout(session.debounceTimer);
    if (session.snapshotTimer) clearInterval(session.snapshotTimer);
    if (session.ttlTimer) clearTimeout(session.ttlTimer);

    this.sessions.delete(pageId);

    logger.info('Unloaded legacy collab session from memory', {
      pageId,
      reason,
      savesSucceeded: session.metrics.savesSucceeded,
      savesFailed: session.metrics.savesFailed,
    });
  }
}

export interface SocketIOFeatureOptions {
  enableCollaboration?: boolean;
  enableNotifications?: boolean;
}

export function setupSocketIO(
  server: HTTPServer,
  storage: DBStorage,
  options: SocketIOFeatureOptions = {}
) {
  const enableCollaboration = options.enableCollaboration ?? true;
  const enableNotifications = options.enableNotifications ?? true;

  const legacyCfg = getLegacyCollabConfig();
  const collaborationManager = new CollaborationManager(storage, legacyCfg);

  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Setup /collab namespace with optional JWT authentication
  const collabNamespace = io.of('/collab');

  // Check if authentication is required (can be disabled for testing)
  const requireAuth = legacyCfg.requireAuth;

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

    const rate = createRateLimiter();

    if (enableCollaboration) {
      // Join a document session
      socket.on(
        'join-document',
        async (data: { pageId: number; userId: string; userName: string; teamId?: string }) => {
          const pageId = parsePositiveInt(data.pageId);
          if (!pageId) {
            socket.emit('collab:error', { message: 'Invalid pageId' });
            return;
          }

          // Determine identity: prefer JWT-derived userId when auth is required.
          const authedUserId = parsePositiveInt(socket.userId);
          const fallbackUserId = legacyCfg.requireAuth ? null : parsePositiveInt(data.userId);
          const userIdNum = authedUserId ?? fallbackUserId;

          // Permission checks reuse storage page permissions.
          const hasPermission = await storage.checkPagePermission(
            userIdNum ?? undefined,
            pageId,
            'viewer'
          );
          if (!hasPermission) {
            socket.emit('collab:error', {
              message: 'Permission denied. You do not have access to this page.',
              code: 'PERMISSION_DENIED',
            });
            return;
          }

          const userPermission = userIdNum
            ? await storage.getUserPagePermission(userIdNum, pageId)
            : null;
          const canEdit = userPermission === 'owner' || userPermission === 'editor';
          (socket.data as any).pageId = pageId;
          (socket.data as any).userIdNum = userIdNum;
          (socket.data as any).userPermission = userPermission;
          (socket.data as any).canEdit = canEdit;

          // Max clients per doc guard
          const currentCount = collaborationManager.getUserCount(pageId);
          if (currentCount >= legacyCfg.maxClientsPerDoc) {
            socket.emit('collab:error', {
              message: `Room is full (max ${legacyCfg.maxClientsPerDoc} clients)`,
              code: 'ROOM_FULL',
            });
            return;
          }

          const user: User = {
            id: (userIdNum ? String(userIdNum) : socket.id) as string,
            name: typeof data.userName === 'string' ? data.userName.slice(0, 80) : 'Anonymous',
            teamId: data.teamId,
          };

          try {
            collaborationManager.joinSession(pageId, user);
          } catch (e) {
            socket.emit('collab:error', {
              message: e instanceof Error ? e.message : 'Capacity exceeded',
              code: 'CAPACITY_EXCEEDED',
            });
            return;
          }

          // Join the room for this document using page:<id> format
          const roomName = `page:${pageId}`;
          socket.join(roomName);

          // Notify others that user joined
          socket.to(roomName).emit('user-joined', {
            userId: user.id,
            userName: user.name,
            timestamp: Date.now(),
          });

          // Send current users in the session
          const users = collaborationManager.getUsersInSession(pageId);
          socket.emit('session-users', users);

          console.log(`[Collab] User ${user.name} joined document ${pageId}`);
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
          if (!rate.allow(`${socket.id}:change`, legacyCfg.rateLimitDocChangesPerSec)) {
            return;
          }

          const pageId = parsePositiveInt(data.pageId);
          if (!pageId) return;

          const currentPageId = (socket.data as any).pageId as number | undefined;
          if (!currentPageId || currentPageId !== pageId) {
            socket.emit('collab:error', { message: 'Not joined to this page', code: 'NOT_JOINED' });
            return;
          }

          // Only allow writes by editors/owners
          if (!(socket.data as any).canEdit) {
            socket.emit('collab:error', {
              message: 'You do not have permission to edit this page.',
              code: 'EDIT_PERMISSION_REQUIRED',
            });
            return;
          }

          const change: DocumentChange = {
            ...data,
            pageId,
            timestamp: Date.now(),
            userId: String(
              (socket.data as any).userIdNum ?? socket.userId ?? data.userId ?? socket.id
            ),
          };

          // Store the change
          collaborationManager.addChange(pageId, change);

          // Broadcast to other users in the same document using page:<id> format
          const roomName = `page:${pageId}`;
          socket.to(roomName).emit('document-change', change);
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
          if (!rate.allow(`${socket.id}:cursor`, legacyCfg.rateLimitCursorPerSec)) {
            return;
          }
          const pageId = parsePositiveInt(data.pageId);
          const currentPageId = (socket.data as any).pageId as number | undefined;
          if (!pageId || !currentPageId || currentPageId !== pageId) return;
          const roomName = `page:${pageId}`;
          socket.to(roomName).emit('cursor-update', {
            ...data,
            timestamp: Date.now(),
          });
        }
      );

      // Handle typing indicators
      socket.on('typing-start', (data: { pageId: number; userId: string; userName: string }) => {
        if (!rate.allow(`${socket.id}:typing`, legacyCfg.rateLimitTypingPerSec)) {
          return;
        }
        const pageId = parsePositiveInt(data.pageId);
        const currentPageId = (socket.data as any).pageId as number | undefined;
        if (!pageId || !currentPageId || currentPageId !== pageId) return;
        const roomName = `page:${pageId}`;
        socket.to(roomName).emit('typing-start', {
          ...data,
          timestamp: Date.now(),
        });
      });

      socket.on('typing-stop', (data: { pageId: number; userId: string }) => {
        if (!rate.allow(`${socket.id}:typing`, legacyCfg.rateLimitTypingPerSec)) {
          return;
        }
        const pageId = parsePositiveInt(data.pageId);
        const currentPageId = (socket.data as any).pageId as number | undefined;
        if (!pageId || !currentPageId || currentPageId !== pageId) return;
        const roomName = `page:${pageId}`;
        socket.to(roomName).emit('typing-stop', {
          ...data,
          timestamp: Date.now(),
        });
      });

      // Handle leaving a document
      socket.on('leave-document', (data: { pageId: number; userId: string }) => {
        const pageId = parsePositiveInt(data.pageId);
        const userIdKey = String(
          (socket.data as any).userIdNum ?? socket.userId ?? data.userId ?? socket.id
        );
        collaborationManager.leaveSession(userIdKey);
        if (pageId) {
          const roomName = `page:${pageId}`;
          socket.leave(roomName);

          socket.to(roomName).emit('user-left', {
            userId: userIdKey,
            timestamp: Date.now(),
          });
        }
      });
    }

    if (enableNotifications) {
      // Handle user presence for member notifications
      socket.on(
        'join-member',
        (data: { memberId: number | string }, ack?: (resp: { ok: boolean }) => void) => {
          const memberRoom = `user:${data.memberId}`;
          socket.join(memberRoom);
          console.log(`[Collab] User ${socket.userEmail} joined member room: ${memberRoom}`);
          if (typeof ack === 'function') ack({ ok: true });
        }
      );
    }

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`[Collab] User disconnected: ${socket.userEmail} (${socket.id})`);

      if (enableCollaboration) {
        // Find which document this user was in
        const userIdKey = String((socket.data as any).userIdNum ?? socket.userId ?? socket.id);
        collaborationManager.leaveSession(userIdKey);
      }
    });
  });

  return io;
}
