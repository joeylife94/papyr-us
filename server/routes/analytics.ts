import type { Express } from 'express';
import {
  authMiddleware,
  buildRateLimiter,
  requireTeamMembership,
  requirePagePermission,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { pageFavorites, pageViews, activityFeed, wikiPages } from '../../shared/schema.js';
import { DBStorage } from '../storage.js';
import logger from '../services/logger.js';

const rlAnalytics = buildRateLimiter({ windowMs: 60_000, max: 60 });

export function registerAnalyticsRoutes(app: Express, storage: DBStorage): void {
  // ==================== Page Favorites / Bookmarks API ====================

  app.get('/api/favorites', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { eq, desc } = await import('drizzle-orm');
      const db = (storage as any).db;

      const favorites = await db
        .select({
          id: pageFavorites.id,
          pageId: pageFavorites.pageId,
          createdAt: pageFavorites.createdAt,
          pageTitle: wikiPages.title,
          pageSlug: wikiPages.slug,
          pageFolder: wikiPages.folder,
          pageUpdatedAt: wikiPages.updatedAt,
        })
        .from(pageFavorites)
        .innerJoin(wikiPages, eq(pageFavorites.pageId, wikiPages.id))
        .where(eq(pageFavorites.userId, userId))
        .orderBy(desc(pageFavorites.createdAt));

      res.json(favorites);
    } catch (error) {
      logger.error('Error fetching favorites:', { error });
      res.status(500).json({ error: 'Failed to fetch favorites' });
    }
  });

  app.post('/api/favorites/:pageId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const pageId = parseInt(req.params.pageId);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const page = await storage.getWikiPage(pageId);
      if (!page) return res.status(404).json({ error: 'Page not found' });

      const { eq, and } = await import('drizzle-orm');
      const db = (storage as any).db;

      const existing = await db
        .select()
        .from(pageFavorites)
        .where(and(eq(pageFavorites.userId, userId), eq(pageFavorites.pageId, pageId)));

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Page already in favorites' });
      }

      const [favorite] = await db.insert(pageFavorites).values({ userId, pageId }).returning();

      res.status(201).json(favorite);
    } catch (error) {
      logger.error('Error adding favorite:', { error });
      res.status(500).json({ error: 'Failed to add favorite' });
    }
  });

  app.delete('/api/favorites/:pageId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const pageId = parseInt(req.params.pageId);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const { eq, and } = await import('drizzle-orm');
      const db = (storage as any).db;

      const result = await db
        .delete(pageFavorites)
        .where(and(eq(pageFavorites.userId, userId), eq(pageFavorites.pageId, pageId)))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Favorite not found' });
      }

      res.status(204).send();
    } catch (error) {
      logger.error('Error removing favorite:', { error });
      res.status(500).json({ error: 'Failed to remove favorite' });
    }
  });

  app.get('/api/favorites/check/:pageId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const pageId = parseInt(req.params.pageId);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const { eq, and } = await import('drizzle-orm');
      const db = (storage as any).db;

      const existing = await db
        .select()
        .from(pageFavorites)
        .where(and(eq(pageFavorites.userId, userId), eq(pageFavorites.pageId, pageId)));

      res.json({ isFavorited: existing.length > 0 });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check favorite status' });
    }
  });

  // ==================== Page Analytics API ====================

  app.post('/api/pages/:id/view', rlAnalytics, optionalAuth, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const db = (storage as any).db;
      await db.insert(pageViews).values({
        pageId,
        userId: req.user?.id || null,
      });

      res.status(201).json({ recorded: true });
    } catch (error) {
      // Don't fail the request if analytics recording fails
      res.status(201).json({ recorded: false });
    }
  });

  app.get('/api/pages/:id/analytics', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

      const { eq, sql, desc } = await import('drizzle-orm');
      const db = (storage as any).db;

      const [totalResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pageViews)
        .where(eq(pageViews.pageId, pageId));

      const [uniqueResult] = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${pageViews.userId})` })
        .from(pageViews)
        .where(eq(pageViews.pageId, pageId));

      const [weekResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pageViews)
        .where(
          sql`${pageViews.pageId} = ${pageId} AND ${pageViews.viewedAt} > NOW() - INTERVAL '7 days'`
        );

      const dailyViews = await db
        .select({
          date: sql<string>`DATE(${pageViews.viewedAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(pageViews)
        .where(
          sql`${pageViews.pageId} = ${pageId} AND ${pageViews.viewedAt} > NOW() - INTERVAL '30 days'`
        )
        .groupBy(sql`DATE(${pageViews.viewedAt})`)
        .orderBy(sql`DATE(${pageViews.viewedAt})`);

      res.json({
        totalViews: Number(totalResult?.count || 0),
        uniqueViewers: Number(uniqueResult?.count || 0),
        viewsLast7Days: Number(weekResult?.count || 0),
        dailyViews,
      });
    } catch (error) {
      logger.error('Error fetching page analytics:', { error });
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get(
    '/api/analytics/popular',
    optionalAuth,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const { sql, desc, eq } = await import('drizzle-orm');
        const db = (storage as any).db;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const days = Math.min(parseInt(req.query.days as string) || 30, 365);

        const popular = await db
          .select({
            pageId: pageViews.pageId,
            pageTitle: wikiPages.title,
            pageSlug: wikiPages.slug,
            viewCount: sql<number>`COUNT(*)`,
            uniqueViewers: sql<number>`COUNT(DISTINCT ${pageViews.userId})`,
          })
          .from(pageViews)
          .innerJoin(wikiPages, eq(pageViews.pageId, wikiPages.id))
          .where(sql`${pageViews.viewedAt} > NOW() - MAKE_INTERVAL(days => ${days})`)
          .groupBy(pageViews.pageId, wikiPages.title, wikiPages.slug)
          .orderBy(sql`COUNT(*) DESC`)
          .limit(limit);

        res.json(popular);
      } catch (error) {
        logger.error('Error fetching popular pages:', { error });
        res.status(500).json({ error: 'Failed to fetch popular pages' });
      }
    }
  );

  // ==================== Activity Feed API ====================

  app.get('/api/activity', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
    try {
      const { desc, eq, sql, and } = await import('drizzle-orm');
      const db = (storage as any).db;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const action = req.query.action as string | undefined;
      const targetType = req.query.targetType as string | undefined;

      const userTeamIds: number[] = (req as any).userTeamIds ?? [];

      const conditions: any[] = [];

      if (userTeamIds.length > 0) {
        conditions.push(
          sql`(${activityFeed.teamId} IN (${sql.join(
            userTeamIds.map((id) => sql`${id}`),
            sql`, `
          )}) OR ${activityFeed.teamId} IS NULL)`
        );
      }

      if (action) {
        conditions.push(eq(activityFeed.action, action));
      }

      if (targetType) {
        conditions.push(eq(activityFeed.targetType, targetType));
      }

      let query = db
        .select()
        .from(activityFeed)
        .orderBy(desc(activityFeed.createdAt))
        .limit(limit)
        .offset(offset);

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const activities = await query;

      res.json({
        activities,
        pagination: { limit, offset, count: activities.length },
      });
    } catch (error) {
      logger.error('Error fetching activity feed:', { error });
      res.status(500).json({ error: 'Failed to fetch activity feed' });
    }
  });

  // ==================== Page Export API ====================

  app.get(
    '/api/pages/:id/export',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req: AuthRequest, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const format = (req.query.format as string) || 'markdown';
        const page = await storage.getWikiPage(pageId);

        if (!page) return res.status(404).json({ error: 'Page not found' });

        switch (format) {
          case 'markdown':
          case 'md': {
            const frontmatter = [
              '---',
              `title: "${page.title.replace(/"/g, '\\"')}"`,
              `slug: "${page.slug}"`,
              `author: "${page.author}"`,
              `folder: "${page.folder}"`,
              `tags: [${page.tags.map((t) => `"${t}"`).join(', ')}]`,
              `created: "${page.createdAt}"`,
              `updated: "${page.updatedAt}"`,
              '---',
              '',
            ].join('\n');

            const markdown = frontmatter + (page.content || '');
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${page.slug}.md"`);
            return res.send(markdown);
          }

          case 'html': {
            const { remark } = await import('remark');
            const remarkGfm = (await import('remark-gfm')).default;
            const remarkRehype = (await import('remark-rehype')).default;
            const rehypeStringify = (await import('rehype-stringify')).default;

            const processor = remark().use(remarkGfm).use(remarkRehype).use(rehypeStringify);
            const result = await processor.process(page.content || '');

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #1a1a1a; }
    h1, h2, h3 { margin-top: 1.5em; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre code { display: block; padding: 1em; overflow-x: auto; }
    blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 1em; color: #555; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    img { max-width: 100%; }
  </style>
</head>
<body>
  <h1>${page.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
  <p><em>Author: ${page.author} | Updated: ${new Date(page.updatedAt).toLocaleDateString()}</em></p>
  <hr>
  ${String(result)}
</body>
</html>`;

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${page.slug}.html"`);
            return res.send(html);
          }

          case 'json': {
            const exportData = {
              title: page.title,
              slug: page.slug,
              content: page.content,
              blocks: page.blocks,
              folder: page.folder,
              tags: page.tags,
              author: page.author,
              metadata: page.metadata,
              createdAt: page.createdAt,
              updatedAt: page.updatedAt,
            };

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${page.slug}.json"`);
            return res.json(exportData);
          }

          default:
            return res
              .status(400)
              .json({ error: 'Invalid format. Supported: markdown, html, json' });
        }
      } catch (error) {
        logger.error('Error exporting page:', { error });
        res.status(500).json({ error: 'Failed to export page' });
      }
    }
  );
}
