import { Server as IOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// optional redis adapter will be loaded if REDIS_URL present
let createAdapter = null;
try {
  createAdapter = require('@socket.io/redis-adapter').createAdapter;
} catch (e) {
  // adapter optional
}

export function setupSocketIO(httpServer, storage) {
  const io = new IOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: true,
      credentials: true,
    },
  });

  // Auth requirement toggle for collaboration namespace
  const requireAuth = (() => {
    const v = (
      process.env.COLLAB_REQUIRE_AUTH ||
      process.env.COLLAB_ENFORCE_AUTH ||
      ''
    ).toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    return true; // default secure
  })();

  // If REDIS_URL is set and adapter exists, hook it up
  const redisUrl = process.env.REDIS_URL || process.env.REDIS;
  if (redisUrl && createAdapter) {
    try {
      const { createClient } = require('redis');
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
          io.adapter(createAdapter(pubClient, subClient));
          console.log('[collab] Redis adapter connected');
        })
        .catch((err) => console.error('Failed to connect redis for socket adapter', err));
    } catch (err) {
      console.warn('Redis adapter setup skipped:', err.message);
    }
  }

  // storage param should implement saveSnapshot/loadSnapshot(documentId)
  const snapshotsDir = path.resolve(process.cwd(), 'data', 'collab-snapshots');
  if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });

  const ns = io.of('/collab');

  // Namespace-level auth middleware: verify JWT from handshake
  ns.use((socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      const headers = socket.handshake.headers || {};
      const query = socket.handshake.query || {};

      let token = auth.token;
      const authHeader = headers['authorization'] || headers['Authorization'];
      if (!token && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
      if (!token && typeof query.token === 'string') {
        token = query.token;
      }

      if (token) {
        try {
          const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || ''
          );
          socket.data.user = decoded;
          socket.data.authenticated = true;
        } catch (err) {
          socket.data.authenticated = false;
          if (requireAuth) return next(new Error('Unauthorized'));
        }
      } else {
        socket.data.authenticated = false;
        if (requireAuth) return next(new Error('Unauthorized'));
      }
      return next();
    } catch (err) {
      return next(new Error('Auth processing error'));
    }
  });

  ns.on('connection', (socket) => {
    // Join per-user room if authenticated (user:<id|email>)
    try {
      const u = socket.data?.user;
      const userKey = (u && (u.id || u.email)) || undefined;
      if (userKey) {
        socket.join(`user:${userKey}`);
      }
    } catch (_) {}

    // Allow clients to explicitly join a member room for notifications
    socket.on('join-member', (data) => {
      try {
        const { memberId } = data || {};
        if (!memberId) return;
        socket.join(`member:${memberId}`);
      } catch (err) {
        console.error('join-member error', err);
      }
    });
    // Expect client to emit 'join' with { documentId, token }
    // Simple in-memory map to track users per document (prototype only)
    const docUsers = ns.docUsers || new Map();
    ns.docUsers = docUsers;

    // Expect client to emit 'join' with { documentId, token }
    socket.on('join', async (data) => {
      try {
        const { documentId, token } = data || {};
        if (!documentId) {
          socket.emit('error', { message: 'Missing documentId' });
          return;
        }

        // Use handshake user, or verify provided token for backward compatibility
        let decoded = socket.data.user;
        if (!decoded && token) {
          try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || '');
            socket.data.user = decoded;
          } catch (err) {
            if (requireAuth) {
              socket.emit('error', { message: 'Authentication failed' });
              return socket.disconnect(true);
            }
          }
        }

        // Basic permission: if storage has method to check, use it
        // For prototype, allow all authenticated users

        socket.join(documentId);

        // Load snapshot if exists
        // load snapshot via storage if provided
        try {
          if (storage && typeof storage.loadSnapshot === 'function') {
            const buf = storage.loadSnapshot(documentId);
            if (buf) socket.emit('init', buf);
            else socket.emit('init', null);
          } else {
            const snapPath = path.join(snapshotsDir, `${documentId}.bin`);
            if (fs.existsSync(snapPath)) {
              const buf = fs.readFileSync(snapPath);
              socket.emit('init', buf);
            } else {
              socket.emit('init', null);
            }
          }
        } catch (err) {
          console.error('snapshot load error', err);
          socket.emit('init', null);
        }

        socket.data.documentId = documentId;
        if (decoded) socket.data.user = decoded;
        console.log(
          `[collab] user ${decoded?.email || decoded?.id || 'anonymous'} joined ${documentId}`
        );
      } catch (err) {
        console.error('join handler error', err);
      }
    });

    socket.on('update', (payload) => {
      try {
        const docId = socket.data.documentId;
        if (!docId) return;
        // Broadcast to other clients in room
        socket.to(docId).emit('update', payload);
      } catch (err) {
        console.error('update handler error', err);
      }
    });

    // Support application-level join used by client hook: 'join-document'
    socket.on('join-document', (data) => {
      try {
        const { pageId, userId, userName, token } = data || {};
        if (!pageId) return;
        const room = `page:${pageId}`;
        // Prefer namespace-authenticated user; fallback to event token if provided
        let decoded = socket.data.user;
        if (!decoded && token) {
          try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || '');
            socket.data.user = decoded;
          } catch (err) {
            // ignore; enforced below
          }
        }
        if (requireAuth && !decoded) {
          socket.emit('error', { message: 'Authentication required' });
          return socket.disconnect(true);
        }

        socket.join(room);
        socket.data.documentId = room;
        const presentUser = decoded
          ? { id: decoded.id || decoded.email || userId, name: decoded.name || userName }
          : { id: userId, name: userName };
        if (!socket.data.user) socket.data.user = presentUser;

        // track user
        if (!docUsers.has(room)) docUsers.set(room, new Map());
        docUsers.get(room).set(presentUser.id, presentUser);

        // broadcast updated user list
        const users = Array.from(docUsers.get(room).values());
        ns.to(room).emit('session-users', users);
        ns.to(room).emit('user-joined', { userId: presentUser.id, userName: presentUser.name });
      } catch (err) {
        console.error('join-document error', err);
      }
    });

    // Application-level document change events (used by BlockEditor hook)
    socket.on('document-change', (payload) => {
      try {
        const room =
          socket.data.documentId || (payload && payload.pageId ? `page:${payload.pageId}` : null);
        if (!room) return;
        socket.to(room).emit('document-change', payload);
      } catch (err) {
        console.error('document-change handler error', err);
      }
    });

    socket.on('cursor-update', (payload) => {
      try {
        const room =
          socket.data.documentId || (payload && payload.pageId ? `page:${payload.pageId}` : null);
        if (!room) return;
        socket.to(room).emit('cursor-update', payload);
      } catch (err) {
        console.error('cursor-update handler error', err);
      }
    });

    socket.on('typing-start', (payload) => {
      try {
        const room =
          socket.data.documentId || (payload && payload.pageId ? `page:${payload.pageId}` : null);
        if (!room) return;
        socket.to(room).emit('typing-start', payload);
      } catch (err) {
        console.error('typing-start handler error', err);
      }
    });

    socket.on('typing-stop', (payload) => {
      try {
        const room =
          socket.data.documentId || (payload && payload.pageId ? `page:${payload.pageId}` : null);
        if (!room) return;
        socket.to(room).emit('typing-stop', payload);
      } catch (err) {
        console.error('typing-stop handler error', err);
      }
    });

    socket.on('awareness', (payload) => {
      try {
        const docId = socket.data.documentId;
        if (!docId) return;
        socket.to(docId).emit('awareness', payload);
      } catch (err) {
        console.error('awareness handler error', err);
      }
    });

    socket.on('snapshot', (payload) => {
      try {
        const docId = socket.data.documentId;
        if (!docId) return;
        try {
          if (storage && typeof storage.saveSnapshot === 'function') {
            storage.saveSnapshot(docId, payload);
          } else {
            const snapPath = path.join(snapshotsDir, `${docId}.bin`);
            if (payload && Buffer.isBuffer(payload)) {
              fs.writeFileSync(snapPath, payload);
            } else if (payload && typeof payload === 'string') {
              fs.writeFileSync(snapPath, Buffer.from(payload, 'base64'));
            }
          }
          socket.to(docId).emit('saved', { timestamp: Date.now() });
        } catch (err) {
          console.error('snapshot save error', err);
        }
      } catch (err) {
        console.error('snapshot handler error', err);
      }
    });

    socket.on('disconnect', (reason) => {
      try {
        // remove from docUsers if present
        const docId = socket.data.documentId;
        const user = socket.data.user;
        if (docId && user && docUsers.has(docId)) {
          docUsers.get(docId).delete(user.id || user.email);
          const users = Array.from(docUsers.get(docId).values());
          ns.to(docId).emit('session-users', users);
          ns.to(docId).emit('user-left', { userId: user.id || user.email });
        }
      } catch (err) {
        console.error('disconnect cleanup error', err);
      }
    });
  });

  return io;
}

export default setupSocketIO;
