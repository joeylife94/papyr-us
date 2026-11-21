import { describe, expect, it } from 'vitest';
import {
  grantableInvitationRoles,
  decideInvitationRevoke,
} from '../../server/organization-invitations';
import {
  canRevokeInvitation,
  deliveryText,
  invitableRoles,
  invitationLink,
  tokenFromHash,
  type InvitationDelivery,
  type InvitationStatus,
} from '../../client/src/components/organization/invitation-options';

// The server decides (server/organization-invitations.ts); this only drives what the screen
// offers, so the two are compared for every role.
const ROLES = ['owner', 'admin', 'member'] as const;

describe('invitableRoles', () => {
  it.each(ROLES)('offers a %s exactly the roles the server would accept', (role) => {
    expect(invitableRoles(role)).toEqual(grantableInvitationRoles(role));
  });
  it('offers nothing without a role', () => {
    expect(invitableRoles(null)).toEqual([]);
    expect(invitableRoles(undefined)).toEqual([]);
  });
  it('never offers the owner role', () => {
    for (const role of ROLES) expect(invitableRoles(role)).not.toContain('owner' as never);
  });
});

describe('canRevokeInvitation', () => {
  const statuses: InvitationStatus[] = ['pending', 'accepted', 'revoked', 'expired'];
  it.each(ROLES)('follows the server for a %s', (caller) => {
    for (const invitationRole of ['member', 'admin'] as const) {
      for (const status of statuses) {
        const server = decideInvitationRevoke({
          actor: { role: caller, isActive: true },
          invitationRole,
          status,
        }).ok;
        expect(
          canRevokeInvitation(caller, invitationRole, status),
          `${invitationRole} ${status}`
        ).toBe(server);
      }
    }
  });
});

describe('the link', () => {
  const token = 'A'.repeat(43);
  it('keeps the token in the fragment, which a browser does not send to the server', () => {
    const link = invitationLink('https://wiki.example.com', token);
    expect(link).toBe(`https://wiki.example.com/join#token=${token}`);
    expect(new URL(link).search).toBe('');
  });
  it('reads it back, and only when it is shaped like an issued token', () => {
    expect(tokenFromHash(`#token=${token}`)).toBe(token);
    expect(tokenFromHash(`token=${token}`)).toBe(token);
    for (const bad of ['', '#', '#token=', '#token=short', `#other=${token}`, `#token=${token}!`]) {
      expect(tokenFromHash(bad), bad).toBeNull();
    }
  });
});

describe('deliveryText', () => {
  it('says something different for every outcome, and always how to share the link', () => {
    const outcomes: InvitationDelivery[] = [
      'sent',
      'pending',
      'failed',
      'not_configured',
      'not_requested',
    ];
    const texts = outcomes.map(deliveryText);
    expect(new Set(texts).size).toBe(outcomes.length);
    for (const text of texts) expect(text).toMatch(/링크/);
  });
});
