/**
 * Page sharing (WP4): who has access to a page, and the people and teams an owner can add.
 *
 * - `GET /api/pages/:id/sharing` answers a signed-in member of the page's organization who can
 *   read the page. Everyone else (signed out, an account of another organization reading a
 *   publicly shared page, a member without access, an unknown page) gets the same 404, so
 *   nothing of the list is learned from the answer. Owners get row ids, emails and the share
 *   links; other readers get names and levels of people and teams of the page's organization,
 *   never an id or an email.
 * - `GET /api/pages/:id/share-candidates` is the owner's search for someone to add: active members
 *   and teams of the page's organization, two characters, ten of each, limited per account.
 *
 * The grant routes themselves (`/permissions`) stay in routes.ts; the helpers here validate a
 * grant and tell open realtime sessions that someone's access changed.
 */
import type { Express } from 'express';
import { authMiddleware, buildAccountRateLimiter, type AuthRequest } from './middleware.js';
import type { DBStorage } from './storage.js';
import { notifyPageAccessChanged } from './services/page-access-events.js';
import logger from './services/logger.js';
import {
  PUBLIC_GRANT_LEVELS,
  SHARE_CANDIDATE_MAX_QUERY_LENGTH,
  isPermissionLevel,
  type PageShareLink,
  type PageSharingResponse,
} from '../shared/page-sharing.js';
import type { EntityType, PermissionLevel, PublicLink } from '../shared/schema.js';

export interface ParsedGrant {
  entityType: EntityType;
  entityId: number | null;
  permission: PermissionLevel;
}

/**
 * A grant a page owner may write: a user or team (a positive id) at any of the four levels, or
 * the public at `viewer` or `commenter`. Anything else is invalid, so a public grant above
 * `commenter` is refused and a public grant names nobody.
 */
export function parsePermissionGrant(body: unknown): ParsedGrant | null {
  if (typeof body !== 'object' || body === null) return null;
  const { entityType, entityId, permission } = body as Record<string, unknown>;
  if (!isPermissionLevel(permission)) return null;
  if (entityType === 'public') {
    if (!(PUBLIC_GRANT_LEVELS as readonly string[]).includes(permission)) return null;
    return { entityType, entityId: null, permission };
  }
  if (entityType !== 'user' && entityType !== 'team') return null;
  const id = typeof entityId === 'number' || typeof entityId === 'string' ? Number(entityId) : NaN;
  if (!Number.isInteger(id) || id <= 0) return null;
  return { entityType, entityId: id, permission };
}

/**
 * Tells the open realtime sessions of every account a grant reaches (the person, or every member
 * of the team) to check their access to pages again, so a downgrade or removal applies at once
 * and a new editor can edit. A failure is logged and never fails the request that changed the
 * grant. A public grant names no account, so it notifies nobody.
 */
export async function notifyGrantChanged(
  storage: Pick<DBStorage, 'listTeamMembers'>,
  grant: { entityType: string; entityId: number | null }
): Promise<void> {
  try {
    if (grant.entityId === null) return;
    let userIds: number[] = [];
    if (grant.entityType === 'user') {
      userIds = [grant.entityId];
    } else if (grant.entityType === 'team') {
      userIds = (await storage.listTeamMembers(grant.entityId)).map((member) => member.userId);
    }
    for (const userId of new Set(userIds)) await notifyPageAccessChanged(userId);
  } catch (error) {
    logger.warn('Realtime access re-check after a grant change failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** A share link as the dialog gets it: the password hash is never sent, only whether there is one. */
export function toShareLink(link: PublicLink): PageShareLink {
  return {
    id: link.id,
    token: link.token,
    permission: link.permission,
    hasPassword: Boolean(link.password),
    expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString() : null,
    createdAt: new Date(link.createdAt).toISOString(),
    accessCount: link.accessCount,
  };
}

export function registerPageSharingRoutes(app: Express, storage: DBStorage) {
  const rlCandidates = buildAccountRateLimiter({ windowMs: 60_000, max: 30 });

  /**
   * The caller's level on the page, when the caller is an active member of the page's
   * organization who can read it. Null for everything else, which the routes answer alike.
   */
  const memberLevel = async (callerId: number, pageId: number) => {
    if ((await storage.getUserAccount(callerId))?.isActive !== true) return null;
    const page = await storage.getWikiPage(pageId);
    if (!page) return null;
    const organizationId = await storage.getUserOrganizationId(callerId);
    if (organizationId === null || organizationId !== Number(page.organizationId)) return null;
    return storage.getPageLevel(callerId, pageId);
  };

  const parsePageId = (raw: string): number | null => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  app.get('/api/pages/:id/sharing', authMiddleware, async (req: AuthRequest, res) => {
    const pageId = parsePageId(req.params.id);
    if (!pageId) return res.status(404).json({ message: 'Page not found' });
    try {
      const callerId = Number(req.user?.id);
      const level = await memberLevel(callerId, pageId);
      if (!level) return res.status(404).json({ message: 'Page not found' });
      const canManage = level === 'owner';
      const view = await storage.getPageSharing(pageId, callerId, canManage);
      if (!view) return res.status(404).json({ message: 'Page not found' });
      const body: PageSharingResponse = { ...view, canManage, myPermission: level };
      if (canManage) {
        body.links = (await storage.getPagePublicLinks(pageId)).map(toShareLink);
      }
      return res.json(body);
    } catch {
      return res.status(500).json({ message: 'Server error' });
    }
  });

  app.get(
    '/api/pages/:id/share-candidates',
    authMiddleware,
    rlCandidates,
    async (req: AuthRequest, res) => {
      const pageId = parsePageId(req.params.id);
      if (!pageId) return res.status(404).json({ message: 'Page not found' });
      const rawQuery = req.query.q;
      if (
        rawQuery !== undefined &&
        (typeof rawQuery !== 'string' || rawQuery.length > SHARE_CANDIDATE_MAX_QUERY_LENGTH)
      ) {
        return res.status(400).json({ message: 'Invalid search' });
      }
      try {
        const callerId = Number(req.user?.id);
        const level = await memberLevel(callerId, pageId);
        if (!level) return res.status(404).json({ message: 'Page not found' });
        if (level !== 'owner') {
          return res.status(403).json({ message: 'Only page owners can share the page' });
        }
        return res.json(await storage.listPageShareCandidates(pageId, callerId, rawQuery ?? ''));
      } catch {
        return res.status(500).json({ message: 'Server error' });
      }
    }
  );
}
