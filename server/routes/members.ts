import type { Express } from 'express';
import {
  requireAuthIfEnabled,
  requireTeamMembership,
  optionalAuth,
  type AuthRequest,
} from '../middleware.js';
import { config } from '../config.js';
import { insertMemberSchema, updateMemberSchema } from '../../shared/schema.js';
import { DBStorage } from '../storage.js';

export function registerMembersRoutes(app: Express, storage: DBStorage): void {
  // Members API (unified, team-aware)
  app.get('/api/members', optionalAuth, requireTeamMembership, async (req: AuthRequest, res) => {
    try {
      let teamId: number | undefined;

      if (req.query.teamId) {
        const teamIdParam = req.query.teamId as string;

        // Check if it's a number (team ID) or string (team name)
        if (!isNaN(parseInt(teamIdParam))) {
          teamId = parseInt(teamIdParam);
        } else {
          // It's a team name, find the team ID
          const team = await storage.getTeamByName(teamIdParam);
          if (team) {
            teamId = team.id;
          } else {
            return res.status(404).json({ error: 'Team not found' });
          }
        }
      }

      // If no teamId specified, scope to user's teams to prevent full data leak
      if (!teamId) {
        const userTeamIds = (req as any).userTeamIds as number[] | undefined;
        if (userTeamIds && userTeamIds.length > 0) {
          // Fetch members for each of user's teams and combine
          const allMembers = await Promise.all(userTeamIds.map((id) => storage.getMembers(id)));
          return res.json(allMembers.flat());
        } else {
          return res.json([]); // No teams = no members
        }
      }

      const members = await storage.getMembers(teamId);
      res.json(members);
    } catch (error) {
      console.error('Error fetching members:', error);
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  app.get('/api/members/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const member = await storage.getMember(id);
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Verify the requester belongs to the same team as the member
      if (member.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(member.teamId)) {
          return res.status(403).json({ error: 'You are not a member of this team' });
        }
      } else if (member.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      res.json(member);
    } catch (error) {
      res.status(400).json({ error: 'Invalid member ID' });
    }
  });

  app.get('/api/members/email/:email', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const email = req.params.email;
      const member = await storage.getMemberByEmail(email);
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Verify the requester belongs to the same team as the member
      if (member.teamId && req.user?.id) {
        const userTeamIds = await storage.getUserTeamIds(req.user.id);
        if (!userTeamIds.includes(member.teamId)) {
          return res.status(403).json({ error: 'You are not a member of this team' });
        }
      } else if (member.teamId && config.enforceAuthForWrites) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      res.json(member);
    } catch (error) {
      res.status(400).json({ error: 'Invalid email' });
    }
  });

  app.post('/api/members', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const memberData = insertMemberSchema.parse(req.body);

      // If teamId is provided as a string (team name), find the actual team ID
      if (memberData.teamId && typeof memberData.teamId === 'string') {
        const team = await storage.getTeamByName(memberData.teamId);
        if (team) {
          memberData.teamId = team.id;
        } else {
          return res.status(400).json({ error: 'Team not found' });
        }
      }

      // Verify team membership with admin+ role (or allow bootstrapping empty teams)
      if (memberData.teamId && req.user?.id) {
        const userRole = await storage.getUserTeamRole(req.user.id, memberData.teamId as number);
        if (!userRole) {
          // Allow bootstrapping: first member can join an empty team
          const existingMembers = await storage.getMembers(memberData.teamId as number);
          if (existingMembers.length > 0) {
            return res.status(403).json({ error: 'You are not a member of this team' });
          }
        } else if (userRole === 'member') {
          return res.status(403).json({ error: 'Admin or owner role required to add members' });
        }
      }

      const member = await storage.createMember(memberData);
      res.status(201).json(member);
    } catch (error) {
      console.error('Error creating member:', error);
      res.status(400).json({ error: 'Failed to create member' });
    }
  });

  app.put('/api/members/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);

      // Verify requester belongs to the same team
      const existing = await storage.getMember(id);
      if (existing?.teamId && req.user?.id) {
        const userRole = await storage.getUserTeamRole(req.user.id, existing.teamId);
        if (!userRole) {
          return res.status(403).json({ error: 'You are not a member of this team' });
        }
        if (userRole === 'member') {
          return res.status(403).json({ error: 'Admin or owner role required to update members' });
        }
      }

      const memberData = updateMemberSchema.parse(req.body);
      // Prevent cross-team reassignment
      if (
        memberData.teamId !== undefined &&
        memberData.teamId !== null &&
        Number(memberData.teamId) !== Number(existing?.teamId)
      ) {
        if (req.user?.id) {
          const userTeamIds = await storage.getUserTeamIds(req.user.id);
          if (!userTeamIds.includes(Number(memberData.teamId))) {
            return res.status(403).json({ error: 'You are not a member of the target team' });
          }
        } else if (config.enforceAuthForWrites) {
          return res.status(401).json({ error: 'Authentication required' });
        }
      }
      const member = await storage.updateMember(id, memberData);
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }
      res.json(member);
    } catch (error) {
      console.error('Error updating member:', error);
      res.status(400).json({ error: 'Failed to update member' });
    }
  });

  app.delete('/api/members/:id', requireAuthIfEnabled, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);

      // Verify requester belongs to the same team with admin+ role
      const existing = await storage.getMember(id);
      if (existing?.teamId && req.user?.id) {
        const userRole = await storage.getUserTeamRole(req.user.id, existing.teamId);
        if (!userRole) {
          return res.status(403).json({ error: 'You are not a member of this team' });
        }
        if (userRole === 'member') {
          return res.status(403).json({ error: 'Admin or owner role required to remove members' });
        }
      }

      const success = await storage.deleteMember(id);
      if (!success) {
        return res.status(404).json({ error: 'Member not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting member:', error);
      res.status(500).json({ error: 'Failed to delete member' });
    }
  });
}
