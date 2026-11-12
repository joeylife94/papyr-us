/**
 * Organization routes (issue #124 X1c). Registered in server/index.ts before the legacy route
 * bundle, so every route carries its own guard: authMiddleware, then requireOrganizationRole.
 */
import type { Express, Response } from 'express';
import { authMiddleware } from './middleware.js';
import { requireOrganizationRole, type OrganizationRequest } from './organization-guards.js';
import type { DBStorage } from './storage.js';

export function registerOrganizationRoutes(app: Express, storage: DBStorage) {
  // The caller's own organization: the one their account belongs to, never one named by the
  // request.
  app.get(
    '/api/organization',
    authMiddleware,
    requireOrganizationRole(['owner', 'admin', 'member']),
    async (req: OrganizationRequest, res: Response) => {
      try {
        const organization = await storage.getOrganization(req.organization!.id);
        if (!organization) {
          return res
            .status(403)
            .json({ message: 'Your account does not belong to an organization' });
        }
        return res.json({
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
          role: req.organization!.role,
          aiEnabled: organization.aiEnabled,
        });
      } catch {
        return res.status(500).json({ message: 'Organization check failed' });
      }
    }
  );

  // X1c P2 adds the other /api/organization routes here.
}
