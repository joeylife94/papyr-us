import type { Express } from 'express';
import {
  authMiddleware,
  requireAuthIfEnabled,
  requirePagePermission,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { insertCommentSchema, updateCommentSchema } from '../../shared/schema.js';
import { DBStorage } from '../storage.js';
import { triggerWorkflows } from '../services/workflow.js';
import logger from '../services/logger.js';

export function registerCommentsRoutes(app: Express, storage: DBStorage): void {
  app.get(
    '/api/pages/:pageId/comments',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const pageId = parseInt(req.params.pageId);
        const comments = await storage.getCommentsByPageId(pageId);
        res.json(comments);
      } catch (error) {
        res.status(400).json({ message: 'Invalid page ID' });
      }
    }
  );

  app.post(
    '/api/pages/:pageId/comments',
    requireAuthIfEnabled,
    requirePagePermission('commenter'),
    async (req: AuthRequest, res) => {
      try {
        const pageId = parseInt(req.params.pageId);
        const authenticatedUser = req.user as any;

        // Server-derive identity from authenticated user; reject anonymous for protected paths
        if (!authenticatedUser?.id) {
          return res.status(401).json({ message: 'Authentication required to create comments' });
        }
        const authorName = authenticatedUser.email || authenticatedUser.name || 'User';
        const authorUserId: number = authenticatedUser.id;

        const commentData = insertCommentSchema.parse({
          content: req.body.content,
          author: authorName,
          authorUserId,
          pageId,
          ...(req.body.parentId !== undefined && { parentId: req.body.parentId }),
        });
        const comment = await storage.createComment(commentData);

        // Get page information for trigger context
        const page = await storage.getWikiPage(pageId);

        // Trigger workflows for comment_added event
        if (page) {
          triggerWorkflows('comment_added', {
            id: comment.id,
            content: comment.content,
            author: comment.author,
            pageId: page.id,
            pageTitle: page.title,
            teamId: page.teamId,
          }).catch((error) => {
            logger.error('Failed to trigger workflows for comment_added:', {
              commentId: comment.id,
              pageId: page.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          });
        }

        res.status(201).json(comment);
      } catch (error) {
        res.status(400).json({ message: 'Invalid comment data', error });
      }
    }
  );

  app.put('/api/comments/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;

      // Look up the comment to verify ownership
      const existing = await storage.getComment(id);
      if (!existing) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      // Owner-based authorization: only the comment author or an admin may edit
      const isOwner = existing.authorUserId != null && existing.authorUserId === userId;
      const isAdmin = (req.user as any)?.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res
          .status(403)
          .json({ message: 'Only the comment author or an admin can edit this comment' });
      }

      // updateCommentSchema already strips author/authorUserId to prevent identity tampering
      const updateData = updateCommentSchema.parse(req.body);
      const comment = await storage.updateComment(id, updateData);

      if (!comment) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      res.json(comment);
    } catch (error) {
      res.status(400).json({ message: 'Invalid update data', error });
    }
  });

  app.delete('/api/comments/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;

      // Look up the comment to verify ownership
      const existing = await storage.getComment(id);
      if (!existing) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      // Owner-based authorization: comment author, page editor, or admin may delete
      const isOwner = existing.authorUserId != null && existing.authorUserId === userId;
      const isAdmin = (req.user as any)?.role === 'admin';
      let isPageEditor = false;
      if (!isOwner && !isAdmin) {
        isPageEditor = await storage.checkPagePermission(userId, existing.pageId, 'editor');
      }

      if (!isOwner && !isAdmin && !isPageEditor) {
        return res.status(403).json({
          message: 'Only the comment author, page editor, or admin can delete this comment',
        });
      }

      const deleted = await storage.deleteComment(id);

      if (!deleted) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: 'Invalid comment ID' });
    }
  });
}
