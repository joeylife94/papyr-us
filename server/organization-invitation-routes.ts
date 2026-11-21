/**
 * Organization invitation routes and the sign-up policy endpoint (issue #124 X1d). Registered in
 * server/index.ts before the legacy route bundle, so every route carries its own guard.
 *
 * - /api/organization/invitations: owners and admins create, list and revoke. An admin invites
 *   members only, an owner members or admins, nobody an owner (decided under the organization
 *   lock, DBStorage.createOrganizationInvitation).
 * - /api/invitations/preview and /api/invitations/accept: the token travels in a POST body, never
 *   in a path or query string, because the request logger writes the path. The acceptance page
 *   reads it from the URL fragment, which a browser does not send to the server.
 * - A token that is unknown, malformed, expired, used, revoked or no longer backed by its creator
 *   gets one answer (404 invitation_invalid).
 * - /api/auth/oauth-invitation keeps a token across a social sign-in round trip in an httpOnly
 *   cookie that is only sent to /api/auth/*.
 */
import type { Express, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { authMiddleware, buildAccountRateLimiter, type AuthRequest } from './middleware.js';
import { requireOrganizationRole, type OrganizationRequest } from './organization-guards.js';
import {
  INVITATION_DEFAULT_DAYS,
  INVITATION_INTENT_COOKIE,
  INVITATION_INVALID_BODY,
  INVITATION_MAX_DAYS,
  isPlausibleInvitationToken,
} from './organization-invitations.js';
import { OrganizationBusyError, type DBStorage } from './storage.js';
import { isEmailConfigured, sendEmail } from './services/email.js';
import logger from './services/logger.js';

const INTENT_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;

export function invitationIntentCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    // Only the sign-in routes see it; it is never sent to the API the page uses.
    path: '/api/auth',
  };
}

const MANAGERS = ['owner', 'admin'] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strict: a key the route does not name (organizationId, createdBy, token, ...) is refused.
const createInvitationSchema = z
  .object({
    email: z.string().trim().max(255).regex(EMAIL_PATTERN).nullable().optional(),
    role: z.enum(['member', 'admin']),
    expiresInDays: z.number().int().min(1).max(INVITATION_MAX_DAYS).optional(),
  })
  .strict();

const tokenBodySchema = z.object({ token: z.string().max(512) }).strict();

function parseInvitationId(raw: string): number | null {
  if (!/^[0-9]{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

function busy(res: Response) {
  return res.status(503).json({ message: 'Organization is busy, try again' });
}

/**
 * A limiter keyed on the client address only, for routes a signed-out person can reach: the
 * session is never read, so a forged cookie cannot choose its own bucket. Same switches as
 * buildRateLimiter (RATE_LIMIT_ENABLED and the admin IP whitelist).
 */
export function buildAddressRateLimiter(opts: { windowMs: number; max: number }): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      if (!config.rateLimitEnabled) return true;
      const ip = req.ip || '';
      return config.adminIpWhitelist.some((w: string) => ip.includes(w));
    },
    keyGenerator: (req) => `address:${req.ip || 'unknown'}`,
  });
}

function invalidInvitation(res: Response) {
  return res.status(404).json(INVITATION_INVALID_BODY);
}

/** The address links in emails point at: APP_BASE_URL when it is set, else the address of this request. */
function appBaseUrl(req: Request): string {
  const configured = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^\s]+$/i.test(configured)) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export type InvitationDelivery =
  /** No address was given: there is a link to copy. */
  | 'not_requested'
  /** SMTP is not configured: there is a link to copy. */
  | 'not_configured'
  | 'sent'
  | 'failed'
  /** The mail server had not answered after a few seconds; it keeps trying and the link can be copied meanwhile. */
  | 'pending';

const DELIVERY_BUDGET_MS = 3000;

/**
 * Sends the invitation email without making the inviter wait for a slow mail server: the result
 * is awaited for a few seconds, after which the send carries on in the background. Never throws.
 * The message body holds the link; it is not logged (the email service logs the address and the
 * subject only).
 */
async function deliverInvitationEmail(input: {
  to: string;
  link: string;
  organizationName: string;
  inviterName: string;
  expiresAt: Date;
}): Promise<InvitationDelivery> {
  if (!isEmailConfigured()) return 'not_configured';
  const organizationName = oneLine(input.organizationName);
  const inviterName = oneLine(input.inviterName);
  const sending = sendEmail({
    to: input.to,
    subject: `[Papyr.us] ${organizationName} 조직에 초대되었습니다`,
    text:
      `${inviterName}님이 ${organizationName} 조직에 초대했습니다.\n\n` +
      `아래 링크를 열어 초대를 수락하세요. 링크는 한 번만 쓸 수 있습니다.\n${input.link}\n\n` +
      `이 초대는 ${input.expiresAt.toISOString().slice(0, 10)}까지 유효합니다. ` +
      `초대받을 이유가 없다면 이 메일을 무시하세요.`,
  }).then((result): InvitationDelivery => (result.sent ? 'sent' : 'failed'));
  const budget = new Promise<InvitationDelivery>((resolve) => {
    const timer = setTimeout(() => resolve('pending'), DELIVERY_BUDGET_MS);
    timer.unref?.();
  });
  try {
    return await Promise.race([sending, budget]);
  } catch {
    return 'failed';
  }
}

