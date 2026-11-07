/**
 * Page-level knowledge views (#111 §2, §5). Both need viewer access to the page itself
 * (requirePagePermission) and return only live pages the viewer can read, as ids, titles, slugs
 * and icons; the snippet of an unlinked mention is the only body text, and only from a page the
 * viewer can read.
 *
 * GET /api/pages/:id/graph?depth=1|2 — the page, its outgoing links and backlinks (depth 1), or
 *   also their links (depth 2): `{ nodes: [{ id, title, slug, icon }], edges: [{ source,
 *   target }] }`. The page is always the first node. Other depths → 400.
 * GET /api/pages/:id/unlinked-mentions — readable pages of the same scope that mention the
 *   title without linking to it: `{ mentions: [{ id, title, slug, icon, snippet }] }` (≤ 20).
 */
import type { Express } from 'express';
import { optionalAuth, requirePagePermission, type AuthRequest } from '../middleware.js';
import type { DBStorage } from '../storage.js';
import {
  buildMentionSnippet,
  isMentionableTitle,
  parseLocalGraphDepth,
  shapeLocalGraph,
} from '../services/knowledge-graph.js';
import logger from '../services/logger.js';

const MAX_UNLINKED_MENTIONS = 20;

export function registerKnowledgeRoutes(app: Express, storage: DBStorage) {
  app.get(
    '/api/pages/:id/graph',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req: AuthRequest, res) => {
      const depth = parseLocalGraphDepth(req.query.depth);
      if (depth === null) return res.status(400).json({ message: 'depth must be 1 or 2' });
      try {
        const page = await storage.getWikiPage(Number.parseInt(req.params.id, 10));
        if (!page) return res.status(404).json({ message: 'Page not found' });

        const viewer = await storage.getPageViewer(req.user?.id);
        const { neighbours, links } = await storage.getLocalPageGraph(viewer, page.id, depth);
        res.json(shapeLocalGraph(page, neighbours, links));
      } catch (error) {
        logger.error('Local page graph failed', { error: (error as Error)?.message });
        res.status(500).json({ message: 'Failed to load the page graph' });
      }
    }
  );

  app.get(
    '/api/pages/:id/unlinked-mentions',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req: AuthRequest, res) => {
      try {
        const page = await storage.getWikiPage(Number.parseInt(req.params.id, 10));
        if (!page) return res.status(404).json({ message: 'Page not found' });
        if (!isMentionableTitle(page.title)) return res.json({ mentions: [] });

        const viewer = await storage.getPageViewer(req.user?.id);
        const rows = await storage.getUnlinkedMentions(viewer, page, MAX_UNLINKED_MENTIONS);
        res.json({
          mentions: rows.map((row) => ({
            id: row.id,
            title: row.title,
            slug: row.slug,
            icon: row.icon,
            snippet: buildMentionSnippet(row.excerpt ?? '', page.title, {
              offset: row.offset,
              contentLength: row.contentLength,
            }),
          })),
        });
      } catch (error) {
        logger.error('Unlinked mentions failed', { error: (error as Error)?.message });
        res.status(500).json({ message: 'Failed to load unlinked mentions' });
      }
    }
  );
}
