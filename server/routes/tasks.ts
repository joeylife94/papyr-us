import type { Express } from 'express';
import {
  requireAuthIfEnabled,
  requireTeamMembership,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { config } from '../config.js';
import { insertTaskSchema, updateTaskSchema, type Task } from '../../shared/schema.js';
import { DBStorage } from '../storage.js';
import { triggerWorkflows } from '../services/workflow.js';
import logger from '../services/logger.js';

export function registerTasksRoutes(app: Express, storage: DBStorage): void {
  app.get('/api/tasks', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
    try {
      const teamId = req.query.teamId as string;
      const status = req.query.status as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const cursor = req.query.cursor as string | undefined;

      // If no teamId specified, scope to user's teams to prevent full data leak
      let tasks: Task[];
      if (!teamId) {
        const userTeamIds = (req as any).userTeamIds as number[] | undefined;
        if (userTeamIds && userTeamIds.length > 0) {
          const allTasks = await Promise.all(
            userTeamIds.map((id) => storage.getTasks(String(id), status))
          );
          tasks = allTasks.flat();
        } else {
          tasks = [];
        }
      } else {
        tasks = await storage.getTasks(teamId, status);
      }

      // Apply cursor-based pagination if cursor provided
      let paginatedTasks = tasks;
      if (cursor) {
        const cursorId = parseInt(cursor);
        const cursorIndex = tasks.findIndex((t) => t.id === cursorId);
        if (cursorIndex >= 0) {
          paginatedTasks = tasks.slice(cursorIndex + 1, cursorIndex + 1 + limit);
        }
      } else {
        paginatedTasks = tasks.slice(0, limit);
      }

      const hasMore = cursor
        ? tasks.length > tasks.findIndex((t) => t.id === parseInt(cursor)) + 1 + limit
        : tasks.length > limit;
      const nextCursor =
        hasMore && paginatedTasks.length > 0
          ? paginatedTasks[paginatedTasks.length - 1]?.id.toString()
          : null;

      res.json({
        tasks: paginatedTasks,
        pagination: {
          hasMore,
          nextCursor,
          count: paginatedTasks.length,
          total: tasks.length,
        },
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.get('/api/tasks/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.getTask(id);

      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      // Verify the requester belongs to the task's team
      if (task.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(task.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (task.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: 'Invalid task ID' });
    }
  });

  app.post(
    '/api/tasks',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const taskData = insertTaskSchema.parse(req.body);
        const task = await storage.createTask(taskData);

        // Trigger workflows for task_created event
        triggerWorkflows('task_created', {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assignedTo: task.assignedTo,
          dueDate: task.dueDate,
          teamId: task.teamId,
        }).catch((error) => {
          logger.error('Failed to trigger workflows for task_created:', {
            taskId: task.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });

        res.status(201).json(task);
      } catch (error) {
        res.status(400).json({ message: 'Invalid task data', error });
      }
    }
  );

  app.put('/api/tasks/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);

      // Get old task data first so auth checks happen before Zod schema parsing
      const oldTask = await storage.getTask(id);

      // Verify team membership before allowing update
      if (req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        // Check membership on the current team (if task has one)
        if (oldTask?.teamId && !userTeamIds.includes(Number(oldTask.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
        // Prevent cross-team reassignment — validate new teamId regardless of whether
        // the original task was team-scoped (blocks moving global tasks to unauthorized teams)
        const rawNewTeamId = req.body.teamId;
        if (
          rawNewTeamId !== undefined &&
          rawNewTeamId !== null &&
          String(rawNewTeamId) !== String(oldTask?.teamId)
        ) {
          if (!userTeamIds.map(String).includes(String(rawNewTeamId))) {
            return res.status(403).json({ message: 'You are not a member of the target team' });
          }
        }
      }

      const updateData = updateTaskSchema.parse(req.body);

      const task = await storage.updateTask(id, updateData);

      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      // Trigger workflows for task_status_changed event
      if (oldTask && updateData.status && oldTask.status !== updateData.status) {
        triggerWorkflows('task_status_changed', {
          id: task.id,
          title: task.title,
          oldStatus: oldTask.status,
          newStatus: task.status,
          priority: task.priority,
          assignedTo: task.assignedTo,
          teamId: task.teamId,
        }).catch((error) => {
          logger.error('Failed to trigger workflows for task_status_changed:', {
            taskId: task.id,
            oldStatus: oldTask.status,
            newStatus: task.status,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      // Trigger workflows for task_assigned event
      if (oldTask && updateData.assignedTo && oldTask.assignedTo !== updateData.assignedTo) {
        triggerWorkflows('task_assigned', {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          oldAssignee: oldTask.assignedTo,
          newAssignee: task.assignedTo,
          teamId: task.teamId,
        }).catch((error) => {
          logger.error('Failed to trigger workflows for task_assigned:', {
            taskId: task.id,
            oldAssignee: oldTask.assignedTo,
            newAssignee: task.assignedTo,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: 'Invalid update data', error });
    }
  });

  app.delete('/api/tasks/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);

      // Verify team membership before allowing delete
      const task = await storage.getTask(id);
      if (task?.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(task.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      }

      const deleted = await storage.deleteTask(id);

      if (!deleted) {
        return res.status(404).json({ message: 'Task not found' });
      }

      res.json({ message: 'Task deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: 'Invalid task ID' });
    }
  });

  app.patch('/api/tasks/:id/progress', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { progress } = req.body;

      if (typeof progress !== 'number' || progress < 0 || progress > 100) {
        return res.status(400).json({ message: 'Progress must be a number between 0 and 100' });
      }

      // Verify team membership from the resource itself — never trust request-supplied teamId
      const existingTask = await storage.getTask(id);
      if (!existingTask) {
        return res.status(404).json({ message: 'Task not found' });
      }
      if (existingTask.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(existingTask.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (existingTask.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const task = await storage.updateTaskProgress(id, progress);

      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: 'Invalid progress data' });
    }
  });
}
