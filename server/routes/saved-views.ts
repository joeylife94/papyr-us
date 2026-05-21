import type { Express } from 'express';
import {
  requireAuthIfEnabled,
  requireTeamMembership,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { config } from '../config.js';
import { insertSavedViewSchema, updateSavedViewSchema } from '../../shared/schema.js';
import { DBStorage } from '../storage.js';

export function registerSavedViewsRoutes(app: Express, storage: DBStorage): void {
  app.get(
    '/api/saved-views',
    optionalAuth,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        let teamId: number | undefined;
        if (req.query.teamId) {
          const teamIdParam = req.query.teamId as string;
          if (!isNaN(parseInt(teamIdParam))) {
            teamId = parseInt(teamIdParam);
          } else {
            const team = await storage.getTeamByName(teamIdParam);
            if (team) {
              teamId = team.id;
            }
          }
        }
        const createdBy = req.query.createdBy
          ? parseInt(req.query.createdBy as string)
          : undefined;
        const entityType = req.query.entityType as string | undefined;
        const isPublic =
          req.query.isPublic === 'true'
            ? true
            : req.query.isPublic === 'false'
              ? false
              : undefined;

        if (!teamId) {
          const userTeamIds = (req as any).userTeamIds as number[] | undefined;
          if (userTeamIds && userTeamIds.length > 0) {
            const allViews = await Promise.all(
              userTeamIds.map((tid) =>
                storage.getSavedViews({ teamId: tid, createdBy, entityType, isPublic })
              )
            );
            return res.json(allViews.flat());
          }
          return res.json([]);
        }

        const views = await storage.getSavedViews({
          teamId,
          createdBy,
          entityType,
          isPublic,
        });

        res.json(views);
      } catch (error) {
        console.error('Error fetching saved views:', error);
        res.status(500).json({ error: 'Failed to fetch saved views' });
      }
    }
  );

  app.get('/api/saved-views/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid view ID' });
      }

      const view = await storage.getSavedView(id);
      if (!view) {
        return res.status(404).json({ error: 'View not found' });
      }

      if (view.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(view.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (view.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      res.json(view);
    } catch (error) {
      console.error('Error fetching saved view:', error);
      res.status(500).json({ error: 'Failed to fetch saved view' });
    }
  });

  app.post(
    '/api/saved-views',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req, res) => {
      try {
        const validatedData = insertSavedViewSchema.parse(req.body);
        const view = await storage.createSavedView(validatedData);
        res.status(201).json(view);
      } catch (error) {
        console.error('Error creating saved view:', error);
        res.status(400).json({ error: 'Failed to create saved view' });
      }
    }
  );

  app.put(
    '/api/saved-views/:id',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid view ID' });
        }

        const existingView = await storage.getSavedView(id);
        if (!existingView) {
          return res.status(404).json({ error: 'View not found' });
        }
        if (existingView.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingView.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingView.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        const validatedData = updateSavedViewSchema.parse(req.body);
        if (
          validatedData.teamId !== undefined &&
          validatedData.teamId !== null &&
          Number(validatedData.teamId) !== Number(existingView.teamId)
        ) {
          if (req.user?.id) {
            const userTeamIds = await storage.getUserTeamIds(req.user.id);
            if (!userTeamIds.includes(Number(validatedData.teamId))) {
              return res.status(403).json({ message: 'You are not a member of the target team' });
            }
          } else if (config.enforceAuthForWrites) {
            return res.status(401).json({ message: 'Authentication required' });
          }
        }
        const view = await storage.updateSavedView(id, validatedData);
        if (!view) {
          return res.status(404).json({ error: 'View not found' });
        }

        res.json(view);
      } catch (error) {
        console.error('Error updating saved view:', error);
        res.status(400).json({ error: 'Failed to update saved view' });
      }
    }
  );

  app.delete('/api/saved-views/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid view ID' });
      }

      const existingView = await storage.getSavedView(id);
      if (!existingView) {
        return res.status(404).json({ error: 'View not found' });
      }
      if (existingView.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(Number(existingView.teamId))) {
          return res.status(403).json({ message: 'You are not a member of this team' });
        }
      } else if (existingView.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const success = await storage.deleteSavedView(id);
      if (!success) {
        return res.status(404).json({ error: 'View not found' });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting saved view:', error);
      res.status(500).json({ error: 'Failed to delete saved view' });
    }
  });

  app.post(
    '/api/saved-views/:id/set-default',
    requireAuthIfEnabled,
    requireTeamMembership,
    async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid view ID' });
        }

        const existingView = await storage.getSavedView(id);
        if (!existingView) {
          return res.status(404).json({ error: 'View not found' });
        }
        if (existingView.teamId && req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(existingView.teamId))) {
            return res.status(403).json({ message: 'You are not a member of this team' });
          }
        } else if (existingView.teamId && config.enforceAuthForWrites) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        if (!existingView.teamId || !existingView.entityType) {
          return res.status(400).json({ error: 'View is missing teamId or entityType' });
        }
        await storage.setDefaultView(id, existingView.teamId, existingView.entityType);
        res.json({ success: true });
      } catch (error) {
        console.error('Error setting default view:', error);
        res.status(500).json({ error: 'Failed to set default view' });
      }
    }
  );
}
