import * as Y from 'yjs';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { DBStorage } from '../storage.js';
import logger from './logger.js';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Collaboration robustness (Phase 3)
 *
 * Goals:
 * - Persistence policy: debounced saves + periodic snapshots while active
 * - Lifecycle management: TTL unload + max-docs-in-memory (LRU eviction)
 * - Safety guards: rate limiting + max clients/doc + strong validation
 */
type PermissionLevel = 'owner' | 'editor' | 'commenter' | 'viewer';
type SaveReason = 'debounce' | 'interval' | 'manual' | 'ttl' | 'eviction';

type CollabConfig = {
  saveDebounceMs: number;
  snapshotIntervalMs: number;
  docTtlMs: number;
  maxDocs: number;
  maxClientsPerDoc: number;
  rateLimitUpdatesPerSec: number;
  rateLimitAwarenessPerSec: number;
  rateLimitSavesPerMin: number;
  requireAuth: boolean;
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function getCollabConfig(): CollabConfig {
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
  const rateLimitUpdatesPerSec = clampInt(
    process.env.COLLAB_RATE_LIMIT_UPDATES_PER_SEC,
    200,
    10,
    5000
  );
  const rateLimitAwarenessPerSec = clampInt(
    process.env.COLLAB_RATE_LIMIT_AWARENESS_PER_SEC,
    100,
    10,
    2000
  );
  const rateLimitSavesPerMin = clampInt(process.env.COLLAB_RATE_LIMIT_SAVES_PER_MIN, 6, 1, 60);

  // Ensure snapshot interval isn't smaller than debounce (to avoid pathological configs)
  const safeSnapshotIntervalMs = Math.max(snapshotIntervalMs, saveDebounceMs);

  return {
    requireAuth,
    saveDebounceMs,
    snapshotIntervalMs: safeSnapshotIntervalMs,
    docTtlMs,
    maxDocs,
    maxClientsPerDoc,
    rateLimitUpdatesPerSec,
    rateLimitAwarenessPerSec,
    rateLimitSavesPerMin,
  };
}

function parseDocumentId(
  documentId: unknown
): { ok: true; pageId: number } | { ok: false; reason: string } {
  if (typeof documentId !== 'string') return { ok: false, reason: 'documentId must be a string' };
  const m = /^page-(\d+)$/.exec(documentId);
  if (!m) return { ok: false, reason: 'documentId must match page-{id}' };
  const pageId = Number(m[1]);
  if (!Number.isInteger(pageId) || pageId <= 0) return { ok: false, reason: 'invalid pageId' };
  return { ok: true, pageId };
}

function parsePositiveInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

type SocketIdentity = {
  userId?: number;
  userEmail?: string;
};

function getSocketIdentity(socket: Socket, cfg: CollabConfig): SocketIdentity {
  if (!cfg.requireAuth) return {};
  const token =
    (socket.handshake.auth as any)?.token ||
    (socket.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '');
  if (!token || typeof token !== 'string') return {};
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: number; email?: string };
    return { userId: decoded.id, userEmail: decoded.email };
  } catch {
    return {};
  }
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

type DocMetrics = {
  savesAttempted: number;
  savesSucceeded: number;
  savesFailed: number;
  lastSaveAt?: number;
  lastSaveReason?: SaveReason;
  lastSaveDurationMs?: number;
};

type DocState = {
  documentId: string;
  pageId: number;
  ydoc: Y.Doc;
  clients: Set<string>;
  lastAccessAt: number;
  dirty: boolean;
  updateListener: (update: Uint8Array, origin: any) => void;
  debounceTimer?: NodeJS.Timeout;
  snapshotTimer?: NodeJS.Timeout;
  ttlTimer?: NodeJS.Timeout;
  metrics: DocMetrics;
};

class YjsCollaborationManager {
  private docs = new Map<string, DocState>();
  private saveLimiter = createSaveLimiter();

  constructor(
    private namespace: ReturnType<SocketIOServer['of']>,
    private storage: DBStorage,
    private cfg: CollabConfig
  ) {}

  getDoc(documentId: string): DocState | undefined {
    return this.docs.get(documentId);
  }

