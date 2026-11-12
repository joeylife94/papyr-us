/**
 * Organization routes (issue #124 X1c). Registered in server/index.ts before the legacy route
 * bundle, so every route carries its own guard: authMiddleware, then requireOrganizationRole.
 */
import type { Express, Response } from 'express';
import { z } from 'zod';
import { organizationRoles } from '../shared/schema.js';
import { authMiddleware } from './middleware.js';
import { requireOrganizationRole, type OrganizationRequest } from './organization-guards.js';
import { OrganizationBusyError, type DBStorage } from './storage.js';
import { notifyPageAccessChanged } from './services/page-access-events.js';

// Bodies are strict: a key the route does not name (organizationId, slug, id, userId, ...) is
// refused, never ignored.
const updateSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    aiEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.aiEnabled !== undefined);

const changeRoleSchema = z.object({ role: z.enum(organizationRoles) }).strict();

function parseUserId(raw: string): number | null {
  const userId = Number(raw);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

const MANAGERS = ['owner', 'admin'] as const;

/** 503 while another change holds the organization's lock, 500 for anything else. */
function failure(res: Response, error: unknown) {
  if (error instanceof OrganizationBusyError) {
    return res.status(503).json({ message: 'Organization is busy, try again' });
  }
  return res.status(500).json({ message: 'Server error' });
}

export function registerOrganizationRoutes(app: Express, storage: DBStorage) {
  const settingsBody = (
    organization: { id: number; slug: string; name: string; aiEnabled: boolean },
    role: string
  ) => ({
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    role,
    aiEnabled: organization.aiEnabled,
  });

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
        return res.json(settingsBody(organization, req.organization!.role));
      } catch {
        return res.status(500).json({ message: 'Organization check failed' });
      }
    }
  );

  app.patch(
    '/api/organization',
    authMiddleware,
    requireOrganizationRole([...MANAGERS]),
    async (req: OrganizationRequest, res: Response) => {
      const parsed = updateSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid organization settings' });
      }
      try {
        const organization = await storage.updateOrganizationSettings(
          req.organization!.id,
          parsed.data
        );
        if (!organization) {
          return res
            .status(403)
            .json({ message: 'Your account does not belong to an organization' });
        }
        return res.json(settingsBody(organization, req.organization!.role));
      } catch (error) {
        return failure(res, error);
      }
    }
  );

  app.get(
    '/api/organization/members',
    authMiddleware,
    requireOrganizationRole([...MANAGERS]),
    async (req: OrganizationRequest, res: Response) => {
      try {
        return res.json(await storage.listOrganizationMembers(req.organization!.id));
      } catch (error) {
        return failure(res, error);
      }
    }
  );

  app.get(
    '/api/organization/teams',
    authMiddleware,
    requireOrganizationRole([...MANAGERS]),
    async (req: OrganizationRequest, res: Response) => {
      try {
        return res.json(await storage.listOrganizationTeams(req.organization!.id));
      } catch (error) {
        return failure(res, error);
      }
    }
  );

  // The caller's role is read again inside the organization lock; req.organization.role was read
  // before it and is not used for the decision.
  app.patch(
    '/api/organization/members/:userId',
    authMiddleware,
    requireOrganizationRole([...MANAGERS]),
    async (req: OrganizationRequest, res: Response) => {
      const targetUserId = parseUserId(req.params.userId);
      if (targetUserId === null) return res.status(400).json({ message: 'Invalid user ID' });
      const parsed = changeRoleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: 'Invalid role' });
      try {
        const result = await storage.changeOrganizationMemberRole(
          req.organization!.id,
          Number(req.user!.id),
          targetUserId,
          parsed.data.role
        );
        if (!result.ok) return res.status(result.status).json(result.body);
        return res.json(result.value);
      } catch (error) {
        return failure(res, error);
      }
    }
  );

  app.delete(
    '/api/organization/members/:userId',
    authMiddleware,
    requireOrganizationRole([...MANAGERS]),
    async (req: OrganizationRequest, res: Response) => {
      const targetUserId = parseUserId(req.params.userId);
      if (targetUserId === null) return res.status(400).json({ message: 'Invalid user ID' });
      try {
        const result = await storage.removeOrganizationMember(
          req.organization!.id,
          Number(req.user!.id),
          targetUserId
        );
        if (!result.ok) return res.status(result.status).json(result.body);
        // Open realtime sessions of the removed account re-check what it may still read.
        await notifyPageAccessChanged(targetUserId);
        return res.json({ removed: true, ...result.value });
      } catch (error) {
        return failure(res, error);
      }
    }
  );
}
