import type { Express } from 'express';
import { Server as SocketIoServer } from 'socket.io';
import {
  authMiddleware,
  requireAuthIfEnabled,
  type AuthRequest,
} from '../middleware.js';
import {
  insertNotificationSchema,
  updateNotificationSchema,
} from '../../shared/schema.js';
import { DBStorage } from '../storage.js';
import { featureFlags } from '../features.js';

export function registerTeamNotificationsRoutes(
  app: Express,
  storage: DBStorage,
  io?: SocketIoServer
): void {
  if (featureFlags.FEATURE_NOTIFICATIONS) {
    // Notifications API
    app.get('/api/notifications', requireAuthIfEnabled, async (req: AuthRequest, res) => {
      try {
        const recipientId = req.user?.id;
        if (!recipientId) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const cursor = req.query.cursor as string | undefined;

        const notifications = await storage.getNotifications(recipientId);

        // Apply cursor-based pagination
        let paginatedNotifications = notifications;
        if (cursor) {
          const cursorId = parseInt(cursor);
          const cursorIndex = notifications.findIndex((n) => n.id === cursorId);
          if (cursorIndex >= 0) {
            paginatedNotifications = notifications.slice(cursorIndex + 1, cursorIndex + 1 + limit);
          }
        } else {
          paginatedNotifications = notifications.slice(0, limit);
        }

        const hasMore = cursor
          ? notifications.length >
            notifications.findIndex((n) => n.id === parseInt(cursor)) + 1 + limit
          : notifications.length > limit;
        const nextCursor =
          hasMore && paginatedNotifications.length > 0
            ? paginatedNotifications[paginatedNotifications.length - 1]?.id.toString()
            : null;

        res.json({
          notifications: paginatedNotifications,
          pagination: {
            hasMore,
            nextCursor,
            count: paginatedNotifications.length,
            total: notifications.length,
          },
        });
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.get(
      '/api/notifications/unread-count',
      requireAuthIfEnabled,
      async (req: AuthRequest, res) => {
        try {
          const recipientId = req.user?.id;
          if (!recipientId) {
            return res.status(401).json({ message: 'Authentication required' });
          }

          const count = await storage.getUnreadNotificationCount(recipientId);
          res.json({ count });
        } catch (error) {
          res.status(500).json({ message: 'Server error' });
        }
      }
    );

    app.get('/api/notifications/:id', authMiddleware, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const notification = await storage.getNotification(id);

        if (!notification) {
          return res.status(404).json({ message: 'Notification not found' });
        }

        // Ownership check: only the recipient may view their notification
        if (req.user?.id && notification.recipientId !== req.user.id) {
          return res.status(403).json({ message: 'Access denied' });
        }

        res.json(notification);
      } catch (error) {
        res.status(400).json({ message: 'Invalid notification ID' });
      }
    });

    app.post('/api/notifications', requireAuthIfEnabled, async (req, res) => {
      try {
        const notificationData = insertNotificationSchema.parse(req.body);
        const notification = await storage.createNotification(notificationData);
        // Realtime: emit to user room and update unread count
        try {
          const ns = io?.of('/collab');
          if (ns) {
            ns.to(`user:${notification.recipientId}`).emit('notification:new', notification);
            const count = await storage.getUnreadNotificationCount(notification.recipientId);
            ns.to(`user:${notification.recipientId}`).emit('notification:unread-count', {
              recipientId: notification.recipientId,
              count,
            });
          }
        } catch (emitErr) {
          console.warn('Socket emit failed for notification:new', emitErr);
        }

        res.status(201).json(notification);
      } catch (error) {
        res.status(400).json({ message: 'Invalid notification data', error });
      }
    });

    app.put('/api/notifications/:id', authMiddleware, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        // Ownership check: fetch before updating
        const existing = await storage.getNotification(id);
        if (!existing) {
          return res.status(404).json({ message: 'Notification not found' });
        }
        if (req.user?.id && existing.recipientId !== req.user.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
        const updateData = updateNotificationSchema.parse(req.body);
        const notification = await storage.updateNotification(id, updateData);

        if (!notification) {
          return res.status(404).json({ message: 'Notification not found' });
        }

        // Realtime: emit updated notification and possibly unread count change
        try {
          const ns = io?.of('/collab');
          if (ns) {
            ns.to(`user:${notification.recipientId}`).emit('notification:updated', notification);
            const count = await storage.getUnreadNotificationCount(notification.recipientId);
            ns.to(`user:${notification.recipientId}`).emit('notification:unread-count', {
              recipientId: notification.recipientId,
              count,
            });
          }
        } catch (emitErr) {
          console.warn('Socket emit failed for notification:updated', emitErr);
        }

        res.json(notification);
      } catch (error) {
        res.status(400).json({ message: 'Invalid update data', error });
      }
    });

    app.delete('/api/notifications/:id', authMiddleware, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        // Ownership check: fetch before deleting
        const existing = await storage.getNotification(id);
        if (!existing) {
          return res.status(404).json({ message: 'Notification not found' });
        }
        if (req.user?.id && existing.recipientId !== req.user.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
        const deleted = await storage.deleteNotification(id);

        if (!deleted) {
          return res.status(404).json({ message: 'Notification not found' });
        }

        // Realtime: emit deletion and refresh unread count
        try {
          const ns = io?.of('/collab');
          if (ns) {
            ns.emit('notification:deleted', { id });
          }
        } catch (emitErr) {
          console.warn('Socket emit failed for notification:deleted', emitErr);
        }

        res.json({ message: 'Notification deleted successfully' });
      } catch (error) {
        res.status(400).json({ message: 'Invalid notification ID' });
      }
    });

    app.patch('/api/notifications/:id/read', authMiddleware, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        // Ownership check: fetch before marking as read
        const existing = await storage.getNotification(id);
        if (!existing) {
          return res.status(404).json({ message: 'Notification not found' });
        }
        if (req.user?.id && existing.recipientId !== req.user.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
        const notification = await storage.markNotificationAsRead(id);

        if (!notification) {
          return res.status(404).json({ message: 'Notification not found' });
        }

        // Realtime: emit updated notification and new unread count
        try {
          const ns = io?.of('/collab');
          if (ns) {
            ns.to(`user:${notification.recipientId}`).emit('notification:updated', notification);
            const count = await storage.getUnreadNotificationCount(notification.recipientId);
            ns.to(`user:${notification.recipientId}`).emit('notification:unread-count', {
              recipientId: notification.recipientId,
              count,
            });
          }
        } catch (emitErr) {
          console.warn('Socket emit failed for notification:read', emitErr);
        }

        res.json(notification);
      } catch (error) {
        res.status(400).json({ message: 'Invalid notification ID' });
      }
    });

    app.patch(
      '/api/notifications/read-all',
      requireAuthIfEnabled,
      async (req: AuthRequest, res) => {
        try {
          // Use authenticated user's ID — do not trust client-supplied recipientId
          const recipientId = req.user?.id;
          if (!recipientId) {
            return res.status(401).json({ message: 'Authentication required' });
          }

          await storage.markAllNotificationsAsRead(recipientId);

          // Realtime: emit unread count reset for recipient
          try {
            const ns = io?.of('/collab');
            if (ns) {
              const count = await storage.getUnreadNotificationCount(recipientId);
              ns.to(`user:${recipientId}`).emit('notification:unread-count', {
                recipientId,
                count,
              });
            }
          } catch (emitErr) {
            console.warn('Socket emit failed for notification:read-all', emitErr);
          }

          res.json({ message: 'All notifications marked as read' });
        } catch (error) {
          res.status(400).json({ message: 'Invalid request data' });
        }
      }
    );
  }
}