  getUserCount(documentId: string): number {
    return this.docs.get(documentId)?.clients.size || 0;
  }

  getActiveDocuments(): string[] {
    return Array.from(this.docs.keys());
  }

  private async createDoc(documentId: string, pageId: number): Promise<DocState> {
    this.ensureCapacityFor(documentId);

    const ydoc = new Y.Doc();

    // Load persisted state before attaching update listeners.
    const page = await this.storage.getWikiPage(pageId);
    if (page && page.blocks && Array.isArray(page.blocks)) {
      const yblocks = ydoc.getArray('blocks');
      yblocks.delete(0, yblocks.length);
      yblocks.push(page.blocks as any[]);
      logger.info('Loaded Yjs document state from database', {
        documentId,
        pageId,
        blockCount: (page.blocks as any[]).length,
      });
    }

    const state: DocState = {
      documentId,
      pageId,
      ydoc,
      clients: new Set(),
      lastAccessAt: Date.now(),
      dirty: false,
      updateListener: (update: Uint8Array, origin: any) => {
        // Broadcast to all other clients in the room
        const originSocketId = typeof origin === 'string' ? origin : undefined;
        if (originSocketId) {
          this.namespace
            .to(documentId)
            // Socket.IO v4 supports except(); types may not include it everywhere, so cast.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .except(originSocketId as any)
            .emit('yjs:update', { update: Buffer.from(update).toString('base64') });
        } else {
          this.namespace.to(documentId).emit('yjs:update', {
            update: Buffer.from(update).toString('base64'),
          });
        }

        // Persistence: debounced save + periodic snapshots while active.
        this.markDirty(documentId);
      },
      metrics: {
        savesAttempted: 0,
        savesSucceeded: 0,
        savesFailed: 0,
      },
    };

    ydoc.on('update', state.updateListener);
    this.docs.set(documentId, state);
    logger.info('Created new Yjs document', { documentId, pageId });
    return state;
  }

  private ensureCapacityFor(incomingDocId: string): void {
    if (this.docs.size < this.cfg.maxDocs) return;

    // Prefer evicting docs with no active clients (LRU).
    const candidates = Array.from(this.docs.values()).filter((d) => d.clients.size === 0);
    if (candidates.length === 0) {
      throw new Error(
        `Collaboration capacity exceeded (COLLAB_MAX_DOCS=${this.cfg.maxDocs}); cannot open ${incomingDocId}`
      );
    }

    candidates.sort((a, b) => a.lastAccessAt - b.lastAccessAt);
    const victim = candidates[0];
    void this.unloadDoc(victim.documentId, 'eviction');
  }

  async getOrCreate(documentId: string, pageId: number): Promise<DocState> {
    const existing = this.docs.get(documentId);
    if (existing) {
      existing.lastAccessAt = Date.now();
      return existing;
    }
    return await this.createDoc(documentId, pageId);
  }

  async joinDocument(
    socket: Socket,
    documentId: string,
    pageId: number
  ): Promise<{ canEdit: boolean; permission: PermissionLevel | null }> {
    const doc = await this.getOrCreate(documentId, pageId);
    doc.lastAccessAt = Date.now();

    // Max clients per doc guard
    if (doc.clients.size >= this.cfg.maxClientsPerDoc) {
      throw new Error(
        `Room is full (COLLAB_MAX_CLIENTS_PER_DOC=${this.cfg.maxClientsPerDoc}) for ${documentId}`
      );
    }

    // Cancel pending TTL unload if someone joins
    if (doc.ttlTimer) {
      clearTimeout(doc.ttlTimer);
      doc.ttlTimer = undefined;
    }

    doc.clients.add(socket.id);
    socket.join(documentId);
    this.ensureSnapshotTimer(doc);

    // Permission info is stored on socket in setup handler; read it here.
    const permission = (socket.data.userPermission as PermissionLevel | null) ?? null;
    const canEdit = !!socket.data.canEdit;

    logger.info('User joined Yjs document', {
      documentId,
      pageId,
      socketId: socket.id,
      totalUsers: doc.clients.size,
      userId: socket.data.userId,
      permission,
      canEdit,
    });

    return { canEdit, permission };
  }

