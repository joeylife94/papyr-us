/**
 * Organization invitations and the sign-up policy: the pure rules (issue #124 X1d).
 *
 * Rules under test:
 * - a token is 32 random bytes in URL-safe text; the stored form is its SHA-256 and never the
 *   token; digests compare in constant time; anything that does not look like an issued token is
 *   rejected before a lookup;
 * - an admin may invite members only, an owner members or admins, nobody an owner or a member;
 * - an admin may revoke member invitations only; only a pending invitation can be revoked;
 * - an invitation is usable only while pending, while its organization is active, while its
 *   creator still holds a role that may grant its role, and only with a role an invitation may carry;
 * - acceptance answers in a fixed order: unusable (one answer), inactive account, other address,
 *   other organization, same organization, join;
 * - SIGNUP_MODE: unset is open; an unknown value is invalid; `closed` admits nobody (the token is
 *   not even looked at), `invite_only` admits a token holder or the ADMIN_EMAILS bootstrap.
 */
import { describe, it, expect } from 'vitest';
import {
  INVITATION_TOKEN_BYTES,
  decideInvitationAcceptance,
  decideInvitationCreate,
  decideInvitationRegistration,
  decideInvitationRevoke,
  decideSignup,
  digestsEqual,
  generateInvitationToken,
  grantableInvitationRoles,
  hashInvitationToken,
  invitationStatusOf,
  invitationUsable,
  isPlausibleInvitationToken,
  type InvitationState,
} from '../organization-invitations';
import { parseSignupMode, SIGNUP_MODES } from '../config';

describe('invitation tokens', () => {
  it('are 32 random bytes of URL-safe text, different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateInvitationToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(INVITATION_TOKEN_BYTES);
      expect(isPlausibleInvitationToken(token)).toBe(true);
    }
  });

  it('are stored as their SHA-256, which is not the token and is stable', () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashInvitationToken(token)).toBe(hash);
    expect(hashInvitationToken(generateInvitationToken())).not.toBe(hash);
  });

  it('compare in constant time and refuse a different length', () => {
    const hash = hashInvitationToken('a'.repeat(43));
    expect(digestsEqual(hash, hash)).toBe(true);
    expect(digestsEqual(hash, hashInvitationToken('b'.repeat(43)))).toBe(false);
    expect(digestsEqual(hash, hash.slice(1))).toBe(false);
  });

  it.each([
    undefined,
    null,
    5,
    {},
    [],
    '',
    'short',
    'a'.repeat(42),
    'a'.repeat(201),
    `${'a'.repeat(43)}!`,
  ])('a value that cannot be an issued token (%s) is rejected before any lookup', (value) => {
    expect(isPlausibleInvitationToken(value)).toBe(false);
  });
});

describe('invitation status', () => {
  const none = { acceptedAt: null, revokedAt: null };
  it('is accepted before revoked before expired before pending', () => {
    expect(invitationStatusOf({ ...none, expired: false })).toBe('pending');
    expect(invitationStatusOf({ ...none, expired: true })).toBe('expired');
    expect(invitationStatusOf({ ...none, revokedAt: new Date(), expired: true })).toBe('revoked');
    expect(
      invitationStatusOf({ acceptedAt: new Date(), revokedAt: new Date(), expired: true })
    ).toBe('accepted');
  });
});

