/**
 * Notification Router
 * 
 * API endpoints for comment notifications
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import commentNotifications from '../services/comment-notifications.js';
import logger from '../services/logger.js';

export function createNotificationRouter(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/notifications
   * Get user's notifications
   */
  router.get('/', async (req, res) => {
    try {
      const userId = (req as any).userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { unreadOnly, limit, offset } = req.query;
      
      const result = await commentNotifications.getCommentNotifications(pool, userId, {
        unreadOnly: unreadOnly === 'true',
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to get notifications', { error });
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  });

  /**
   * GET /api/notifications/count
   * Get unread notification count
   */
  router.get('/count', async (req, res) => {
    try {
      const userId = (req as any).userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await commentNotifications.getCommentNotifications(pool, userId, {
        unreadOnly: true,
        limit: 0,
      });

      res.json({ unreadCount: result.unreadCount });
    } catch (error) {
      logger.error('Failed to get notification count', { error });
      res.status(500).json({ error: 'Failed to get notification count' });
    }
  });

  /**
   * POST /api/notifications/read
   * Mark notifications as read
   */
  router.post('/read', async (req, res) => {
    try {
      const userId = (req as any).userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { notificationIds } = req.body;
      const count = await commentNotifications.markNotificationsRead(
        pool, 
        userId, 
        notificationIds
      );

      res.json({ success: true, markedCount: count });
    } catch (error) {
      logger.error('Failed to mark notifications read', { error });
      res.status(500).json({ error: 'Failed to mark notifications read' });
    }
  });

  /**
   * POST /api/notifications/read-all
   * Mark all notifications as read
   */
  router.post('/read-all', async (req, res) => {
    try {
      const userId = (req as any).userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const count = await commentNotifications.markNotificationsRead(pool, userId);

      res.json({ success: true, markedCount: count });
    } catch (error) {
      logger.error('Failed to mark all notifications read', { error });
      res.status(500).json({ error: 'Failed to mark all notifications read' });
    }
  });

  /**
   * GET /api/notifications/preferences
   * Get notification preferences
   */
  router.get('/preferences', async (req, res) => {
    try {
      const userId = (req as any).userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const prefs = await commentNotifications.getNotificationPreferences(pool, userId);
      res.json(prefs);
    } catch (error) {
      logger.error('Failed to get notification preferences', { error });
      res.status(500).json({ error: 'Failed to get notification preferences' });
    }
  });

  return router;
}

export default createNotificationRouter;
