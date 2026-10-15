import { createHash, randomBytes } from 'crypto';
import type { Express } from 'express';
import { authMiddleware, type AuthRequest } from './middleware.js';
import type { DBStorage } from './storage.js';
import { admitRegisteredMember } from './team-membership-routes.js';

const DEFAULT_INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_INVITE_TTL_SECONDS = 30 * 24 * 60 * 60;

function parsePositiveInt(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function publicInvite(row: any) {
  return {
    id: Number(row.id),
    teamId: Number(row.team_id),
    email: row.invited_email,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

async function requireInvitationManager(storage: DBStorage, userId: number, teamId: number) {
  const role = await storage.getUserTeamRole(userId, teamId);
  return role === 'owner' || role === 'admin' ? role : null;
}

let invitationSchemaReady: Promise<void> | null = null;
function ensureInvitationSchema(storage: DBStorage): Promise<void> {
  if (!invitationSchemaReady) {
    invitationSchemaReady = storage.pool
      .query(`
        CREATE TABLE IF NOT EXISTS team_invitations (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          invited_email TEXT NOT NULL,
          inviter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_digest TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'pending',
          expires_at TIMESTAMP NOT NULL,
          accepted_at TIMESTAMP,
          cancelled_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        invitationSchemaReady = null;
        throw error;
      });
  }
  return invitationSchemaReady;
}

async function invitationByToken(storage: DBStorage, token: string) {
  await ensureInvitationSchema(storage);
  const digest = digestToken(token);
  const result = await storage.pool.query(
    `SELECT id, team_id, invited_email, inviter_user_id, status, expires_at, accepted_at, cancelled_at
       FROM team_invitations
      WHERE token_digest = $1`,
    [digest]
  );
  return result.rows[0] || null;
}

export function registerTeamInvitationRoutes(app: Express, storage: DBStorage) {
  app.post('/api/teams/:teamId/invitations', authMiddleware, async (req: AuthRequest, res) => {
    const teamId = parsePositiveInt(req.params.teamId);
    const actorUserId = Number(req.user?.id);
    if (!teamId) return res.status(400).json({ message: 'Invalid team ID' });

    const actorRole = await requireInvitationManager(storage, actorUserId, teamId);
    if (!actorRole) return res.status(403).json({ message: 'Owner or admin role required' });

    const email = normalizeEmail(req.body?.email);
    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid invited email is required' });
    }

    let expiresInSeconds = DEFAULT_INVITE_TTL_SECONDS;
    if (req.body?.expiresInSeconds !== undefined) {
      if (process.env.NODE_ENV !== 'test') {
        return res.status(400).json({ message: 'Custom invite expiry is test-only' });
      }
      const requested = Number(req.body.expiresInSeconds);
      if (!Number.isFinite(requested) || requested < 0 || requested > MAX_INVITE_TTL_SECONDS) {
        return res.status(400).json({ message: 'Invalid invite expiry' });
      }
      expiresInSeconds = requested;
    }

    await ensureInvitationSchema(storage);
    const token = randomBytes(32).toString('base64url');
    const tokenDigest = digestToken(token);
    const result = await storage.pool.query(
      `INSERT INTO team_invitations
         (team_id, invited_email, inviter_user_id, token_digest, status, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW() + ($5 * INTERVAL '1 second'))
       RETURNING id, team_id, invited_email, status, expires_at`,
      [teamId, email, actorUserId, tokenDigest, expiresInSeconds]
    );

    return res.status(201).json({ ...publicInvite(result.rows[0]), token });
  });

  app.get('/api/invitations/:token', async (req, res) => {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    if (token.length < 24) return res.status(404).json({ message: 'Invitation not found' });

    const invitation = await invitationByToken(storage, token);
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
    if (invitation.status !== 'pending') {
      return res.status(410).json({ message: 'Invitation is no longer active' });
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await storage.pool.query(
        `UPDATE team_invitations SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
        [invitation.id]
      );
      return res.status(410).json({ message: 'Invitation expired' });
    }

    return res.status(200).json(publicInvite(invitation));
  });

  app.post('/api/invitations/:token/accept', authMiddleware, async (req: AuthRequest, res) => {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    if (token.length < 24) return res.status(404).json({ message: 'Invitation not found' });

    const invitation = await invitationByToken(storage, token);
    if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
    if (invitation.status !== 'pending') {
      return res.status(409).json({ message: 'Invitation already consumed or inactive' });
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await storage.pool.query(
        `UPDATE team_invitations SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
        [invitation.id]
      );
      return res.status(410).json({ message: 'Invitation expired' });
    }

    const actorUserId = Number(req.user?.id);
    const actor = await storage.pool.query('SELECT id, email FROM users WHERE id = $1', [actorUserId]);
    const actorEmail = normalizeEmail(actor.rows[0]?.email);
    if (!actorEmail || actorEmail !== normalizeEmail(invitation.invited_email)) {
      return res.status(403).json({ message: 'Invitation belongs to a different identity' });
    }

    const membership = await admitRegisteredMember(storage, Number(invitation.team_id), actorUserId);
    const consumed = await storage.pool.query(
      `UPDATE team_invitations
          SET status = 'accepted', accepted_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id`,
      [invitation.id]
    );

    if (consumed.rowCount !== 1) {
      return res.status(409).json({ message: 'Invitation was already consumed' });
    }

    return res.status(membership.created ? 201 : 200).json({
      teamId: Number(invitation.team_id),
      userId: actorUserId,
      role: membership.membership.role,
    });
  });

  app.delete(
    '/api/teams/:teamId/invitations/:invitationId',
    authMiddleware,
    async (req: AuthRequest, res) => {
      const teamId = parsePositiveInt(req.params.teamId);
      const invitationId = parsePositiveInt(req.params.invitationId);
      const actorUserId = Number(req.user?.id);
      if (!teamId || !invitationId) {
        return res.status(400).json({ message: 'Invalid team or invitation ID' });
      }

      const actorRole = await requireInvitationManager(storage, actorUserId, teamId);
      if (!actorRole) return res.status(403).json({ message: 'Owner or admin role required' });

      await ensureInvitationSchema(storage);
      const cancelled = await storage.pool.query(
        `UPDATE team_invitations
            SET status = 'cancelled', cancelled_at = NOW()
          WHERE id = $1 AND team_id = $2 AND status = 'pending'
          RETURNING id`,
        [invitationId, teamId]
      );
      if (cancelled.rowCount !== 1) return res.status(404).json({ message: 'Pending invitation not found' });
      return res.status(204).send();
    }
  );
}
