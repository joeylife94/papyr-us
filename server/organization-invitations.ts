/**
 * Organization invitations and the sign-up policy (issue #124 X1d): the pure rules.
 *
 * An invitation token is a credential, handled like a password: 32 random bytes, URL-safe; only
 * its SHA-256 is stored; compared in constant time; never written to a log, an error message or
 * a URL the server logs. The rules here take values the caller read inside the organization lock
 * (DBStorage.withOrganizationLocks) and return a decision; nothing in this file touches the
 * database, so the same functions run in the unit tests and in the storage transactions.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { OrganizationRole } from '../shared/schema.js';
import type { SignupMode } from './config.js';

/** The cookie that carries an invitation token through a social sign-in (httpOnly, sent only to /api/auth). */
export const INVITATION_INTENT_COOKIE = 'invitation_intent';

/** Bytes of randomness in a token (256 bits). */
export const INVITATION_TOKEN_BYTES = 32;
export const INVITATION_DEFAULT_DAYS = 7;
export const INVITATION_MAX_DAYS = 30;
/** Pending invitations one organization may hold at a time; creating more is refused (409). */
export const MAX_PENDING_INVITATIONS = 200;

/** A new token: URL-safe base64 of INVITATION_TOKEN_BYTES random bytes (43 characters). */
export function generateInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
}

/** The SHA-256 of a token, hex. The only form of a token the database holds. */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Whether a value could be a token this server issued: a string of URL-safe characters of the
 * issued length or more, short of a size limit. Anything else is answered like an unknown token,
 * without a database lookup.
 */
export function isPlausibleInvitationToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43,200}$/.test(value);
}

/** Constant-time equality of two hex digests of the same length. */
export function digestsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** The one status of an invitation row: accepted before revoked before expired. */
export function invitationStatusOf(row: {
  acceptedAt: unknown;
  revokedAt: unknown;
  expired: boolean;
}): InvitationStatus {
  if (row.acceptedAt) return 'accepted';
  if (row.revokedAt) return 'revoked';
  return row.expired ? 'expired' : 'pending';
}

// ---- who may invite, and who may revoke ----

export interface InvitationActor {
  role: OrganizationRole;
  isActive: boolean;
}

export type InvitationRefusal = { ok: false; status: number; body: { message: string } };
export type InvitationAllowed = { ok: true };

/** Roles an organization role may put on an invitation: an admin invites members, an owner members or admins. */
export function grantableInvitationRoles(role: OrganizationRole): Array<'member' | 'admin'> {
  if (role === 'owner') return ['member', 'admin'];
  if (role === 'admin') return ['member'];
  return [];
}

/**
 * Whether `actor` (read inside the organization lock) may create an invitation for `role`. The
 * owner role is never invitable, whatever the request says.
 */
export function decideInvitationCreate(input: {
  actor: InvitationActor | null;
  role: string;
}): InvitationAllowed | InvitationRefusal {
  const { actor, role } = input;
  if (!actor || !actor.isActive || grantableInvitationRoles(actor.role).length === 0) {
    return {
      ok: false,
      status: 403,
      body: { message: 'Organization owner or admin role required' },
    };
  }
  if (!(grantableInvitationRoles(actor.role) as string[]).includes(role)) {
    return {
      ok: false,
      status: 403,
      body: { message: 'Only an organization owner can invite an admin' },
    };
  }
  return { ok: true };
}

/** Whether `actor` may revoke a pending invitation for `invitationRole`: the same ceiling as creating it. */
export function decideInvitationRevoke(input: {
  actor: InvitationActor | null;
  invitationRole: string;
  status: InvitationStatus | null;
}): InvitationAllowed | InvitationRefusal {
  const { actor, invitationRole, status } = input;
  if (status === null) {
    return { ok: false, status: 404, body: { message: 'Invitation not found' } };
  }
  if (!actor || !actor.isActive || grantableInvitationRoles(actor.role).length === 0) {
    return {
      ok: false,
      status: 403,
      body: { message: 'Organization owner or admin role required' },
    };
  }
  if (invitationRole !== 'member' && actor.role !== 'owner') {
    return {
      ok: false,
      status: 403,
      body: { message: 'Only an organization owner can revoke an invitation for an admin' },
    };
  }
  if (status !== 'pending') {
    return { ok: false, status: 409, body: { message: 'The invitation is no longer pending' } };
  }
  return { ok: true };
}

// ---- accepting ----

/** An invitation as read inside the lock of its organization. */
export interface InvitationState {
  organizationId: number;
  role: string;
  /** Lower-cased, or null for a link anyone holding it may use once. */
  email: string | null;
  status: InvitationStatus;
  organizationActive: boolean;
  /** The creator's membership in this organization now; null when it left or the account is gone. */
  creator: InvitationActor | null;
}