describe('who may invite and revoke', () => {
  const actor = (role: 'owner' | 'admin' | 'member', isActive = true) => ({ role, isActive });

  it('an owner invites members or admins, an admin members, a member nobody; owner is never invitable', () => {
    expect(grantableInvitationRoles('owner')).toEqual(['member', 'admin']);
    expect(grantableInvitationRoles('admin')).toEqual(['member']);
    expect(grantableInvitationRoles('member')).toEqual([]);

    const table: Array<[string, any, string, boolean, number?]> = [
      ['owner', actor('owner'), 'member', true],
      ['owner', actor('owner'), 'admin', true],
      ['owner', actor('owner'), 'owner', false, 403],
      ['admin', actor('admin'), 'member', true],
      ['admin', actor('admin'), 'admin', false, 403],
      ['admin', actor('admin'), 'owner', false, 403],
      ['member', actor('member'), 'member', false, 403],
      ['inactive owner', actor('owner', false), 'member', false, 403],
      ['no membership', null, 'member', false, 403],
      ['owner, unknown role', actor('owner'), 'superuser', false, 403],
    ];
    for (const [label, who, role, ok, status] of table) {
      const decision = decideInvitationCreate({ actor: who, role });
      expect(decision.ok, label).toBe(ok);
      if (!decision.ok) expect(decision.status, label).toBe(status);
    }
  });

  it('an admin revokes member invitations only; only a pending one can be revoked; another organization is not found', () => {
    const revoke = (who: any, invitationRole: string, status: any) =>
      decideInvitationRevoke({ actor: who, invitationRole, status });
    expect(revoke(actor('owner'), 'admin', 'pending').ok).toBe(true);
    expect(revoke(actor('owner'), 'member', 'pending').ok).toBe(true);
    expect(revoke(actor('admin'), 'member', 'pending').ok).toBe(true);
    expect(revoke(actor('admin'), 'admin', 'pending')).toMatchObject({ ok: false, status: 403 });
    expect(revoke(actor('member'), 'member', 'pending')).toMatchObject({ ok: false, status: 403 });
    expect(revoke(null, 'member', 'pending')).toMatchObject({ ok: false, status: 403 });
    for (const status of ['accepted', 'revoked', 'expired'] as const) {
      expect(revoke(actor('owner'), 'member', status)).toMatchObject({ ok: false, status: 409 });
    }
    expect(revoke(actor('owner'), 'member', null)).toMatchObject({ ok: false, status: 404 });
  });
});

describe('when an invitation can still be used', () => {
  const base: InvitationState = {
    organizationId: 7,
    role: 'member',
    email: null,
    status: 'pending',
    organizationActive: true,
    creator: { role: 'owner', isActive: true },
  };
  const usable = (patch: Partial<InvitationState>) => invitationUsable({ ...base, ...patch });

  it('needs a pending invitation of an active organization with an owner or admin behind it', () => {
    expect(usable({})).toBe(true);
    expect(invitationUsable(null)).toBe(false);
    for (const status of ['accepted', 'revoked', 'expired'] as const) {
      expect(usable({ status }), status).toBe(false);
    }
    expect(usable({ organizationActive: false })).toBe(false);
  });

  it('stops working when its creator no longer holds a role that may grant it', () => {
    expect(usable({ creator: { role: 'admin', isActive: true } })).toBe(true);
    expect(usable({ creator: { role: 'member', isActive: true } })).toBe(false);
    expect(usable({ creator: { role: 'owner', isActive: false } })).toBe(false);
    expect(usable({ creator: null })).toBe(false);
    // an admin cannot stand behind an invitation for an admin
    expect(usable({ role: 'admin', creator: { role: 'admin', isActive: true } })).toBe(false);
    expect(usable({ role: 'admin', creator: { role: 'owner', isActive: true } })).toBe(true);
  });

  it('never carries the owner role, or any value that is not member or admin', () => {
    expect(usable({ role: 'owner' })).toBe(false);
    expect(usable({ role: 'superuser' })).toBe(false);
  });
});

describe('accepting an invitation as an existing account', () => {
  const invitation: InvitationState = {
    organizationId: 7,
    role: 'member',
    email: null,
    status: 'pending',
    organizationActive: true,
    creator: { role: 'owner', isActive: true },
  };
  const account = {
    isActive: true,
    email: 'new@example.com',
    organizationId: null as number | null,
  };
  const decide = (inv: InvitationState | null, accepter = account) =>
    decideInvitationAcceptance({ invitation: inv, accepter });

  it('joins an active account without an organization with the invited role', () => {
    expect(decide(invitation)).toEqual({ kind: 'join', role: 'member' });
    expect(decide({ ...invitation, role: 'admin' })).toEqual({ kind: 'join', role: 'admin' });
  });

  it('gives one answer for every invitation that cannot be used, whoever asks', () => {
    const accounts = [
      account,
      { ...account, isActive: false },
      { ...account, organizationId: 9 },
      { ...account, organizationId: 7 },
      { ...account, email: 'someone@else.com' },
    ];
    const unusable: Array<InvitationState | null> = [
      null,
      { ...invitation, status: 'expired' },
      { ...invitation, status: 'accepted' },
      { ...invitation, status: 'revoked' },
      { ...invitation, creator: null },
    ];
    for (const inv of unusable) {
      for (const who of accounts) expect(decide(inv, who)).toEqual({ kind: 'invalid' });
    }
  });

  it('refuses an inactive account, then another address, then another organization, in that order', () => {
    const bound = { ...invitation, email: 'invited@example.com' };
    expect(decide(bound, { isActive: false, email: 'x@y.com', organizationId: 9 })).toEqual({
      kind: 'account_inactive',
    });
    expect(decide(bound, { isActive: true, email: 'x@y.com', organizationId: 9 })).toEqual({
      kind: 'email_mismatch',
    });
    expect(
      decide(bound, { isActive: true, email: 'invited@example.com', organizationId: 9 })
    ).toEqual({ kind: 'other_organization' });
    expect(
      decide(bound, { isActive: true, email: ' Invited@Example.com ', organizationId: null })
    ).toEqual({ kind: 'join', role: 'member' });
  });

  it('uses the invitation up for a member of the same organization, and changes nothing else', () => {
    expect(decide(invitation, { ...account, organizationId: 7 })).toEqual({
      kind: 'already_member',
    });
  });

  it('never moves an account out of another organization', () => {
    expect(decide(invitation, { ...account, organizationId: 9 })).toEqual({
      kind: 'other_organization',
    });
  });
});

