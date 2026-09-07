import type { Express } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { teamMembers, users } from '../shared/schema.js';
import { authMiddleware, type AuthRequest } from './middleware.js';
import type { DBStorage } from './storage.js';

function parseTeamId(raw: string): number | null {
  const teamId = Number(raw);
  return Number.isInteger(teamId) && teamId > 0 ? teamId : null;
}

function parseUserId(raw: string): number | null {
  const userId = Number(raw);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

async function requireMembershipManager(storage: DBStorage, userId: number, teamId: number) {
  const role = await storage.getUserTeamRole(userId, teamId);
  return role === 'owner' || role === 'admin' ? role : null;
}

async function ownerCount(storage: DBStorage, teamId: number): Promise<number> {
  const owners = await storage.db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'owner')));
  return owners.length;
}

async function admitRegisteredMember(storage: DBStorage, teamId: number, userId: number) {
  return storage.db.transaction(async (tx: any) => {
    // Serialize admission attempts for the same team/user pair. Migration 0009
    // carries the DB uniqueness invariant; this lock also keeps fresh db:push
    // environments duplicate-safe when that historical migration is not replayed.
    await tx.execute(sql`select pg_advisory_xact_lock(${teamId}, ${userId})`);

    const [existing] = await tx
      .select({ teamId: teamMembers.teamId, userId: teamMembers.userId, role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

    if (existing) return { membership: existing, created: false };

    const [created] = await tx
      .insert(teamMembers)
      .values({ teamId, userId, role: 'member' })
      .returning({ teamId: teamMembers.teamId, userId: teamMembers.userId, role: teamMembers.role });

    return { membership: created, created: true };
  });
}

export function registerTeamMembershipRoutes(app: Express, storage: DBStorage) {
  app.post(
    '/api/teams/:teamId/memberships',
    authMiddleware,
    async (req: AuthRequest, res) => {
      const teamId = parseTeamId(req.params.teamId);
      const actorUserId = Number(req.user?.id);
      if (!teamId) return res.status(400).json({ message: 'Invalid team ID' });

      const actorRole = await requireMembershipManager(storage, actorUserId, teamId);
      if (!actorRole) {
        return res.status(403).json({ message: 'Owner or admin role required' });
      }

      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      if (!email) return res.status(400).json({ message: 'Existing user email is required' });

      const [target] = await storage.db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email));
      if (!target) return res.status(404).json({ message: 'Registered user not found' });

      const result = await admitRegisteredMember(storage, teamId, target.id);
      return res.status(result.created ? 201 : 200).json(result.membership);
    }
  );

  app.delete(
    '/api/teams/:teamId/memberships/me',
    authMiddleware,
    async (req: AuthRequest, res) => {
      const teamId = parseTeamId(req.params.teamId);
      const actorUserId = Number(req.user?.id);
      if (!teamId) return res.status(400).json({ message: 'Invalid team ID' });

      const actorRole = await storage.getUserTeamRole(actorUserId, teamId);
      if (!actorRole) return res.status(404).json({ message: 'Membership not found' });
      if (actorRole === 'owner' && (await ownerCount(storage, teamId)) <= 1) {
        return res.status(409).json({ message: 'Cannot remove the sole team owner' });
      }

      await storage.db
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actorUserId)));
      return res.status(204).send();
    }
  );

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

      const actorRole = await requireMembershipManager(storage, actorUserId, teamId);
      if (!actorRole) {
        return res.status(403).json({ message: 'Owner or admin role required' });
      }

      const targetRole = await storage.getUserTeamRole(targetUserId, teamId);
      if (!targetRole) return res.status(404).json({ message: 'Membership not found' });
      if (targetRole === 'owner') {
        if (actorRole !== 'owner') {
          return res.status(403).json({ message: 'Only an owner can remove another owner' });
        }
        if ((await ownerCount(storage, teamId)) <= 1) {
          return res.status(409).json({ message: 'Cannot remove the sole team owner' });
        }
      }

      await storage.db
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)));
      return res.status(204).send();
    }
  );
}
