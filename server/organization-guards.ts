/**
 * Organization guards (issue #124 X1c).
 *
 * The caller's organization and organization role are always read from the database when the
 * request arrives: nothing here reads a role or an organization from a token or a request body.
 * Every guard fails closed: a failed lookup answers 500 and never calls next().
 */
import type { NextFunction, RequestHandler, Response } from 'express';
import type { OrganizationRole } from '../shared/schema.js';
import { optionalAuth, type AuthRequest } from './middleware.js';

export interface OrganizationRequest extends AuthRequest {
  organization?: { id: number; role: OrganizationRole };
}

const NO_ORGANIZATION = { message: 'Your account does not belong to an organization' };

async function storageOf(req: AuthRequest): Promise<any> {
  return req.app.locals.storage || (await import('./storage.js')).getStorage();
}

function sessionUserId(req: AuthRequest): number | null {
  const id = Number(req.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Runs after authMiddleware (it does not decode the token). Allows the caller only when their
 * organization role, read from organization_members, is one of `roles`; sets req.organization.
 */
export function requireOrganizationRole(roles: OrganizationRole[]): RequestHandler {
  return (req: OrganizationRequest, res: Response, next: NextFunction) => {
    const userId = sessionUserId(req);
    if (userId === null) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    (async () => {
      try {
        const storage = await storageOf(req);
        const membership = await storage.getOrganizationMembership(userId);
        if (!membership) return res.status(403).json(NO_ORGANIZATION);
        if (!roles.includes(membership.role)) {
          return res.status(403).json({ message: 'Organization owner or admin role required' });
        }
        req.organization = { id: membership.organizationId, role: membership.role };
        return next();
      } catch {
        return res.status(500).json({ message: 'Organization check failed' });
      }
    })();
  };
}

/**
 * Lets a request through only when the caller's organization has AI turned on. Decodes the
 * session itself (cookie, then bearer; an invalid token counts as none), so it applies whatever
 * ENFORCE_AUTH_WRITES says.
 */
export function requireOrganizationAi(req: AuthRequest, res: Response, next: NextFunction): void {
  // optionalAuth never sends a response; it only sets req.user when the token is valid.
  req.user = undefined;
  optionalAuth(req, res, () => undefined);
  const userId = sessionUserId(req);
  if (userId === null) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  (async () => {
    try {
      const storage = await storageOf(req);
      const membership = await storage.getOrganizationMembership(userId);
      if (!membership) return res.status(403).json(NO_ORGANIZATION);
      if (!(await storage.isOrganizationAiEnabled(membership.organizationId))) {
        return res.status(403).json({
          code: 'ai_disabled',
          message: 'AI features are turned off for your organization',
        });
      }
      return next();
    } catch {
      return res.status(500).json({ message: 'Organization check failed' });
    }
  })();
}

/**
 * Whether the user's organization has AI on, for handlers that degrade instead of refusing.
 * False without a user, without an organization, or when the lookup fails.
 */
export async function organizationAiEnabledFor(
  storage: any,
  userId: number | undefined
): Promise<boolean> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  try {
    const membership = await storage.getOrganizationMembership(id);
    if (!membership) return false;
    return (await storage.isOrganizationAiEnabled(membership.organizationId)) === true;
  } catch {
    return false;
  }
}
