/**
 * GET /api/pages/title-search — titles of readable pages in one workspace scope, for the page
 * link picker (#103 E6) and the quick switcher (#111). Returns ids, titles, slugs and icons only,
 * never content.
 *
 * Query: `q` (title substring), `teamId` (id or name; omitted = team-less pages), `limit`
 * (1–50, default 20), `exclude` (a page id to leave out, e.g. the page being edited).
 */
import type { Express } from 'express';
import { optionalAuth, type AuthRequest } from '../middleware.js';
import type { DBStorage } from '../storage.js';
import { resolvePageScope } from '../services/page-scope.js';
import logger from '../services/logger.js';

const MAX_QUERY_LENGTH = 200;

export function registerPageTitleSearchRoutes(app: Express, storage: DBStorage) {
  app.get('/api/pages/title-search', optionalAuth, async (req: AuthRequest, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ message: 'Query is too long' });
    }
    const limit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const exclude = Number.parseInt(String(req.query.exclude ?? ''), 10);
    try {
      const scope = await resolvePageScope(storage, req.user?.id, req.query.teamId);
      if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

      const pages = await storage.searchReadablePageTitles(scope.viewer, scope.teamId, {
        query: q,
        limit: Number.isFinite(limit) ? limit : undefined,
        excludeId: Number.isFinite(exclude) && exclude > 0 ? exclude : undefined,
      });
      res.json({ pages });
    } catch (error) {
      logger.error('Page title search failed', { error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to search pages' });
    }
  });
}
