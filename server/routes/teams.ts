import type { Express } from 'express';
import {
  requireAuthIfEnabled,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { config } from '../config.js';
import { insertTeamSchema } from '../../shared/schema.js';
import { DBStorage } from '../storage.js';
import { featureFlags } from '../features.js';

export function registerTeamsRoutes(app: Express, storage: DBStorage): void {
  if (featureFlags.FEATURE_TEAMS) {
    // Teams API
    app.get('/api/teams', optionalAuth, async (req: AuthRequest, res) => {
      try {
        // If user is authenticated, only return teams they belong to
        if (req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          const allTeams = await storage.getTeams();
          const userTeams = allTeams.filter((t) => userTeamIds.includes(t.id));
          return res.json(userTeams);
        }
        // If auth not enforced (dev mode), return all
        if (!config.enforceAuthForWrites) {
          const teams = await storage.getTeams();
          return res.json(teams);
        }
        return res.status(401).json({ error: 'Authentication required' });
      } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ error: 'Failed to fetch teams' });
      }
    });

    app.get('/api/teams/:id', optionalAuth, async (req: AuthRequest, res) => {
      try {
        const id = parseInt(req.params.id);

        // Verify membership for the specific team
        if (req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(id)) {
            return res.status(403).json({ error: 'You are not a member of this team' });
          }
        } else if (config.enforceAuthForWrites) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const team = await storage.getTeam(id);
        if (!team) {
          return res.status(404).json({ error: 'Team not found' });
        }
        res.json(team);
      } catch (error) {
        console.error('Error fetching team:', error);
        res.status(500).json({ error: 'Failed to fetch team' });
      }
    });

    app.post('/api/teams', requireAuthIfEnabled, async (req, res) => {
      try {
        const validatedData = insertTeamSchema.parse(req.body);
        const team = await storage.createTeam(validatedData);
        res.status(201).json(team);
      } catch (error) {
        console.error('Error creating team:', error);
        res.status(500).json({ error: 'Failed to create team' });
      }
    });

    app.put(
      '/api/teams/:id',
      optionalAuth,
      requireAuthIfEnabled,
      async (req: AuthRequest, res) => {
        try {
          const id = parseInt(req.params.id);

          // Always verify user's team membership and role for team updates
          const userId = req.user?.id;
          if (userId) {
            const userRole = await storage.getUserTeamRole(userId, id);
            if (!userRole) {
              return res.status(403).json({ error: 'You are not a member of this team' });
            }
            if (userRole === 'member') {
              return res
                .status(403)
                .json({ error: 'Admin or owner role required to update team' });
            }
          } else if (config.enforceAuthForWrites) {
            return res.status(401).json({ error: 'Authentication required' });
          }

          const team = await storage.updateTeam(id, req.body);
          if (!team) {
            return res.status(404).json({ error: 'Team not found' });
          }
          res.json(team);
        } catch (error) {
          console.error('Error updating team:', error);
          res.status(500).json({ error: 'Failed to update team' });
        }
      }
    );

    app.delete(
      '/api/teams/:id',
      optionalAuth,
      requireAuthIfEnabled,
      async (req: AuthRequest, res) => {
        try {
          const id = parseInt(req.params.id);

          // Always verify user's team ownership for team deletion
          const userId = req.user?.id;
          if (userId) {
            const userRole = await storage.getUserTeamRole(userId, id);
            if (!userRole) {
              return res.status(403).json({ error: 'You are not a member of this team' });
            }
            if (userRole !== 'owner') {
              return res.status(403).json({ error: 'Owner role required to delete team' });
            }
          } else if (config.enforceAuthForWrites) {
            return res.status(401).json({ error: 'Authentication required' });
          }

          const success = await storage.deleteTeam(id);
          if (!success) {
            return res.status(404).json({ error: 'Team not found' });
          }
          res.status(204).send();
        } catch (error) {
          console.error('Error deleting team:', error);
          res.status(500).json({ error: 'Failed to delete team' });
        }
      }
    );

    app.post('/api/teams/verify', async (req, res) => {
      try {
        const { teamName, password } = req.body;
        const isValid = await storage.verifyTeamPassword(teamName, password);
        res.json({ isValid });
      } catch (error) {
        console.error('Error verifying team password:', error);
        res.status(500).json({ error: 'Failed to verify team password' });
      }
    });
  }
}
