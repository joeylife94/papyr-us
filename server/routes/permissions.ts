import type { Express } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware.js';
import { DBStorage } from '../storage.js';
import bcrypt from 'bcryptjs';

export function registerPermissionsRoutes(app: Express, storage: DBStorage): void {
  // ==================== Page Permissions API ====================

  // Get all permissions for a page
  app.get('/api/pages/:id/permissions', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);

      // Check if user has owner permission to view permissions
      const hasOwnerPermission = await storage.checkPagePermission(req.user?.id, pageId, 'owner');
      if (!hasOwnerPermission) {
        return res.status(403).json({ message: 'Only page owners can view permissions' });
      }

      const permissions = await storage.getPagePermissions(pageId);
      res.json(permissions);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get permissions', error });
    }
  });

  // Add or update a permission for a page
  app.post('/api/pages/:id/permissions', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);

      // Check if user has owner permission to manage permissions
      const hasOwnerPermission = await storage.checkPagePermission(req.user?.id, pageId, 'owner');
      if (!hasOwnerPermission) {
        return res.status(403).json({ message: 'Only page owners can manage permissions' });
      }

      const permissionData = {
        pageId,
        entityType: req.body.entityType,
        entityId: req.body.entityId,
        permission: req.body.permission,
        grantedBy: req.user?.id,
      };

      const permission = await storage.addPagePermission(permissionData);
      res.status(201).json(permission);
    } catch (error) {
      res.status(400).json({ message: 'Invalid permission data', error });
    }
  });

  // Remove a permission from a page
  app.delete(
    '/api/pages/:id/permissions/:permissionId',
    authMiddleware,
    async (req: AuthRequest, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const permissionId = parseInt(req.params.permissionId);

        // Check if user has owner permission to manage permissions
        const hasOwnerPermission = await storage.checkPagePermission(req.user?.id, pageId, 'owner');
        if (!hasOwnerPermission) {
          return res.status(403).json({ message: 'Only page owners can manage permissions' });
        }

        const deleted = await storage.removePagePermission(permissionId);
        if (!deleted) {
          return res.status(404).json({ message: 'Permission not found' });
        }

        res.json({ message: 'Permission removed successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Failed to remove permission', error });
      }
    }
  );

  // ==================== Public Links API ====================

  // Get all public links for a page
  app.get('/api/pages/:id/share', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);

      // Check if user has owner or editor permission
      const hasPermission = await storage.checkPagePermission(req.user?.id, pageId, 'editor');
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions to view share links' });
      }

      const links = await storage.getPagePublicLinks(pageId);
      res.json(links);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get share links', error });
    }
  });

  // Create a public link for a page
  app.post('/api/pages/:id/share', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);

      // Check if user has editor or owner permission
      const hasPermission = await storage.checkPagePermission(req.user?.id, pageId, 'editor');
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions to create share links' });
      }

      // Generate random token
      const token = storage.generatePublicLinkToken();

      // Hash password if provided
      let hashedPassword: string | undefined;
      if (req.body.password) {
        hashedPassword = await bcrypt.hash(req.body.password, 10);
      }

      const linkData = {
        pageId,
        token,
        password: hashedPassword,
        permission: req.body.permission || 'viewer',
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
        createdBy: req.user?.id,
      };

      const link = await storage.createPublicLink(linkData);

      // Don't send password hash to client
      const { password, ...publicLink } = link;
      res.status(201).json(publicLink);
    } catch (error) {
      res.status(400).json({ message: 'Failed to create share link', error });
    }
  });

  // Delete a public link
  app.delete('/api/pages/:id/share/:token', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);
      const token = req.params.token;

      // Check if user has editor or owner permission
      const hasPermission = await storage.checkPagePermission(req.user?.id, pageId, 'editor');
      if (!hasPermission) {
        return res.status(403).json({ message: 'Insufficient permissions to delete share links' });
      }

      const deleted = await storage.deletePublicLinkByToken(token);
      if (!deleted) {
        return res.status(404).json({ message: 'Share link not found' });
      }

      res.json({ message: 'Share link deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete share link', error });
    }
  });

  // Access a page via public link
  app.get('/api/share/:token', async (req, res) => {
    try {
      const token = req.params.token;
      const password = req.query.password as string | undefined;

      // Verify the link
      const verification = await storage.verifyPublicLink(token, password);

      if (!verification.valid) {
        return res.status(403).json({ message: verification.error });
      }

      const link = verification.link!;

      // Get the page
      const page = await storage.getWikiPage(link.pageId);
      if (!page) {
        return res.status(404).json({ message: 'Page not found' });
      }

      // Return page with permission level
      res.json({
        page,
        permission: link.permission,
        isPublicLink: true,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to access shared page', error });
    }
  });

  // Verify public link password (for password-protected links)
  app.post('/api/share/:token/verify', async (req, res) => {
    try {
      const token = req.params.token;
      const password = req.body.password;

      const verification = await storage.verifyPublicLink(token, password);

      if (!verification.valid) {
        return res.status(403).json({ valid: false, message: verification.error });
      }

      res.json({ valid: true, permission: verification.link?.permission });
    } catch (error) {
      res.status(500).json({ valid: false, message: 'Verification failed' });
    }
  });
}
