/**
 * The sidebar page tree (#103 E5, decisions D4/D5).
 *
 * - GET /api/pages/tree?teamId=<id|name> — the readable live pages of one workspace scope (a team,
 *   or team-less pages when omitted), flat and depth first, never content:
 *   `{ pages: [{ id, title, slug, icon, parentId, position, updatedAt }] }`. `parentId` and
 *   `position` are as this viewer sees the tree: a page whose parent they cannot see is a root
 *   page with no sign of a parent (D4), and positions run 0..n-1 per sibling list.
 * - POST /api/pages/:id/move `{ parentId: number | null, index: number }` — moves a page under a
 *   parent (or to the root) at `index` among the siblings the caller sees there.
 * - GET /api/pages/:id/ancestors — the readable breadcrumb above a page, root first.
 *
 * Tree rules, here and wherever a page gets a parent (POST /api/pages): a sub-page is in the same
 * team as its parent, or both are team-less (403 otherwise); placing a page needs editor on it and
 * on the new parent (403); loops are refused (400); a page or parent the caller cannot read
 * answers 404, exactly like a missing one.
 */
import type { Express } from 'express';
import { z } from 'zod';
import {
  optionalAuth,
  requireAuthIfEnabled,
  requirePagePermission,
  type AuthRequest,
} from '../middleware.js';
import type { DBStorage } from '../storage.js';
import { resolvePageScope } from '../services/page-scope.js';
import { MAX_TREE_INDEX } from '../services/page-tree.js';
import logger from '../services/logger.js';

type ParentCheckStorage = Pick<DBStorage, 'getWikiPage' | 'checkPagePermission'>;

export type TreeParentCheck = { ok: true } | { ok: false; status: 403 | 404; message: string };

/**
 * Whether `userId` may place a page of `teamId` (null: team-less) under `parentId`: the parent is
 * live and readable (404 otherwise, the same answer as for a missing page), in the same team scope
 * (403) and editable by the caller (403).
 */
export async function checkTreeParent(
  storage: ParentCheckStorage,
  userId: number | undefined,
  parentId: number,
  teamId: number | null
): Promise<TreeParentCheck> {
  const parent = await storage.getWikiPage(parentId);
  if (!parent || !(await storage.checkPagePermission(userId, parentId, 'viewer'))) {
    return { ok: false, status: 404, message: 'Parent page not found' };
  }
  if ((parent.teamId ?? null) !== teamId) {
    return { ok: false, status: 403, message: 'A sub-page must be in the same team as its parent' };
  }
  if (!(await storage.checkPagePermission(userId, parentId, 'editor'))) {
    return {
      ok: false,
      status: 403,
      message: 'Insufficient permissions: editor required on the parent page',
    };
  }
  return { ok: true };
}

const moveSchema = z
  .object({
    parentId: z.number().int().positive().nullable(),
    index: z.number().int().min(0).max(MAX_TREE_INDEX),
  })
  .strict();

const parsePageId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export function registerPageTreeRoutes(app: Express, storage: DBStorage) {
  app.get('/api/pages/tree', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const scope = await resolvePageScope(storage, req.user?.id, req.query.teamId);
      if (!scope.ok) return res.status(scope.status).json({ message: scope.message });
      const pages = await storage.getPageTree(scope.viewer, scope.teamId);
      res.json({ pages });
    } catch (error) {
      logger.error('Page tree failed', { error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to load the page tree' });
    }
  });

  app.post('/api/pages/:id/move', requireAuthIfEnabled, async (req: AuthRequest, res, next) => {
    // Not a page id: leave the path to fixed routes such as POST /api/pages/bulk/move.
    const id = parsePageId(req.params.id);
    if (!id) return next();
    const parsed = moveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: 'parentId (a page id or null) and index (0 or more) are required' });
    }
    const { parentId, index } = parsed.data;
    const userId = req.user?.id;
    try {
      const page = await storage.getWikiPage(id);
      if (!page || !(await storage.checkPagePermission(userId, id, 'viewer'))) {
        return res.status(404).json({ message: 'Page not found' });
      }
      if (!(await storage.checkPagePermission(userId, id, 'editor'))) {
        return userId
          ? res.status(403).json({ message: 'Insufficient permissions: editor required' })
          : res.status(401).json({ message: 'Authentication required' });
      }
      if (parentId !== null) {
        if (parentId === id) {
          return res.status(400).json({ message: 'A page cannot be moved under itself' });
        }
        const parentCheck = await checkTreeParent(storage, userId, parentId, page.teamId ?? null);
        if (!parentCheck.ok) {
          return res.status(parentCheck.status).json({ message: parentCheck.message });
        }
        const ancestors = (await storage.getPageAncestorIds(parentId)) ?? [];
        if (ancestors.includes(id)) {
          return res.status(400).json({ message: 'A page cannot be moved under its own sub-page' });
        }
      }

      const viewer = await storage.getPageViewer(userId);
      const result = await storage.movePage(viewer, id, parentId, index);
      switch (result?.status) {
        case 'moved':
          return res.json(result.page);
        case 'cycle':
          return res.status(400).json({ message: 'A page cannot be moved under its own sub-page' });
        case 'cross-team':
          return res
            .status(403)
            .json({ message: 'A sub-page must be in the same team as its parent' });
        case 'parent-not-found':
          return res.status(404).json({ message: 'Parent page not found' });
        default:
          return res.status(404).json({ message: 'Page not found' });
      }
    } catch (error) {
      logger.error('Page move failed', { pageId: id, error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to move page' });
    }
  });

  app.get(
    '/api/pages/:id/ancestors',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req: AuthRequest, res) => {
      const id = parsePageId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Invalid page ID' });
      try {
        if (!(await storage.getWikiPage(id))) {
          return res.status(404).json({ message: 'Page not found' });
        }
        const viewer = await storage.getPageViewer(req.user?.id);
        res.json({ ancestors: await storage.getReadablePageAncestors(viewer, id) });
      } catch (error) {
        logger.error('Page ancestors failed', { pageId: id, error: (error as Error)?.message });
        res.status(500).json({ message: 'Failed to load the page path' });
      }
    }
  );
}
