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
  organization?: { id: number; role: OrganizationRole; aiAllowed: boolean };
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
        req.organization = {
          id: membership.organizationId,
          role: membership.role,
          aiAllowed: membership.aiAllowed === true,
        };
        return next();
      } catch {
        return res.status(500).json({ message: 'Organization check failed' });
      }
    })();
  };
}

export type AiAccessDecision = 'allowed' | 'no_organization' | 'ai_disabled' | 'ai_not_granted';

/**
 * The one rule for AI use by a person. The order is the contract: no organization; the
 * organization switch off (also for a member without the grant, since granting would not help);
 * a member without the grant (a missing or non-boolean value counts as not granted); allowed.
 */
export function decideAiAccess(
  membership: { organizationId: number; aiAllowed?: unknown } | null,
  organizationAiEnabled: boolean
): AiAccessDecision {
  if (!membership) return 'no_organization';
  if (organizationAiEnabled !== true) return 'ai_disabled';
  if (membership.aiAllowed !== true) return 'ai_not_granted';
  return 'allowed';
}

export interface AiRefusal {
  status: number;
  body: { code?: string; message: string };
}

/**
 * Why the user may not use AI, as the answer to send, or null when they may. Never throws: a
 * failed lookup is a 500 refusal.
 */
export async function aiRefusalFor(
  storage: any,
  userId: number | undefined
): Promise<AiRefusal | null> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 401, body: { message: 'Authentication required' } };
  }
  try {
    const membership = await storage.getOrganizationMembership(id);
    const enabled = membership
      ? (await storage.isOrganizationAiEnabled(membership.organizationId)) === true
      : false;
    switch (decideAiAccess(membership ?? null, enabled)) {
      case 'allowed':
        return null;
      case 'ai_disabled':
        return {
          status: 403,
          body: {
            code: 'ai_disabled',
            message: 'AI features are turned off for your organization',
          },
        };
      case 'ai_not_granted':
        return {
          status: 403,
          body: { code: 'ai_not_granted', message: 'AI has not been granted to your account' },
        };
      default:
        return { status: 403, body: NO_ORGANIZATION };
    }
  } catch {
    return { status: 500, body: { message: 'Organization check failed' } };
  }
}

/**
 * Lets a request through only when the caller's organization has AI on and the caller has been
 * granted AI. Decodes the session itself (cookie, then bearer; an invalid token counts as
 * none), so it applies whatever ENFORCE_AUTH_WRITES says.
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
    const refusal = await aiRefusalFor(await storageOf(req).catch(() => null), userId);
    if (refusal) return res.status(refusal.status).json(refusal.body);
    return next();
  })();
}

/**
 * Whether the user may use AI, for handlers that degrade instead of refusing. False without a
 * user, without an organization, without the grant, or when a lookup fails.
 */
export async function aiUsableBy(storage: any, userId: number | undefined): Promise<boolean> {
  return (await aiRefusalFor(storage, userId)) === null;
}