export function registerOrganizationInvitationRoutes(app: Express, storage: DBStorage) {
  // Creating invitations: counted per verified account, after the role check, so refused
  // requests never use an allowance up.
  const rlCreate = buildAccountRateLimiter({ windowMs: 60_000, max: 20 });
  const rlAcceptAccount = buildAccountRateLimiter({ windowMs: 60_000, max: 10 });
  const rlAddress = buildAddressRateLimiter({ windowMs: 60_000, max: 30 });

  // What sign-up looks like on this deployment, for the registration page.
  app.get('/api/auth/signup-policy', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({ mode: config.signupMode });
  });

  app.get(
    '/api/organization/invitations',
    authMiddleware,
    requireOrganizationRole([...MANAGERS]),
    async (req: OrganizationRequest, res: Response) => {
      try {
        return res.json(await storage.listOrganizationInvitations(req.organization!.id));
      } catch {
        return res.status(500).json({ message: 'Server error' });
      }
    }
  );

  app.post(
    '/api/organization/invitations',
    authMiddleware,
    requireOrganizationRole([...MANAGERS]),
    rlCreate,
    async (req: OrganizationRequest, res: Response) => {
      const parsed = createInvitationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: 'Invalid invitation' });
      try {
        const result = await storage.createOrganizationInvitation(
          req.organization!.id,
          Number(req.user!.id),
          {
            email: parsed.data.email ? parsed.data.email : null,
            role: parsed.data.role,
            expiresInDays: parsed.data.expiresInDays ?? INVITATION_DEFAULT_DAYS,
          }
        );
        if (!result.ok) return res.status(result.status).json(result.body);
        const { invitation, token, organizationName, inviterName } = result.value;
        const link = `${appBaseUrl(req)}/join#token=${token}`;
        const delivery: InvitationDelivery = invitation.email
          ? await deliverInvitationEmail({
              to: invitation.email,
              link,
              organizationName,
              inviterName,
              expiresAt: invitation.expiresAt,
            })
          : 'not_requested';
        // The token is in this response and nowhere else, once: the inviter copies the link.
        res.set('Cache-Control', 'no-store');
        return res.status(201).json({ invitation, token, delivery });
      } catch (error) {
        if (error instanceof OrganizationBusyError) return busy(res);
        logger.error('Failed to create organization invitation', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return res.status(500).json({ message: 'Server error' });
      }
    }
  );

  app.delete(
    '/api/organization/invitations/:id',
    authMiddleware,
    requireOrganizationRole([...MANAGERS]),
    async (req: OrganizationRequest, res: Response) => {
      const invitationId = parseInvitationId(req.params.id);
      if (invitationId === null) return res.status(404).json({ message: 'Invitation not found' });
      try {
        const result = await storage.revokeOrganizationInvitation(
          req.organization!.id,
          Number(req.user!.id),
          invitationId
        );
        if (!result.ok) return res.status(result.status).json(result.body);
        return res.json({ revoked: true, id: result.value.id });
      } catch (error) {
        if (error instanceof OrganizationBusyError) return busy(res);
        return res.status(500).json({ message: 'Server error' });
      }
    }
  );

  // What the link is for, before anything is accepted. Signed-out people can ask.
  app.post('/api/invitations/preview', rlAddress, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const parsed = tokenBodySchema.safeParse(req.body);
    if (!parsed.success) return invalidInvitation(res);
    try {
      const preview = await storage.previewOrganizationInvitation(parsed.data.token);
      if (!preview) return invalidInvitation(res);
      return res.json(preview);
    } catch {
      return res.status(500).json({ message: 'Server error' });
    }
  });

  // An existing, signed-in account joins. The address limiter runs first and counts every
  // request; the account limiter counts the verified account.
  app.post(
    '/api/invitations/accept',
    rlAddress,
    authMiddleware,
    rlAcceptAccount,
    async (req: AuthRequest, res: Response) => {
      res.set('Cache-Control', 'no-store');
      const parsed = tokenBodySchema.safeParse(req.body);
      if (!parsed.success) return invalidInvitation(res);
      try {
        const result = await storage.acceptOrganizationInvitation(
          parsed.data.token,
          Number(req.user!.id)
        );
        switch (result.kind) {
          case 'joined':
            return res.json({
              status: 'joined',
              organization: { id: result.organizationId, name: result.organizationName },
              role: result.role,
            });
          case 'already_member':
            return res.json({
              status: 'already_member',
              organization: { id: result.organizationId, name: result.organizationName },
              message: 'You already belong to this organization; the invitation was used up',
            });
          case 'account_inactive':
            return res
              .status(403)
              .json({ code: 'account_inactive', message: 'This account is deactivated' });
          case 'email_mismatch':
            return res.status(403).json({
              code: 'invitation_email_mismatch',
              message: 'This invitation was made for a different email address',
            });
          case 'other_organization':
            return res.status(409).json({
              code: 'account_in_other_organization',
              message: 'This account already belongs to another organization',
            });
          default:
            return invalidInvitation(res);
        }
      } catch (error) {
        if (error instanceof OrganizationBusyError) return busy(res);
        logger.error('Failed to accept organization invitation', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return res.status(500).json({ message: 'Server error' });
      }
    }
  );

  // A social sign-in leaves the site and comes back, so the token waits in an httpOnly cookie that
  // only /api/auth/* receives. Nothing is checked here: the token is used (and judged) by the
  // sign-in callback.
  app.post('/api/auth/oauth-invitation', rlAddress, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const parsed = tokenBodySchema.safeParse(req.body);
    if (!parsed.success || !isPlausibleInvitationToken(parsed.data.token)) {
      return invalidInvitation(res);
    }
    res.cookie(INVITATION_INTENT_COOKIE, parsed.data.token, {
      ...invitationIntentCookieOptions(),
      maxAge: INTENT_COOKIE_MAX_AGE_MS,
    });
    return res.status(204).end();
  });
}
