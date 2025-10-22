import * as Y from 'yjs';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { DBStorage } from '../storage.js';
import logger from './logger.js';

/**
 * Yjs Document Manager
 * Manages Yjs documents for real-time collaborative editing with CRDT
 */
class YjsDocumentManager {
  private documents = new Map<string, Y.Doc>();
  private documentUsers = new Map<string, Set<string>>(); // documentId -> Set of socketIds
  private lastSaveTimestamps = new Map<string, number>();
  private saveIntervalMs = 5000; // Save to DB every 5 seconds

  /**
   * Get or create a Yjs document
   */
  getDocument(documentId: string): Y.Doc {
    let doc = this.documents.get(documentId);
    if (!doc) {
      doc = new Y.Doc();
      this.documents.set(documentId, doc);
      logger.info('Created new Yjs document', { documentId });
    }
    return doc;
  }

  /**
   * Add user to document
   */
  addUser(documentId: string, socketId: string): void {
    let users = this.documentUsers.get(documentId);
    if (!users) {
      users = new Set();
      this.documentUsers.set(documentId, users);
    }
    users.add(socketId);
    logger.info('User joined document', { documentId, socketId, totalUsers: users.size });
  }

  /**
   * Remove user from document
   */
  removeUser(documentId: string, socketId: string): void {
    const users = this.documentUsers.get(documentId);
    if (users) {
      users.delete(socketId);
      logger.info('User left document', { documentId, socketId, remainingUsers: users.size });

      // Clean up document if no users
      if (users.size === 0) {
        this.cleanupDocument(documentId);
      }
    }
  }

  /**
   * Clean up document when no users are connected
   */
  private cleanupDocument(documentId: string): void {
    this.documents.delete(documentId);
    this.documentUsers.delete(documentId);
    this.lastSaveTimestamps.delete(documentId);
    logger.info('Cleaned up unused document', { documentId });
  }

  /**
   * Get user count for a document
   */
  getUserCount(documentId: string): number {
    return this.documentUsers.get(documentId)?.size || 0;
  }

  /**
   * Check if document should be saved to DB
   */
  shouldSave(documentId: string): boolean {
    const lastSave = this.lastSaveTimestamps.get(documentId) || 0;
    return Date.now() - lastSave >= this.saveIntervalMs;
  }

  /**
   * Mark document as saved
   */
  markSaved(documentId: string): void {
    this.lastSaveTimestamps.set(documentId, Date.now());
  }

  /**
   * Get all active documents
   */
  getActiveDocuments(): string[] {
    return Array.from(this.documents.keys());
  }
}

const yjsManager = new YjsDocumentManager();

/**
 * Setup Yjs collaboration with Socket.IO
 */
export function setupYjsCollaboration(io: SocketIOServer, storage: DBStorage) {
  const yjsNamespace = io.of('/yjs');

  yjsNamespace.on('connection', (socket: Socket) => {
    logger.info('Yjs client connected', { socketId: socket.id });

    // Join document
    socket.on('yjs:join', async (data: { documentId: string; pageId: number }) => {
      try {
        const { documentId, pageId } = data;

        // Get or create Yjs document
        const ydoc = yjsManager.getDocument(documentId);

        // Load saved state from database if this is the first connection
        if (yjsManager.getUserCount(documentId) === 0) {
          const page = await storage.getWikiPage(pageId);
          if (page && page.blocks && Array.isArray(page.blocks)) {
            // Initialize Yjs document with saved blocks
            const yblocks = ydoc.getArray('blocks');
            yblocks.delete(0, yblocks.length); // Clear existing
            yblocks.push(page.blocks as any[]);
            logger.info('Loaded document state from database', {
              documentId,
              pageId,
              blockCount: page.blocks.length,
            });
          }
        }

        // Add user to document
        yjsManager.addUser(documentId, socket.id);

        // Join Socket.IO room
        socket.join(documentId);

        // Send current state to new client
        const stateVector = Y.encodeStateAsUpdate(ydoc);
        socket.emit('yjs:init', {
          stateVector: Buffer.from(stateVector).toString('base64'),
          userCount: yjsManager.getUserCount(documentId),
        });

        // Setup update handler for this document
        const updateHandler = (update: Uint8Array, origin: any) => {
          // Don't broadcast if update came from this socket
          if (origin === socket) return;

          // Broadcast update to all other clients in the room
          socket.to(documentId).emit('yjs:update', {
            update: Buffer.from(update).toString('base64'),
          });

          // Save to database periodically
          if (yjsManager.shouldSave(documentId)) {
            saveToDB(documentId, pageId, ydoc, storage);
          }
        };

        ydoc.on('update', updateHandler);

        // Store handler for cleanup
        socket.data.updateHandler = updateHandler;
        socket.data.documentId = documentId;
        socket.data.ydoc = ydoc;

        logger.info('Client joined Yjs document', {
          socketId: socket.id,
          documentId,
          pageId,
          userCount: yjsManager.getUserCount(documentId),
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
        const { documentId, update } = data;
        const ydoc = yjsManager.getDocument(documentId);

        // Apply update to Yjs document
        const updateBuffer = Buffer.from(update, 'base64');
        Y.applyUpdate(ydoc, updateBuffer, socket); // Pass socket as origin

        logger.debug('Applied Yjs update', {
          documentId,
          socketId: socket.id,
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
      const { documentId, awarenessUpdate } = data;
      // Broadcast awareness to other clients
      socket.to(documentId).emit('yjs:awareness', {
        socketId: socket.id,
        awarenessUpdate,
      });
    });

    // Manual save request
    socket.on('yjs:save', async (data: { documentId: string; pageId: number }) => {
      try {
        const { documentId, pageId } = data;
        const ydoc = yjsManager.getDocument(documentId);
        await saveToDB(documentId, pageId, ydoc, storage);
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
      const { documentId, ydoc, updateHandler } = socket.data;

      if (documentId && ydoc && updateHandler) {
        // Remove update listener
        ydoc.off('update', updateHandler);

        // Remove user from document
        yjsManager.removeUser(documentId, socket.id);

        logger.info('Client disconnected from Yjs', {
          socketId: socket.id,
          documentId,
          remainingUsers: yjsManager.getUserCount(documentId),
        });
      }
    });
  });

  // Periodic save task (save all active documents every minute)
  setInterval(async () => {
    const activeDocuments = yjsManager.getActiveDocuments();
    for (const documentId of activeDocuments) {
      try {
        const ydoc = yjsManager.getDocument(documentId);
        // Extract pageId from documentId (format: "page-{id}")
        const pageId = parseInt(documentId.split('-')[1]);
        if (!isNaN(pageId)) {
          await saveToDB(documentId, pageId, ydoc, storage);
        }
      } catch (error) {
        logger.error('Error in periodic save:', {
          documentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, 60000); // Every 60 seconds

  logger.info('Yjs collaboration server initialized');

  return yjsNamespace;
}

/**
 * Save Yjs document to database
 */
async function saveToDB(
  documentId: string,
  pageId: number,
  ydoc: Y.Doc,
  storage: DBStorage
): Promise<void> {
  try {
    // Get blocks from Yjs document
    const yblocks = ydoc.getArray('blocks');
    const blocks = yblocks.toArray();

    // Update database
    await storage.updateWikiPage(pageId, { blocks });

    yjsManager.markSaved(documentId);

    logger.info('Saved Yjs document to database', {
      documentId,
      pageId,
      blockCount: blocks.length,
    });
  } catch (error) {
    logger.error('Failed to save document to database:', {
      documentId,
      pageId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

export { yjsManager };