/**
 * Whether the invitation can still be used. An invitation stops working when it is not pending,
 * when its organization is switched off, when its role is not one an invitation may carry, or
 * when its creator no longer holds a role that may grant that role (an owner or admin who was
 * demoted or removed takes their outstanding invitations with them).
 */
export function invitationUsable(
  invitation: InvitationState | null
): invitation is InvitationState {
  if (!invitation) return false;
  if (invitation.status !== 'pending') return false;
  if (!invitation.organizationActive) return false;
  if (invitation.role !== 'member' && invitation.role !== 'admin') return false;
  const creator = invitation.creator;
  if (!creator || !creator.isActive) return false;
  return (grantableInvitationRoles(creator.role) as string[]).includes(invitation.role);
}

/** Case-insensitive; an invitation without an email matches every address. */
export function invitationEmailMatches(invitationEmail: string | null, email: string): boolean {
  return invitationEmail === null || invitationEmail === email.trim().toLowerCase();
}

export interface AccepterState {
  isActive: boolean;
  email: string;
  /** The account's organization, whoever's it is; null for an account without one. */
  organizationId: number | null;
}

export type AcceptanceDecision =
  /** Unknown, malformed, expired, used, revoked, or no longer backed by its creator: one answer. */
  | { kind: 'invalid' }
  | { kind: 'account_inactive' }
  | { kind: 'email_mismatch' }
  | { kind: 'other_organization' }
  /** Already a member of the invitation's organization: the invitation is used up, nothing else changes. */
  | { kind: 'already_member' }
  | { kind: 'join'; role: 'member' | 'admin' };

/**
 * What accepting does for an existing account. The order is the contract: an unusable invitation
 * first (the same answer whoever asks), then the account, then the address, then the account's
 * organization.
 */
export function decideInvitationAcceptance(input: {
  invitation: InvitationState | null;
  accepter: AccepterState;
}): AcceptanceDecision {
  const { invitation, accepter } = input;
  if (!invitationUsable(invitation)) return { kind: 'invalid' };
  if (!accepter.isActive) return { kind: 'account_inactive' };
  if (!invitationEmailMatches(invitation.email, accepter.email)) return { kind: 'email_mismatch' };
  if (accepter.organizationId !== null) {
    return accepter.organizationId === invitation.organizationId
      ? { kind: 'already_member' }
      : { kind: 'other_organization' };
  }
  return { kind: 'join', role: invitation.role as 'member' | 'admin' };
}

/** What registering with an invitation does: an unusable invitation, or an address it was not made for, creates nothing. */
export type RegistrationDecision =
  | { kind: 'invalid' }
  | { kind: 'email_mismatch' }
  | { kind: 'register'; role: 'member' | 'admin' };

export function decideInvitationRegistration(input: {
  invitation: InvitationState | null;
  email: string;
}): RegistrationDecision {
  const { invitation, email } = input;
  if (!invitationUsable(invitation)) return { kind: 'invalid' };
  if (!invitationEmailMatches(invitation.email, email)) return { kind: 'email_mismatch' };
  return { kind: 'register', role: invitation.role as 'member' | 'admin' };
}

// ---- sign-up policy ----

export type SignupDecision =
  /** Join the default organization, as every new account did before SIGNUP_MODE existed. */
  | { kind: 'default_organization' }
  /** Go through the invitation: it decides the organization and the role. */
  | { kind: 'invitation' }
  | { kind: 'refused'; status: 403; code: 'signup_closed' | 'signup_requires_invitation' };

/**
 * Whether a person with no account may create one, and where it goes.
 * - `closed`: nobody, invitation or not; the invitation is not even looked at.
 * - an invitation token, in any other mode: through the invitation.
 * - `open`: the default organization.
 * - `invite_only` without a token: only an address listed in ADMIN_EMAILS (the first account of a
 *   new install), placed in the default organization; everyone else is refused.
 */
export function decideSignup(input: {
  mode: SignupMode;
  hasInvitationToken: boolean;
  isBootstrapAdmin: boolean;
}): SignupDecision {
  if (input.mode === 'closed') {
    return { kind: 'refused', status: 403, code: 'signup_closed' };
  }
  if (input.hasInvitationToken) return { kind: 'invitation' };
  if (input.mode === 'open') return { kind: 'default_organization' };
  if (input.isBootstrapAdmin) return { kind: 'default_organization' };
  return { kind: 'refused', status: 403, code: 'signup_requires_invitation' };
}

export const SIGNUP_REFUSAL_MESSAGES = {
  signup_closed: 'Sign-up is closed',
  signup_requires_invitation: 'Sign-up requires an invitation',
} as const;

/** The one answer for an invitation that cannot be used, whatever the reason. */
export const INVITATION_INVALID_BODY = {
  code: 'invitation_invalid',
  message: 'This invitation is not valid',
} as const;