describe('registering with an invitation', () => {
  const invitation: InvitationState = {
    organizationId: 7,
    role: 'admin',
    email: 'invited@example.com',
    status: 'pending',
    organizationActive: true,
    creator: { role: 'owner', isActive: true },
  };
  it('creates an account only for a usable invitation and the address it was made for', () => {
    expect(decideInvitationRegistration({ invitation, email: 'INVITED@example.com' })).toEqual({
      kind: 'register',
      role: 'admin',
    });
    expect(decideInvitationRegistration({ invitation, email: 'other@example.com' })).toEqual({
      kind: 'email_mismatch',
    });
    expect(
      decideInvitationRegistration({
        invitation: { ...invitation, status: 'revoked' },
        email: 'invited@example.com',
      })
    ).toEqual({ kind: 'invalid' });
    expect(
      decideInvitationRegistration({ invitation: null, email: 'invited@example.com' })
    ).toEqual({
      kind: 'invalid',
    });
  });
});

describe('the sign-up policy', () => {
  it('knows three modes; unset or blank is open; anything else is invalid', () => {
    expect([...SIGNUP_MODES]).toEqual(['open', 'invite_only', 'closed']);
    expect(parseSignupMode(undefined)).toEqual({ ok: true, mode: 'open', explicit: false });
    expect(parseSignupMode('')).toEqual({ ok: true, mode: 'open', explicit: false });
    expect(parseSignupMode('  ')).toEqual({ ok: true, mode: 'open', explicit: false });
    expect(parseSignupMode('open')).toEqual({ ok: true, mode: 'open', explicit: true });
    expect(parseSignupMode(' invite_only ')).toEqual({
      ok: true,
      mode: 'invite_only',
      explicit: true,
    });
    expect(parseSignupMode('closed')).toEqual({ ok: true, mode: 'closed', explicit: true });
    for (const bad of ['OPEN', 'invite-only', 'invite', 'true', '1', 'none']) {
      expect(parseSignupMode(bad), bad).toEqual({ ok: false });
    }
  });

  // [mode, has token, bootstrap admin] -> outcome
  const table: Array<[any, boolean, boolean, string]> = [
    ['open', false, false, 'default_organization'],
    ['open', false, true, 'default_organization'],
    ['open', true, false, 'invitation'],
    ['open', true, true, 'invitation'],
    ['invite_only', false, false, 'signup_requires_invitation'],
    ['invite_only', false, true, 'default_organization'],
    ['invite_only', true, false, 'invitation'],
    ['invite_only', true, true, 'invitation'],
    ['closed', false, false, 'signup_closed'],
    ['closed', false, true, 'signup_closed'],
    ['closed', true, false, 'signup_closed'],
    ['closed', true, true, 'signup_closed'],
  ];
  it.each(table)('%s, token %s, bootstrap address %s -> %s', (mode, hasToken, admin, outcome) => {
    const decision = decideSignup({ mode, hasInvitationToken: hasToken, isBootstrapAdmin: admin });
    expect(decision.kind === 'refused' ? decision.code : decision.kind).toBe(outcome);
  });
});