  leaveDocument(socket: Socket): void {
    const documentId = socket.data.documentId as string | undefined;
    if (!documentId) return;

    const doc = this.docs.get(documentId);
    if (!doc) return;

    doc.clients.delete(socket.id);
    doc.lastAccessAt = Date.now();

    logger.info('User left Yjs document', {
      documentId,
      socketId: socket.id,
      remainingUsers: doc.clients.size,
    });

    if (doc.clients.size === 0) {
      this.stopSnapshotTimer(doc);
      this.scheduleTtlUnload(doc);
    }
  }

  private scheduleDebouncedSave(doc: DocState): void {
    if (doc.debounceTimer) clearTimeout(doc.debounceTimer);
    doc.debounceTimer = setTimeout(() => {
      doc.debounceTimer = undefined;
      void this.saveDoc(doc.documentId, 'debounce');
    }, this.cfg.saveDebounceMs);
  }

  private ensureSnapshotTimer(doc: DocState): void {
    if (doc.snapshotTimer) return;
    doc.snapshotTimer = setInterval(() => {
      // While active, snapshot periodically but only if dirty.
      if (doc.clients.size === 0) return;
      if (!doc.dirty) return;
      void this.saveDoc(doc.documentId, 'interval');
    }, this.cfg.snapshotIntervalMs);
  }

  private stopSnapshotTimer(doc: DocState): void {
    if (!doc.snapshotTimer) return;
    clearInterval(doc.snapshotTimer);
    doc.snapshotTimer = undefined;
  }

  private scheduleTtlUnload(doc: DocState): void {
    if (doc.ttlTimer) clearTimeout(doc.ttlTimer);
    doc.ttlTimer = setTimeout(() => {
      doc.ttlTimer = undefined;
      void this.unloadDoc(doc.documentId, 'ttl');
    }, this.cfg.docTtlMs);
  }

  markDirty(documentId: string): void {
    const doc = this.docs.get(documentId);
    if (!doc) return;
    doc.dirty = true;
    doc.lastAccessAt = Date.now();
    this.scheduleDebouncedSave(doc);
  }

