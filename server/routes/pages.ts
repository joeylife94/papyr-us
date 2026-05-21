import type { Express } from 'express';
import {
  requireAuthIfEnabled,
  requirePagePermission,
  requireTeamMembership,
  optionalAuth,
  requireAdmin,
  type AuthRequest,
} from '../middleware.js';
import { config } from '../config.js';
import {
  insertWikiPageSchema,
  updateWikiPageSchema,
  searchSchema,
  wikiPages,
  tasks,
  comments,
  users,
} from '../../shared/schema.js';
import { DBStorage } from '../storage.js';
import { triggerWorkflows } from '../services/workflow.js';
import logger from '../services/logger.js';
import { and, isNull } from 'drizzle-orm';

export function registerPagesRoutes(app: Express, storage: DBStorage): void {
  app.get('/api/pages', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const teamIdParam = req.query.teamId as string;
      const cursor = req.query.cursor as string | undefined;

      // Resolve teamName string to numeric team ID
      let resolvedTeamId: number | undefined;
      if (teamIdParam) {
        if (!isNaN(parseInt(teamIdParam))) {
          resolvedTeamId = parseInt(teamIdParam);
        } else {
          const team = await storage.getTeamByName(teamIdParam);
          if (team) {
            resolvedTeamId = team.id;
          }
        }
      }

      // If teamId is specified and user is authenticated, verify team membership
      if (resolvedTeamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(resolvedTeamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (resolvedTeamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // If no teamId specified, scope to user's teams + global pages
      if (!resolvedTeamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        // Search pages across all user's teams and unassigned (global) pages
        const allResults = await Promise.all([
          ...userTeamIds.map((tid) => {
            const params = searchSchema.parse({
              query: req.query.q as string,
              folder: req.query.folder as string,
              sort: req.query.sort as string as any,
              tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
              limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
              offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
              teamId: String(tid),
            });
            return storage.searchWikiPages(params);
          }),
          // Also include pages with no team (personal/shared pages)
          storage.searchWikiPages(
            searchSchema.parse({
              query: req.query.q as string,
              folder: req.query.folder as string,
              sort: req.query.sort as string as any,
              tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
              limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
              offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
              teamId: 'null',
            })
          ),
        ]);

        // Merge and deduplicate by page id
        const seenIds = new Set<number>();
        const mergedPages = allResults
          .flatMap((r) => r.pages)
          .filter((p) => {
            if (seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
          });

        const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
        const paginatedPages = mergedPages.slice(0, limit);
        const hasMore = mergedPages.length > limit;
        const nextCursor = hasMore ? paginatedPages[paginatedPages.length - 1]?.id : null;

        return res.json({
          pages: paginatedPages,
          total: mergedPages.length,
          pagination: { hasMore, nextCursor, count: paginatedPages.length },
        });
      } else if (!resolvedTeamId && !req.user?.id) {
        // Unauthenticated: in prod reject, in dev return only global pages
        if (config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
        // Dev mode unauthenticated — only global (teamId IS NULL) pages
        const searchParams = searchSchema.parse({
          query: req.query.q as string,
          folder: req.query.folder as string,
          sort: req.query.sort as string as any,
          tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
          limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
          teamId: 'null',
        });
        const result = await storage.searchWikiPages(searchParams);
        const hasMore = result.pages.length === (searchParams.limit || 20);
        const nextCursor = hasMore ? result.pages[result.pages.length - 1]?.id : null;
        return res.json({
          ...result,
          pagination: { hasMore, nextCursor, count: result.pages.length },
        });
      }

      // resolvedTeamId is specified — already membership-checked above
      const searchParams = searchSchema.parse({
        query: req.query.q as string,
        folder: req.query.folder as string,
        sort: req.query.sort as string as any,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        teamId: String(resolvedTeamId),
      });

      const result = await storage.searchWikiPages(searchParams);

      // Add cursor-based pagination metadata
      const hasMore = result.pages.length === (searchParams.limit || 20);
      const nextCursor = hasMore ? result.pages[result.pages.length - 1]?.id : null;

      res.json({
        ...result,
        pagination: {
          hasMore,
          nextCursor,
          count: result.pages.length,
        },
      });
    } catch (error) {
      res.status(400).json({ message: 'Invalid search parameters' });
    }
  });

  app.get('/api/pages/:id', optionalAuth, requirePagePermission('viewer'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const page = await storage.getWikiPage(id);

      if (!page) {
        return res.status(404).json({ message: 'Page not found' });
      }

      res.json(page);
    } catch (error) {
      res.status(400).json({ message: 'Invalid page ID' });
    }
  });

  app.get(
    '/api/pages/slug/:slug',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        // Use page resolved by requirePagePermission middleware if available
        const page =
          (req as any)._resolvedPage || (await storage.getWikiPageBySlug(req.params.slug));

        if (!page) {
          return res.status(404).json({ message: 'Page not found' });
        }

        res.json(page);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    }
  );

  app.post(
    '/api/pages',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        // Removed temporary E2E triage logging. The instrumentation used to write
        // `test-server-received-posts.log` during debugging has been cleaned up.

        const pageData = insertWikiPageSchema.parse(req.body);

        // If teamId is provided, find the actual team ID
        if (pageData.teamId && typeof pageData.teamId === 'string') {
          const team = await storage.getTeamByName(pageData.teamId);
          if (team) {
            pageData.teamId = team.id;
          } else {
            return res.status(400).json({ message: 'Team not found' });
          }
        }

        // Pass creator user ID for automatic owner permission assignment
        const creatorUserId = req.user?.id;
        const page = creatorUserId
          ? await storage.createWikiPage(pageData, creatorUserId)
          : await storage.createWikiPage(pageData);

        // Trigger workflows for page_created event
        triggerWorkflows('page_created', {
          id: page.id,
          title: page.title,
          slug: page.slug,
          content: page.content,
          folder: page.folder,
          tags: page.tags,
          author: page.author,
          teamId: page.teamId,
        }).catch((error) => {
          logger.error('Failed to trigger workflows for page_created:', {
            pageId: page.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });

        res.status(201).json(page);
      } catch (error) {
        res.status(400).json({ message: 'Invalid page data', error });
      }
    }
  );

  app.put(
    '/api/pages/:id',
    requireAuthIfEnabled,
    requirePagePermission('editor'),
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const updateData = updateWikiPageSchema.parse(req.body);

        // Get old page data for comparison and version snapshot
        const oldPage = await storage.getWikiPage(id);

        // Save a version snapshot BEFORE updating (only if content/blocks changed)
        if (oldPage && (updateData.content !== undefined || updateData.blocks !== undefined)) {
          try {
            // Get the current max version number
            const db = (storage as any).db;
            if (db) {
              const { pageVersions } = await import('@shared/schema');
              const { desc, eq, sql } = await import('drizzle-orm');
              const [latestVersion] = await db
                .select({
                  maxVersion: sql<number>`COALESCE(MAX(${pageVersions.versionNumber}), 0)`,
                })
                .from(pageVersions)
                .where(eq(pageVersions.pageId, id));
              const nextVersion = (latestVersion?.maxVersion || 0) + 1;

              await db.insert(pageVersions).values({
                pageId: id,
                title: oldPage.title,
                content: oldPage.content,
                blocks: oldPage.blocks || [],
                author: oldPage.author,
                versionNumber: nextVersion,
                changeDescription: `Version ${nextVersion}`,
              });
            }
          } catch (versionError) {
            // Don't block page update if version creation fails
            console.error('Failed to create page version:', versionError);
          }
        }

        const page = await storage.updateWikiPage(id, updateData);

        if (!page) {
          return res.status(404).json({ message: 'Page not found' });
        }

        // Trigger workflows for page_updated event
        triggerWorkflows('page_updated', {
          id: page.id,
          title: page.title,
          slug: page.slug,
          content: page.content,
          folder: page.folder,
          tags: page.tags,
          author: page.author,
          teamId: page.teamId,
          oldTags: oldPage?.tags || [],
          newTags: page.tags,
        }).catch((error) => {
          console.error('Failed to trigger workflows for page_updated:', error);
        });

        // Check if tags were added
        if (oldPage && updateData.tags) {
          const addedTags = updateData.tags.filter((tag) => !oldPage.tags.includes(tag));
          if (addedTags.length > 0) {
            triggerWorkflows('tag_added', {
              id: page.id,
              title: page.title,
              tags: addedTags,
              teamId: page.teamId,
            }).catch((error) => {
              console.error('Failed to trigger workflows for tag_added:', error);
            });
          }
        }

        res.json(page);
      } catch (error) {
        res.status(400).json({ message: 'Invalid update data', error });
      }
    }
  );

  // Page Version History API
  app.get(
    '/api/pages/:id/versions',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { pageVersions } = await import('@shared/schema');
        const { desc, eq } = await import('drizzle-orm');

        const versions = await db
          .select({
            id: pageVersions.id,
            pageId: pageVersions.pageId,
            title: pageVersions.title,
            author: pageVersions.author,
            versionNumber: pageVersions.versionNumber,
            changeDescription: pageVersions.changeDescription,
            createdAt: pageVersions.createdAt,
          })
          .from(pageVersions)
          .where(eq(pageVersions.pageId, pageId))
          .orderBy(desc(pageVersions.versionNumber));

        res.json(versions);
      } catch (error) {
        console.error('Error fetching page versions:', error);
        res.status(500).json({ error: 'Failed to fetch page versions' });
      }
    }
  );

  app.get(
    '/api/pages/:id/versions/:versionId',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const versionId = parseInt(req.params.versionId);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { pageVersions } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(eq(pageVersions.id, versionId));

        if (!version) {
          return res.status(404).json({ error: 'Version not found' });
        }

        res.json(version);
      } catch (error) {
        console.error('Error fetching page version:', error);
        res.status(500).json({ error: 'Failed to fetch page version' });
      }
    }
  );

  // Restore a specific version
  app.post(
    '/api/pages/:id/versions/:versionId/restore',
    requireAuthIfEnabled,
    requirePagePermission('editor'),
    async (req: AuthRequest, res) => {
      try {
        const pageId = parseInt(req.params.id);
        const versionId = parseInt(req.params.versionId);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { pageVersions } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');

        const [version] = await db
          .select()
          .from(pageVersions)
          .where(eq(pageVersions.id, versionId));

        if (!version) {
          return res.status(404).json({ error: 'Version not found' });
        }

        // Restore the page to this version
        const restoredPage = await storage.updateWikiPage(pageId, {
          title: version.title,
          content: version.content,
          blocks: version.blocks as any,
        });

        if (!restoredPage) {
          return res.status(404).json({ error: 'Page not found' });
        }

        res.json(restoredPage);
      } catch (error) {
        console.error('Error restoring page version:', error);
        res.status(500).json({ error: 'Failed to restore page version' });
      }
    }
  );

  app.delete(
    '/api/pages/:id',
    requireAuthIfEnabled,
    requirePagePermission('owner'),
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);

        // Get page data before deletion
        const page = await storage.getWikiPage(id);

        const deleted = await storage.deleteWikiPage(id);

        if (!deleted) {
          return res.status(404).json({ message: 'Page not found' });
        }

        // Trigger workflows for page_deleted event
        if (page) {
          triggerWorkflows('page_deleted', {
            id: page.id,
            title: page.title,
            slug: page.slug,
            folder: page.folder,
            tags: page.tags,
            teamId: page.teamId,
          }).catch((error) => {
            console.error('Failed to trigger workflows for page_deleted:', error);
          });
        }

        res.json({ message: 'Page moved to trash' });
      } catch (error) {
        res.status(400).json({ message: 'Invalid page ID' });
      }
    }
  );

  // ==================== Trash / Recycle Bin API ====================

  // List trashed pages
  app.get('/api/trash', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId ? parseInt(req.query.teamId as string) : undefined;
      const pages = await storage.getTrashPages(teamId);
      res.json(pages);
    } catch (error) {
      logger.error('Error fetching trash:', { error });
      res.status(500).json({ error: 'Failed to fetch trash' });
    }
  });

  // Restore a page from trash
  app.post('/api/trash/:id/restore', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const restored = await storage.restoreWikiPage(id);
      if (!restored) {
        return res.status(404).json({ error: 'Page not found in trash' });
      }
      res.json(restored);
    } catch (error) {
      logger.error('Error restoring page:', { error });
      res.status(500).json({ error: 'Failed to restore page' });
    }
  });

  // Permanently delete a page
  app.delete('/api/trash/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.permanentlyDeleteWikiPage(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Page not found' });
      }
      res.json({ message: 'Page permanently deleted' });
    } catch (error) {
      logger.error('Error permanently deleting page:', { error });
      res.status(500).json({ error: 'Failed to permanently delete page' });
    }
  });

  // Empty entire trash
  app.delete('/api/trash', requireAuthIfEnabled, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId ? parseInt(req.query.teamId as string) : undefined;
      const count = await storage.emptyTrash(teamId);
      res.json({ message: `${count} page(s) permanently deleted` });
    } catch (error) {
      logger.error('Error emptying trash:', { error });
      res.status(500).json({ error: 'Failed to empty trash' });
    }
  });

  // ==================== Page Duplicate / Clone API ====================

  app.post(
    '/api/pages/:id/duplicate',
    requireAuthIfEnabled,
    requirePagePermission('viewer'),
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const db = (storage as any).db;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const original = await storage.getWikiPage(id);
        if (!original) {
          return res.status(404).json({ error: 'Page not found' });
        }

        // Generate unique slug
        const baseSlug = `${original.slug}-copy`;
        let slug = baseSlug;
        let suffix = 1;
        while (await storage.getWikiPageBySlug(slug)) {
          slug = `${baseSlug}-${suffix++}`;
        }

        const author = (req as any).user?.email || (req as any).user?.name || original.author;
        const cloned = await storage.createWikiPage(
          {
            title: `${original.title} (Copy)`,
            slug,
            content: original.content,
            blocks: original.blocks as any,
            folder: original.folder,
            tags: original.tags,
            author,
            parentId: original.parentId,
            teamId: original.teamId,
            isPublished: false,
            metadata: original.metadata as any,
          },
          (req as any).user?.id
        );

        res.status(201).json(cloned);
      } catch (error) {
        logger.error('Error duplicating page:', { error });
        res.status(500).json({ error: 'Failed to duplicate page' });
      }
    }
  );

  // ==================== Bulk Operations API ====================

  // Bulk move pages to folder
  app.post('/api/pages/bulk/move', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { pageIds, folder } = req.body;
      if (!Array.isArray(pageIds) || !folder || typeof folder !== 'string') {
        return res.status(400).json({ error: 'pageIds (array) and folder (string) required' });
      }

      const db = (storage as any).db;
      const { inArray } = await import('drizzle-orm');
      const results = await db
        .update(wikiPages)
        .set({ folder, updatedAt: new Date() })
        .where(and(inArray(wikiPages.id, pageIds.map(Number)), isNull(wikiPages.deletedAt)))
        .returning();

      res.json({ updated: results.length });
    } catch (error) {
      logger.error('Error in bulk move:', { error });
      res.status(500).json({ error: 'Failed to move pages' });
    }
  });

  // Bulk add/remove tags
  app.post('/api/pages/bulk/tags', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { pageIds, addTags, removeTags } = req.body;
      if (!Array.isArray(pageIds)) {
        return res.status(400).json({ error: 'pageIds (array) required' });
      }

      const db = (storage as any).db;
      let updated = 0;

      for (const pageId of pageIds) {
        const page = await storage.getWikiPage(Number(pageId));
        if (!page) continue;

        let tags = [...page.tags];
        if (Array.isArray(addTags)) {
          tags = Array.from(new Set([...tags, ...addTags]));
        }
        if (Array.isArray(removeTags)) {
          tags = tags.filter((t: string) => !removeTags.includes(t));
        }

        await storage.updateWikiPage(Number(pageId), { tags });
        updated++;
      }

      res.json({ updated });
    } catch (error) {
      logger.error('Error in bulk tag update:', { error });
      res.status(500).json({ error: 'Failed to update tags' });
    }
  });

  // Bulk delete (soft delete)
  app.post('/api/pages/bulk/delete', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { pageIds } = req.body;
      if (!Array.isArray(pageIds)) {
        return res.status(400).json({ error: 'pageIds (array) required' });
      }

      let deleted = 0;
      for (const pageId of pageIds) {
        const success = await storage.deleteWikiPage(Number(pageId));
        if (success) deleted++;
      }

      res.json({ deleted });
    } catch (error) {
      logger.error('Error in bulk delete:', { error });
      res.status(500).json({ error: 'Failed to delete pages' });
    }
  });

  // ==================== Markdown Import API ====================

  app.post('/api/pages/import/markdown', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const { title, content, folder, tags, teamId } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'content (string) required' });
      }

      const pageTitle =
        title ||
        content
          .split('\n')[0]
          ?.replace(/^#+\s*/, '')
          .trim() ||
        'Untitled Import';
      const slug =
        pageTitle
          .toLowerCase()
          .replace(/[^a-z0-9가-힣]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        Date.now().toString(36);

      const author = (req as any).user?.email || (req as any).user?.name || 'imported';

      const page = await storage.createWikiPage(
        {
          title: pageTitle,
          slug,
          content,
          folder: folder || 'docs',
          tags: Array.isArray(tags) ? tags : [],
          author,
          teamId: teamId ? Number(teamId) : undefined,
          isPublished: true,
        },
        (req as any).user?.id
      );

      res.status(201).json(page);
    } catch (error) {
      logger.error('Error importing markdown:', { error });
      res.status(500).json({ error: 'Failed to import markdown' });
    }
  });

  // ==================== Dashboard Stats API ====================

  app.get('/api/stats/dashboard', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const db = (storage as any).db;
      if (!db) return res.status(500).json({ error: 'Database not available' });

      const { sql: sqlFn, count } = await import('drizzle-orm');

      // Total counts
      const [pageCount] = await db
        .select({ count: sqlFn`count(*)::int` })
        .from(wikiPages)
        .where(isNull(wikiPages.deletedAt));
      const [taskCount] = await db.select({ count: sqlFn`count(*)::int` }).from(tasks);
      const [commentCount] = await db.select({ count: sqlFn`count(*)::int` }).from(comments);
      const [userCount] = await db.select({ count: sqlFn`count(*)::int` }).from(users);

      // Pages created in last 7 days
      const [recentPages] = await db
        .select({ count: sqlFn`count(*)::int` })
        .from(wikiPages)
        .where(
          sqlFn`${wikiPages.createdAt} > NOW() - INTERVAL '7 days' AND ${wikiPages.deletedAt} IS NULL`
        );

      // Tasks completed in last 7 days
      const [recentTasks] = await db
        .select({ count: sqlFn`count(*)::int` })
        .from(tasks)
        .where(sqlFn`${tasks.status} = 'done' AND ${tasks.updatedAt} > NOW() - INTERVAL '7 days'`);

      // Page growth over last 30 days (daily)
      const pageGrowth = await db.execute(
        sqlFn`SELECT DATE(created_at) as date, COUNT(*)::int as count
              FROM wiki_pages
              WHERE created_at > NOW() - INTERVAL '30 days' AND deleted_at IS NULL
              GROUP BY DATE(created_at)
              ORDER BY date`
      );

      // Top contributors (by pages authored)
      const topContributors = await db.execute(
        sqlFn`SELECT author, COUNT(*)::int as pages_created
              FROM wiki_pages
              WHERE deleted_at IS NULL
              GROUP BY author
              ORDER BY pages_created DESC
              LIMIT 10`
      );

      // Task status breakdown
      const taskBreakdown = await db.execute(
        sqlFn`SELECT status, COUNT(*)::int as count
              FROM tasks
              GROUP BY status
              ORDER BY count DESC`
      );

      res.json({
        totals: {
          pages: pageCount.count,
          tasks: taskCount.count,
          comments: commentCount.count,
          users: userCount.count,
        },
        recent: {
          pagesThisWeek: recentPages.count,
          tasksCompletedThisWeek: recentTasks.count,
        },
        pageGrowth: pageGrowth.rows || pageGrowth,
        topContributors: topContributors.rows || topContributors,
        taskBreakdown: taskBreakdown.rows || taskBreakdown,
      });
    } catch (error) {
      logger.error('Error fetching dashboard stats:', { error });
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  });

  // Folder and Tag APIs
  app.get('/api/folders', async (req, res) => {
    try {
      const folders = await storage.getFolders();
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/folders/:folder/pages', async (req, res) => {
    try {
      const folder = req.params.folder;
      const pages = await storage.getWikiPagesByFolder(folder);
      res.json(pages);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/tags', async (req, res) => {
    try {
      const tags = await storage.getAllTags();
      res.json(tags);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Sub-pages API (nested pages)
  app.get(
    '/api/pages/:id/children',
    optionalAuth,
    requirePagePermission('viewer'),
    async (req, res) => {
      try {
        const parentId = parseInt(req.params.id);
        const allPages = await storage.searchWikiPages({ query: '', limit: 1000, offset: 0 });
        const children = allPages.pages.filter((p: any) => p.parentId === parentId);
        res.json(children);
      } catch (error) {
        console.error('Error fetching sub-pages:', error);
        res.status(500).json({ error: 'Failed to fetch sub-pages' });
      }
    }
  );

  // Get page tree (for sidebar)
  app.get('/api/page-tree', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId as string | undefined;

      // If teamId is specified and user is authenticated, verify team membership
      if (teamId && req.user?.id) {
        const resolvedTeamId = !isNaN(parseInt(teamId)) ? parseInt(teamId) : undefined;
        if (resolvedTeamId) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(resolvedTeamId)) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        }
      } else if (teamId && config.enforceAuthForWrites && !req.user?.id) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // If no teamId, scope to user's teams + unassigned pages
      if (!teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        // Fetch pages for each team plus unassigned (global) pages
        const allResults = await Promise.all([
          ...userTeamIds.map((tid) =>
            storage.searchWikiPages({ query: '', teamId: String(tid), limit: 1000, offset: 0 })
          ),
          storage.searchWikiPages({ query: '', teamId: 'null', limit: 1000, offset: 0 }),
        ]);
        const seenIds = new Set<number>();
        const allPagesRaw = allResults
          .flatMap((r) => r.pages)
          .filter((p: any) => {
            if (seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
          });
        // Build tree with the merged set
        const pages = allPagesRaw.map((p: any) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          parentId: p.parentId || null,
          folder: p.folder,
          updatedAt: p.updatedAt,
        }));
        const rootPages = pages.filter((p: any) => !p.parentId);
        const childMap = new Map<number, any[]>();
        pages.forEach((p: any) => {
          if (p.parentId) {
            if (!childMap.has(p.parentId)) childMap.set(p.parentId, []);
            childMap.get(p.parentId)!.push(p);
          }
        });
        const attachChildren = (page: any, depth = 0): any => {
          const children = childMap.get(page.id) || [];
          return {
            ...page,
            children: depth < 3 ? children.map((c: any) => attachChildren(c, depth + 1)) : [],
          };
        };
        return res.json(rootPages.map((p: any) => attachChildren(p)));
      } else if (!teamId && !req.user?.id) {
        // Unauthenticated: in prod reject, in dev return only global pages
        if (config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }
      }

      // teamId is specified (already membership-checked) OR dev unauthenticated (global only)
      const allPages = await storage.searchWikiPages({
        query: '',
        teamId: teamId || 'null',
        limit: 1000,
        offset: 0,
      });

      // Build tree structure
      const pages = allPages.pages.map((p: any) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        parentId: p.parentId || null,
        folder: p.folder,
        updatedAt: p.updatedAt,
      }));

      // Separate root pages and children
      const rootPages = pages.filter((p: any) => !p.parentId);
      const childMap = new Map<number, any[]>();
      pages.forEach((p: any) => {
        if (p.parentId) {
          if (!childMap.has(p.parentId)) childMap.set(p.parentId, []);
          childMap.get(p.parentId)!.push(p);
        }
      });

      // Attach children recursively (max 3 levels)
      const attachChildren = (page: any, depth = 0): any => {
        const children = childMap.get(page.id) || [];
        return {
          ...page,
          children: depth < 3 ? children.map((c: any) => attachChildren(c, depth + 1)) : [],
        };
      };

      const tree = rootPages.map((p: any) => attachChildren(p));
      res.json(tree);
    } catch (error) {
      console.error('Error fetching page tree:', error);
      res.status(500).json({ error: 'Failed to fetch page tree' });
    }
  });
}
