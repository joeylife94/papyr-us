/**
 * The tag pane (#137). Both routes read one workspace scope: `teamId` (a numeric id or a team
 * name) for a team the caller is a current member of, omitted for the caller's team-less pages.
 * Like GET /api/tags they always need a session (fail closed whatever ENFORCE_AUTH_WRITES says),
 * and the scope fails closed like every #111 read path (`resolvePageScope`): an unknown team and
 * a team the caller is not in both answer 403.
 *
 * GET /api/tags/tree?teamId= — `{ tags: [{ name, count, direct }], scannedPages, truncated:
 *   { pages, tags } }`: every tag of the scope's pages (the `tags` field and inline `#tags`),
 *   nested parents included (`project` for `project/alpha`). `count` is the distinct pages of the
 *   tag and everything nested under it, `direct` the pages with exactly that tag. Highest count
 *   first, at most `TAG_PANE_LIMITS.tags`.
 * GET /api/tags/pages?tag=&teamId= — `{ tag, pages: [{ id, title, slug, icon, teamId,
 *   updatedAt, tags }], total, truncated: { pages, results } }`: the pages carrying the tag or a
 *   tag nested under it, most recently updated first. `tag` is normalized like the tree's names
 *   (no leading `#`, no empty segments); a missing or invalid tag → 400.
 *
 * Only live pages the caller can list count, read from the scope's most recently updated pages
 * (`truncated.pages` says the scope has more). Tag names are page text: clients render them as
 * text and URL-encode them in links.
 */
import type { Express, Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware.js';
import type { DBStorage } from '../storage.js';
import { resolvePageScope } from '../services/page-scope.js';
import { getTagPaneList, getTagPanePages } from '../services/tag-pane.js';
import logger from '../services/logger.js';
import { normalizeTag } from '../../shared/tags.js';

export function registerTagRoutes(app: Express, storage: DBStorage) {
  /** The scope of the request, or null once a refusal was sent. */
  async function scopeOf(req: AuthRequest, res: Response) {
    if (!req.user?.id) {
      res.status(401).json({ message: 'Authentication required' });
      return null;
    }
    const { teamId } = req.query;
    if (teamId !== undefined && typeof teamId !== 'string') {
      res.status(400).json({ message: 'teamId must be a single value' });
      return null;
    }
    const scope = await resolvePageScope(storage, req.user.id, teamId ?? '');
    if (!scope.ok) {
      res.status(scope.status).json({ message: scope.message });
      return null;
    }
    return scope;
  }

  app.get('/api/tags/tree', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const scope = await scopeOf(req, res);
      if (!scope) return;
      res.json(await getTagPaneList(storage, scope.viewer, scope.teamId));
    } catch (error) {
      logger.error('Tag pane list failed', { error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to load tags' });
    }
  });

  app.get('/api/tags/pages', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const raw = req.query.tag;
      const tag = typeof raw === 'string' ? normalizeTag(raw) : null;
      if (!req.user?.id) return res.status(401).json({ message: 'Authentication required' });
      if (!tag) return res.status(400).json({ message: 'tag must be one tag name' });
      const scope = await scopeOf(req, res);
      if (!scope) return;
      res.json(await getTagPanePages(storage, scope.viewer, scope.teamId, tag));
    } catch (error) {
      logger.error('Tag pane pages failed', { error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to load the pages of the tag' });
    }
  });
}
