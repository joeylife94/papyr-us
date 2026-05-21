import type { Express } from 'express';
import {
  authMiddleware,
  requireAuthIfEnabled,
  requireTeamMembership,
  type AuthRequest,
} from '../middleware.js';
import { DBStorage } from '../storage.js';
import { wikiPages, users, tasks, comments } from '../../shared/schema.js';
import { isNull } from 'drizzle-orm';
import logger from '../services/logger.js';

export function registerDashboardRoutes(app: Express, storage: DBStorage): void {
  app.get(
    '/api/dashboard/overview',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const userTeamIds: number[] = (req as any).userTeamIds ?? [];
        const overview = await storage.getDashboardOverview(userTeamIds);
        res.json(overview);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    }
  );

  app.get(
    '/api/dashboard/team/:teamId',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const teamId = req.params.teamId;
        // Verify requester belongs to the team being queried
        const userTeamIds = (req as any).userTeamIds as number[] | undefined;
        if (userTeamIds && !userTeamIds.map(String).includes(teamId)) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
        const stats = await storage.getTeamProgressStats(teamId);
        res.json(stats);
      } catch (error) {
        res.status(500).json({ message: 'Server error' });
      }
    }
  );

  app.get('/api/dashboard/member/:memberId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const memberId = parseInt(req.params.memberId);
      const member = await storage.getMember(memberId);
      if (!member) {
        return res.status(404).json({ message: 'Member not found' });
      }

      const userTeamIds = req.user?.id ? await storage.getUserTeamIds(req.user.id) : [];
      if (!userTeamIds.includes(Number(member.teamId))) {
        return res.status(403).json({ message: 'You are not a member of this team' });
      }

      const stats = await storage.getMemberProgressStats(memberId);
      if (!stats) {
        return res.status(404).json({ message: 'Member stats not found' });
      }
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ==================== System Stats API ====================

  app.get('/api/stats/overview', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { sql } = await import('drizzle-orm');
      const db = (storage as any).db;

      const [pageCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(wikiPages);
      const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
      const [taskCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(tasks);
      const [commentCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(comments);

      // Pages created this week
      const [weeklyPages] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(wikiPages)
        .where(sql`${wikiPages.createdAt} > NOW() - INTERVAL '7 days'`);

      // Tasks by status
      const tasksByStatus = await db
        .select({
          status: tasks.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(tasks)
        .groupBy(tasks.status);

      res.json({
        totalPages: Number(pageCount?.count || 0),
        totalUsers: Number(userCount?.count || 0),
        totalTasks: Number(taskCount?.count || 0),
        totalComments: Number(commentCount?.count || 0),
        pagesThisWeek: Number(weeklyPages?.count || 0),
        tasksByStatus: tasksByStatus.reduce(
          (acc: Record<string, number>, row: { status: string; count: unknown }) => {
            acc[row.status] = Number(row.count);
            return acc;
          },
          {}
        ),
      });
    } catch (error) {
      logger.error('Error fetching stats:', { error });
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });
}
