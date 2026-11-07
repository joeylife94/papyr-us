/**
 * Page embeds (issue #135, decision P3-D2): what an `![[page:<id>]]` embed shows.
 *
 * GET /api/pages/:id/embed answers with the open-by-id rule of the link preview
 * (`readableLinkTarget`): the caller sees the target only if it exists, is not in the trash and
 * they may read it. Missing, trashed and unreadable targets all get `{ id, accessible: false }`,
 * byte for byte the link preview's answer, so an embed reveals nothing (no title, size or text)
 * about a page the caller cannot open. A readable target answers with its title, icon, slug,
 * `updatedAt` and its Markdown `content`, cut to `MAX_EMBED_CONTENT_CHARS` (`truncated` says
 * when). Nothing is stored for the embedding page: every view asks again.
 */
import type { Express } from 'express';
import { optionalAuth, type AuthRequest } from '../middleware.js';
import type { DBStorage } from '../storage.js';
import type { WikiPage } from '../../shared/schema.js';
import { isPageId } from '../../shared/page-links.js';
import { truncateEmbedContent } from '../../shared/page-embeds.js';
import logger from '../services/logger.js';

type LinkTargetStorage = Pick<DBStorage, 'getWikiPage' | 'checkPagePermission'>;

/**
 * The page `id` if `userId` may open it by id (it exists, is live and they may read it), else
 * null. The one rule for link previews and embeds.
 */
export async function readableLinkTarget(
  storage: LinkTargetStorage,
  userId: number | undefined,
  id: number
): Promise<WikiPage | null> {
  const page = await storage.getWikiPage(id);
  if (!page || page.deletedAt) return null;
  return (await storage.checkPagePermission(userId, id, 'viewer')) ? page : null;
}

export function registerPageEmbedRoutes(app: Express, storage: DBStorage) {
  app.get('/api/pages/:id/embed', optionalAuth, async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id, 10);
    if (!isPageId(id)) {
      return res.status(400).json({ message: 'Invalid page ID' });
    }
    try {
      const page = await readableLinkTarget(storage, req.user?.id, id);
      if (!page) return res.json({ id, accessible: false });
      const { content, truncated } = truncateEmbedContent(page.content ?? '');
      res.json({
        id,
        accessible: true,
        title: page.title,
        slug: page.slug,
        icon: page.icon ?? null,
        updatedAt: page.updatedAt,
        content,
        truncated,
      });
    } catch (error) {
      logger.error('Page embed failed', { pageId: id, error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to load embed' });
    }
  });
}
