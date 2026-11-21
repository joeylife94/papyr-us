/**
 * Team membership routes. Every route needs a session (authMiddleware), whatever
 * ENFORCE_AUTH_WRITES says. The rules that depend on who else is in the team (roles, removal,
 * leaving, admission) are decided in storage under the team's lock, after the caller's role has
 * been read again through the lock's handle; the routes only parse and answer.
 *
 * A team the caller is not in, a team of another organization and an unknown team all get the
 * same answer. Accounts of other organizations are never listed or admitted.
 */
import type { Express, Response } from 'express';
import { z } from 'zod';
import { teamRoles } from '../shared/schema.js';
import { authMiddleware, buildAccountRateLimiter, type AuthRequest } from './middleware.js';
import { TeamBusyError, type DBStorage } from './storage.js';
import { notifyPageAccessChanged } from './services/page-access-events.js';
import { TEAM_CANDIDATE_MAX_QUERY_LENGTH } from '../shared/team-members.js';

// The body is strict: a key the route does not name (teamId, userId, organizationId) is refused.
const changeRoleSchema = z.object({ role: z.enum(teamRoles) }).strict();

function parseTeamId(raw: string): number | null {
  const teamId = Number(raw);
  return Number.isInteger(teamId) && teamId > 0 ? teamId : null;
}

function parseUserId(raw: string): number | null {
  const userId = Number(raw);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

/** 503 while another change holds the team's lock, 500 for anything else (no internals shown). */
function failure(res: Response, error: unknown) {
  if (error instanceof TeamBusyError) {
    return res.status(503).json({ message: 'Team is busy, try again' });
  }
  return res.status(500).json({ message: 'Server error' });
}

export function registerTeamMembershipRoutes(app: Express, storage: DBStorage) {
  // The search lists people of the caller's organization to someone who may not be its owner or
  // admin, so it is rate limited per caller on top of its own limits.
  const rlCandidates = buildAccountRateLimiter({ windowMs: 60_000, max: 30 });

  /** Whether the caller's account is still active; the read routes refuse a deactivated one. */
  const callerIsActive = async (userId: number) =>
    (await storage.getUserAccount(userId))?.isActive === true;

  // The team's members, for any member of the team.
  app.get('/api/teams/:teamId/members', authMiddleware, async (req: AuthRequest, res) => {
    const teamId = parseTeamId(req.params.teamId);
    const actorUserId = Number(req.user?.id);
    if (!teamId) return res.status(400).json({ message: 'Invalid team ID' });
    try {
      const myRole = (await callerIsActive(actorUserId))
        ? await storage.getUserTeamRole(actorUserId, teamId)
        : null;
      if (!myRole) return res.status(403).json({ message: 'You are not a member of this team' });
      const members = await storage.listTeamMembers(teamId);
      // Whether members edit the team's pages: every member sees it, owners and admins change it
      const membersCanEdit = (await storage.getTeam(teamId))?.membersCanEdit === true;
      return res.json({ teamId, myRole, members, membersCanEdit });
    } catch (error) {
      return failure(res, error);
    }
  });

  // Accounts the caller may add: members of the team's organization that are not in the team yet,
  // for a search of at least two characters, ten at most, and whether there are more.
  app.get(
    '/api/teams/:teamId/member-candidates',
    authMiddleware,
    rlCandidates,
    async (req: AuthRequest, res) => {
      const teamId = parseTeamId(req.params.teamId);
      const actorUserId = Number(req.user?.id);
      if (!teamId) return res.status(400).json({ message: 'Invalid team ID' });
      const rawQuery = req.query.q;
      if (
        rawQuery !== undefined &&
        (typeof rawQuery !== 'string' || rawQuery.length > TEAM_CANDIDATE_MAX_QUERY_LENGTH)
      ) {
        return res.status(400).json({ message: 'Invalid search' });
      }
      try {
        const myRole = (await callerIsActive(actorUserId))
          ? await storage.getUserTeamRole(actorUserId, teamId)
          : null;
        if (myRole !== 'owner' && myRole !== 'admin') {
          return res.status(403).json({ message: 'Owner or admin role required' });
        }
        return res.json(await storage.listTeamMemberCandidates(teamId, rawQuery ?? ''));
      } catch (error) {
        return failure(res, error);
      }
    }
  );

  app.post('/api/teams/:teamId/memberships', authMiddleware, async (req: AuthRequest, res) => {
    const teamId = parseTeamId(req.params.teamId);
    const actorUserId = Number(req.user?.id);
    if (!teamId) return res.status(400).json({ message: 'Invalid team ID' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    try {
      const result = await storage.admitTeamMember(teamId, actorUserId, email);
      if (!result.ok) return res.status(result.status).json(result.body);
      // A new membership changes what the account can reach: its open sessions re-check now
      if (result.value.created) await notifyPageAccessChanged(result.value.membership.userId);
      return res.status(result.value.created ? 201 : 200).json(result.value.membership);
    } catch (error) {
      return failure(res, error);
    }
  });

  // Changes one member's role. The caller's role is read again inside the team lock.
  app.patch(
    '/api/teams/:teamId/memberships/:userId',
    authMiddleware,
    async (req: AuthRequest, res) => {
      const teamId = parseTeamId(req.params.teamId);
      const targetUserId = parseUserId(req.params.userId);
      const actorUserId = Number(req.user?.id);
      if (!teamId || !targetUserId) {
        return res.status(400).json({ message: 'Invalid team or user ID' });
      }
      const parsed = changeRoleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: 'Invalid role' });
      try {
        const result = await storage.changeTeamMemberRole(
          teamId,
          actorUserId,
          targetUserId,
          parsed.data.role
        );
        if (!result.ok) return res.status(result.status).json(result.body);
        const { demoted, ...membership } = result.value;
        // Open realtime sessions on the team's pages lose access now, not at the next reconnect
        if (demoted) await notifyPageAccessChanged(targetUserId);
        return res.json(membership);
      } catch (error) {
        return failure(res, error);
      }
    }
  );

  app.delete('/api/teams/:teamId/memberships/me', authMiddleware, async (req: AuthRequest, res) => {
    const teamId = parseTeamId(req.params.teamId);
    const actorUserId = Number(req.user?.id);
    if (!teamId) return res.status(400).json({ message: 'Invalid team ID' });
    try {
      const result = await storage.removeTeamMember(teamId, actorUserId, actorUserId, {
        leaving: true,
      });
      if (!result.ok) return res.status(result.status).json(result.body);
      // Open realtime sessions on the team's pages lose access now, not at the next reconnect
      await notifyPageAccessChanged(actorUserId);
      return res.status(204).send();
    } catch (error) {
      return failure(res, error);
    }
  });

  app.delete(
    '/api/teams/:teamId/memberships/:userId',
    authMiddleware,
    async (req: AuthRequest, res) => {
      const teamId = parseTeamId(req.params.teamId);
      const targetUserId = parseUserId(req.params.userId);
      const actorUserId = Number(req.user?.id);
      if (!teamId || !targetUserId) {
        return res.status(400).json({ message: 'Invalid team or user ID' });
      }
      try {
        const result = await storage.removeTeamMember(teamId, actorUserId, targetUserId);
        if (!result.ok) return res.status(result.status).json(result.body);
        // Open realtime sessions on the team's pages lose access now, not at the next reconnect
        await notifyPageAccessChanged(targetUserId);
        return res.status(204).send();
      } catch (error) {
        return failure(res, error);
      }
    }
  );
}