  async saveDoc(documentId: string, reason: SaveReason): Promise<void> {
    const doc = this.docs.get(documentId);
    if (!doc) return;
    if (!doc.dirty && reason !== 'manual') return;

    // Per-doc save limiter to avoid excessive writes even if misconfigured.
    if (!this.saveLimiter.allow(documentId, this.cfg.rateLimitSavesPerMin)) {
      logger.warn('Throttled Yjs save (rate limit)', { documentId, reason });
      return;
    }

    const startedAt = Date.now();
    doc.metrics.savesAttempted += 1;

    try {
      const yblocks = doc.ydoc.getArray('blocks');
      const blocks = yblocks.toArray();

      await this.storage.updateWikiPage(doc.pageId, { blocks });

      doc.dirty = false;
      doc.metrics.savesSucceeded += 1;
      doc.metrics.lastSaveAt = Date.now();
      doc.metrics.lastSaveReason = reason;
      doc.metrics.lastSaveDurationMs = Date.now() - startedAt;

      logger.info('Saved Yjs document snapshot to database', {
        documentId,
        pageId: doc.pageId,
        blockCount: blocks.length,
        reason,
        savesSucceeded: doc.metrics.savesSucceeded,
        savesFailed: doc.metrics.savesFailed,
        lastSaveDurationMs: doc.metrics.lastSaveDurationMs,
      });
    } catch (error) {
      doc.metrics.savesFailed += 1;
      logger.error('Failed to save Yjs document snapshot to database', {
        documentId,
        pageId: doc.pageId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  async unloadDoc(documentId: string, reason: Exclude<SaveReason, 'manual'>): Promise<void> {
    const doc = this.docs.get(documentId);
    if (!doc) return;
    if (doc.clients.size > 0) return;

    // Best-effort final save if dirty before unloading.
    if (doc.dirty) {
      await this.saveDoc(documentId, reason);
    }

    if (doc.debounceTimer) clearTimeout(doc.debounceTimer);
    if (doc.snapshotTimer) clearInterval(doc.snapshotTimer);
    if (doc.ttlTimer) clearTimeout(doc.ttlTimer);

    doc.ydoc.off('update', doc.updateListener);
    doc.ydoc.destroy();
    this.docs.delete(documentId);

    logger.info('Unloaded Yjs document from memory', {
      documentId,
      pageId: doc.pageId,
      reason,
      savesSucceeded: doc.metrics.savesSucceeded,
      savesFailed: doc.metrics.savesFailed,
    });
  }
}

// Exposed for diagnostics/testing
let yjsManager: YjsCollaborationManager | null = null;

/**
 * Setup Yjs collaboration with Socket.IO
 */
export function setupYjsCollaboration(io: SocketIOServer, storage: DBStorage) {
  const yjsNamespace = io.of('/yjs');
  const cfg = getCollabConfig();
  yjsManager = new YjsCollaborationManager(yjsNamespace, storage, cfg);

  logger.info('Yjs collaboration server initialized', {
    saveDebounceMs: cfg.saveDebounceMs,
    snapshotIntervalMs: cfg.snapshotIntervalMs,
    docTtlMs: cfg.docTtlMs,
    maxDocs: cfg.maxDocs,
    maxClientsPerDoc: cfg.maxClientsPerDoc,
    requireAuth: cfg.requireAuth,
  });

  yjsNamespace.on('connection', (socket: Socket) => {
    const identity = getSocketIdentity(socket, cfg);
    socket.data.userId = identity.userId;
    socket.data.userEmail = identity.userEmail;

    const rate = createRateLimiter();

    if (cfg.requireAuth && !identity.userId) {
      logger.warn('Yjs connection rejected: missing/invalid token', { socketId: socket.id });
      socket.emit('yjs:error', { message: 'Authentication required', code: 'AUTH_REQUIRED' });
      socket.disconnect(true);
      return;
    }

    logger.info('Yjs client connected', {
      socketId: socket.id,
      userId: identity.userId,
      userEmail: identity.userEmail,
    });

    // Join document
    socket.on('yjs:join', async (data: { documentId: string; pageId: number; userId?: number }) => {
      try {
        const { documentId } = data;
        const parsed = parseDocumentId(documentId);
        if (!parsed.ok) {
          socket.emit('yjs:error', { message: parsed.reason, code: 'INVALID_DOCUMENT_ID' });
          return;
        }

        const pageId = parsePositiveInt((data as any).pageId) ?? parsed.pageId;
        if (pageId !== parsed.pageId) {
          socket.emit('yjs:error', {
            message: 'pageId does not match documentId',
            code: 'PAGE_MISMATCH',
          });
          return;
        }

        const userId = socket.data.userId as number | undefined;

        // ===== PERMISSION CHECK =====
        // Check if user has at least viewer permission to access this page
        const hasPermission = await storage.checkPagePermission(userId, pageId, 'viewer');
        if (!hasPermission) {
          logger.warn('Permission denied for Yjs document access', {
            socketId: socket.id,
            documentId,
            pageId,
            userId,
          });
          socket.emit('yjs:error', {
            message: 'Permission denied. You do not have access to this page.',
            code: 'PERMISSION_DENIED',
          });
          return;
        }

        // Get user's permission level to determine edit rights
        const userPermission = userId ? await storage.getUserPagePermission(userId, pageId) : null;
        const canEdit = userPermission === 'owner' || userPermission === 'editor';

        // Store permission info in socket data for later checks
        socket.data.userId = userId;
        socket.data.pageId = pageId;
        socket.data.userPermission = userPermission;
        socket.data.canEdit = canEdit;

        logger.info('User permission for Yjs document', {
          socketId: socket.id,
          userId,
          pageId,
          permission: userPermission,
          canEdit,
        });
        // ===== END PERMISSION CHECK =====

        // Join doc in manager (enforces max clients/doc and capacity)
        const joinResult = await yjsManager!.joinDocument(socket, documentId, pageId);

        const ydoc = yjsManager!.getDoc(documentId)!.ydoc;

        // Send current state to new client
        const stateVector = Y.encodeStateAsUpdate(ydoc);
        socket.emit('yjs:init', {
          stateVector: Buffer.from(stateVector).toString('base64'),
          userCount: yjsManager!.getUserCount(documentId),
          permission: joinResult.permission,
          canEdit: joinResult.canEdit,
        });
        socket.data.documentId = documentId;
        socket.data.ydoc = ydoc;

        logger.info('Client joined Yjs document', {
          socketId: socket.id,
          documentId,
          pageId,
          userCount: yjsManager!.getUserCount(documentId),
          permission: joinResult.permission,
        });
      } catch (error) {
        logger.error('Error joining Yjs document:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        socket.emit('yjs:error', { message: 'Failed to join document' });
      }
    });

    // Receive updates from client
    socket.on('yjs:update', async (data: { documentId: string; update: string }) => {
      try {
        if (!rate.allow(`${socket.id}:update`, cfg.rateLimitUpdatesPerSec)) {
          logger.warn('Rate-limited Yjs update', { socketId: socket.id });
          return;
        }

        const { documentId, update } = data;

        const currentDocId = socket.data.documentId as string | undefined;
        if (!currentDocId || currentDocId !== documentId) {
          socket.emit('yjs:error', {
            message: 'Not joined to this document',
            code: 'NOT_JOINED',
          });
          return;
        }

        // ===== PERMISSION CHECK =====
        // Only allow updates from users with edit permission
        if (!socket.data.canEdit) {
          logger.warn('Blocked Yjs update from user without edit permission', {
            socketId: socket.id,
            documentId,
            userId: socket.data.userId,
            permission: socket.data.userPermission,
          });
          socket.emit('yjs:error', {
            message: 'You do not have permission to edit this page.',
            code: 'EDIT_PERMISSION_REQUIRED',
          });
          return;
        }
        // ===== END PERMISSION CHECK =====

        const doc = yjsManager!.getDoc(documentId);
        if (!doc) {
          socket.emit('yjs:error', { message: 'Document not loaded', code: 'DOC_NOT_LOADED' });
          return;
        }

        // Apply update to Yjs document
        const updateBuffer = Buffer.from(update, 'base64');
        Y.applyUpdate(doc.ydoc, updateBuffer, socket.id); // Use socket.id as origin

        logger.debug('Applied Yjs update', {
          documentId,
          socketId: socket.id,
          userId: socket.data.userId,
          updateSize: updateBuffer.length,
        });
      } catch (error) {
        logger.error('Error applying Yjs update:', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Handle awareness (cursor positions, user presence)
    socket.on('yjs:awareness', (data: { documentId: string; awarenessUpdate: string }) => {
      if (!rate.allow(`${socket.id}:awareness`, cfg.rateLimitAwarenessPerSec)) {
        return;
      }
      const { documentId, awarenessUpdate } = data;
      const currentDocId = socket.data.documentId as string | undefined;
      if (!currentDocId || currentDocId !== documentId) return;
      // Broadcast awareness to other clients
      socket.to(documentId).emit('yjs:awareness', {
        socketId: socket.id,
        awarenessUpdate,
      });
    });

    // Manual save request
    socket.on('yjs:save', async (data: { documentId: string; pageId: number }) => {
      try {
        const { documentId } = data;
        const currentDocId = socket.data.documentId as string | undefined;
        if (!currentDocId || currentDocId !== documentId) {
          socket.emit('yjs:saved', { success: false, error: 'Not joined' });
          return;
        }

        // Only allow manual save by editors/owners
        if (!socket.data.canEdit) {
          socket.emit('yjs:saved', { success: false, error: 'Edit permission required' });
          return;
        }

        await yjsManager!.saveDoc(documentId, 'manual');
        socket.emit('yjs:saved', { success: true });
      } catch (error) {
        logger.error('Error saving document:', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        socket.emit('yjs:saved', { success: false, error: 'Save failed' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const documentId = socket.data.documentId as string | undefined;
      if (documentId) {
        yjsManager?.leaveDocument(socket);
        logger.info('Client disconnected from Yjs', {
          socketId: socket.id,
          documentId,
          remainingUsers: yjsManager?.getUserCount(documentId) ?? 0,
        });
      }
    });
  });

  return yjsNamespace;
}

export { yjsManager };
