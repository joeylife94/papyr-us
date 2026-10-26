/**
 * Page links (#103 E6, #111 page preview). Link tokens carry only a page id; everything a reader
 * sees of the target comes from here, filtered for that reader:
 *
 * - GET /api/pages/links/resolve?ids=1,2,3 — titles for link chips. A target is accessible when
 *   it is live and the viewer could open it (the GET /api/pages/:id rule, public grants
 *   included); for any other id (deleted, unknown, unreadable) only `{ id, accessible: false }`
 *   is returned, so the three look the same.
 * - GET /api/pages/:id/backlinks — live pages the viewer can read that link to the page.
 * - GET /api/pages/:id/preview — icon, title and a short plain-text excerpt for the hover card.
 *   Link tokens in the excerpt become the titles of targets the viewer can read, or are dropped.
 *
 * Anonymous callers are the anonymous viewer, exactly as on GET /api/pages/:id.
 */
import type { Express } from 'express';
import { optionalAuth, requirePagePermission, type AuthRequest } from '../middleware.js';
import type { DBStorage } from '../storage.js';
import {
  MAX_PAGE_LINK_RESOLVE_IDS,
  extractPageLinkIdsFromText,
  replacePageLinks,
} from '../../shared/page-links.js';
import logger from '../services/logger.js';

const EXCERPT_LENGTH = 300;
/** How much of the body the excerpt is taken from; the card never needs more. */
const EXCERPT_SOURCE_LENGTH = 4000;

/** `1,2,3` → distinct positive ids, or null when the list is empty, malformed or too long. */
function parseIdList(value: unknown): number[] | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length > MAX_PAGE_LINK_RESOLVE_IDS) return null;
  if (!parts.every((part) => /^\d{1,9}$/.test(part) && Number(part) > 0)) return null;
  return Array.from(new Set(parts.map(Number)));
}

function parsePageId(value: unknown): number | null {
  return typeof value === 'string' && /^\d{1,9}$/.test(value) && Number(value) > 0
    ? Number(value)
    : null;
}

/** Plain text for a preview card: drops common Markdown syntax, shortens with an ellipsis. */
export function plainTextExcerpt(text: string, maxLength = EXCERPT_LENGTH): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|~~|\*)(\S(?:[\s\S]*?\S)?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}

export function registerPageLinkRoutes(app: Express, storage: DBStorage) {
  app.get('/api/pages/links/resolve', optionalAuth, async (req: AuthRequest, res) => {
    const ids = parseIdList(req.query.ids);
    if (!ids) {
      return res.status(400).json({
        message: `ids must list 1 to ${MAX_PAGE_LINK_RESOLVE_IDS} page ids, separated by commas`,
      });
    }
    try {
      const viewer = await storage.getPageViewer(req.user?.id);
      const readable = new Map(
        (await storage.resolveReadablePageLinks(viewer, ids)).map((page) => [page.id, page])
      );
      res.json({
        links: ids.map((id) => {
          const page = readable.get(id);
          return page
            ? { id, accessible: true, title: page.title, slug: page.slug, icon: page.icon ?? null }
            : { id, accessible: false };
        }),
      });
    } catch (error) {
      logger.error('Page link resolution failed', { error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to resolve page links' });
    }
  });

  app.get(
    '/api/pages/:id/backlinks',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req: AuthRequest, res) => {
      const id = parsePageId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Invalid page ID' });
      try {
        // The permission check passes for ids without a page; only a live page has backlinks.
        if (!(await storage.getWikiPage(id))) {
          return res.status(404).json({ message: 'Page not found' });
        }
        const viewer = await storage.getPageViewer(req.user?.id);
        res.json({ backlinks: await storage.getReadableBacklinks(viewer, id) });
      } catch (error) {
        logger.error('Backlink listing failed', { pageId: id, error: (error as Error)?.message });
        res.status(500).json({ message: 'Failed to load backlinks' });
      }
    }
  );

  app.get(
    '/api/pages/:id/preview',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req: AuthRequest, res) => {
      const id = parsePageId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Invalid page ID' });
      try {
        const page = await storage.getWikiPage(id);
        if (!page) return res.status(404).json({ message: 'Page not found' });

        const source = (page.content ?? '').slice(0, EXCERPT_SOURCE_LENGTH);
        const linked = extractPageLinkIdsFromText(source).slice(0, MAX_PAGE_LINK_RESOLVE_IDS);
        const viewer = await storage.getPageViewer(req.user?.id);
        const titles = new Map(
          (await storage.resolveReadablePageLinks(viewer, linked)).map((target) => [
            target.id,
            target.title,
          ])
        );
        const excerpt = plainTextExcerpt(
          replacePageLinks(source, (target) => titles.get(target) ?? '')
        );
        res.json({
          id: page.id,
          title: page.title,
          slug: page.slug,
          icon: page.icon ?? null,
          excerpt,
        });
      } catch (error) {
        logger.error('Page preview failed', { pageId: id, error: (error as Error)?.message });
        res.status(500).json({ message: 'Failed to load page preview' });
      }
    }
  );
}
