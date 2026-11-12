/**
 * Platform admin organization routes (issue #124 X1c): /api/admin/organizations*, each behind
 * the admin rate limiter and requireAdmin. Registered in server/index.ts only when FEATURE_ADMIN
 * is on, ahead of writeAuthGate, so every route carries its own guard.
 *
 * A platform admin creates organizations and names their first owner; it gets no access to an
 * organization's content through these routes. Organization ids are never taken from a body.
 */
import type { Express, Response } from 'express';
import { z } from 'zod';
import { buildRateLimiter, requireAdmin, type AuthRequest } from './middleware.js';
import { postgresErrorOf } from './db-errors.js';
import { OrganizationBusyError, type DBStorage } from './storage.js';
import { notifyPageAccessChanged } from './services/page-access-events.js';
import logger from './services/logger.js';

const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/),
    ownerEmail: z.string().trim().min(1),
  })
  .strict();

const ownerEmailSchema = z.object({ email: z.string().trim().min(1) }).strict();

function parseOrganizationId(raw: string): number | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function failed(res: Response, message: string, error: unknown) {
  if (error instanceof OrganizationBusyError) {
    return res.status(503).json({ message: 'Organization is busy, try again' });
  }
  // Driver errors carry SQL text and parameters: log them, never send them.
  logger.error(message, { error: error instanceof Error ? error.message : String(error) });
  return res.status(500).json({ message });
}

export function registerOrganizationAdminRoutes(app: Express, storage: DBStorage) {
  const rlAdmin = buildRateLimiter({ windowMs: 60_000, max: 30 });

  app.get('/api/admin/organizations', rlAdmin, requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.listOrganizationsForAdmin();
      return res.json(
        rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          isActive: row.isActive,
          aiEnabled: row.aiEnabled,
          memberCount: row.memberCount,
          ownerCount: row.ownerCount,
          createdAt: row.createdAt,
        }))
      );
    } catch (error) {
      return failed(res, 'Failed to list organizations', error);
    }
  });

  app.post('/api/admin/organizations', rlAdmin, requireAdmin, async (req: AuthRequest, res) => {
    const parsed = createOrganizationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid organization data',
        error: { name: 'ZodError', issues: parsed.error.issues },
      });
    }
    try {
      const result = await storage.createOrganizationWithOwner(parsed.data);
      if (result.kind === 'user_not_found') {
        return res.status(404).json({ message: 'Registered user not found' });
      }
      if (result.kind === 'not_eligible') {
        return res.status(409).json({
          code: 'account_not_eligible',
          message: 'This account already has data or a role in another organization',
          reasons: result.reasons,
        });
      }
      // Open realtime sessions of the new owner re-check their page access now.
      await notifyPageAccessChanged(result.owner.userId);
      const { organization } = result;
      return res.status(201).json({
        organization: {
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
          isActive: organization.isActive,
          aiEnabled: organization.aiEnabled,
          createdAt: organization.createdAt,
        },
        owner: { userId: result.owner.userId, email: result.owner.email, role: 'owner' },
      });
    } catch (error) {
      const pg = postgresErrorOf(error);
      // A unique violation naming another constraint (the account's membership row) is not a slug clash.
      if (pg?.code === '23505' && (!pg.constraint || /slug/.test(pg.constraint))) {
        return res.status(409).json({
          code: 'slug_taken',
          message: 'Organization slug is already in use',
        });
      }
      return failed(res, 'Failed to create organization', error);
    }
  });

  app.post(
    '/api/admin/organizations/:id/owners',
    rlAdmin,
    requireAdmin,
    async (req: AuthRequest, res) => {
      const organizationId = parseOrganizationId(req.params.id);
      const parsed = ownerEmailSchema.safeParse(req.body);
      if (organizationId === null || !parsed.success) {
        return res.status(400).json({ message: 'Invalid owner data' });
      }
      try {
        const result = await storage.promoteFirstOrganizationOwner(
          organizationId,
          parsed.data.email
        );
        if (result.kind === 'organization_not_found') {
          return res.status(404).json({ message: 'Organization not found' });
        }
        if (result.kind === 'member_not_found') {
          return res.status(404).json({ message: 'Member not found' });
        }
        if (result.kind === 'has_owner') {
          return res.status(409).json({
            code: 'organization_has_owner',
            message: 'The organization already has an owner',
          });
        }
        return res.json({ userId: result.userId, email: result.email, role: 'owner' });
      } catch (error) {
        return failed(res, 'Failed to set organization owner', error);
      }
    }
  );
}
