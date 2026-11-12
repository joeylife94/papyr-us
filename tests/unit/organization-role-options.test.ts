import { describe, expect, it } from 'vitest';
import {
  allowedRoleOptions,
  canRemoveMember,
  type OrganizationRole,
} from '../../client/src/components/organization/role-options';

// Mirrors DBStorage.decideOrganizationRoleChange / decideOrganizationMemberRemoval
// (server/storage.ts) and DESIGN.md section 3. The server decides; this only drives what the
// screen offers, so every combination is spelled out here.

const ROLES: OrganizationRole[] = ['owner', 'admin', 'member'];

describe('allowedRoleOptions (caller role, row role, self)', () => {
  // [caller, row, self, options in rank order; [] = no control]
  const table: Array<[OrganizationRole, OrganizationRole, boolean, OrganizationRole[]]> = [
    // owner: may set any role on any row, its own included (raising to owner is a no-op)
    ['owner', 'owner', false, ['owner', 'admin', 'member']],
    ['owner', 'owner', true, ['owner', 'admin', 'member']],
    ['owner', 'admin', false, ['owner', 'admin', 'member']],
    ['owner', 'admin', true, []], // impossible: self always has the caller's own role
    ['owner', 'member', false, ['owner', 'admin', 'member']],
    ['owner', 'member', true, []], // impossible
    // admin: promote members to admin, lower itself; nothing on owners or other admins
    ['admin', 'owner', false, []],
    ['admin', 'owner', true, []], // impossible
    ['admin', 'admin', false, []],
    ['admin', 'admin', true, ['admin', 'member']],
    ['admin', 'member', false, ['admin', 'member']],
    ['admin', 'member', true, []], // impossible
    // member: manages nothing
    ['member', 'owner', false, []],
    ['member', 'owner', true, []],
    ['member', 'admin', false, []],
    ['member', 'admin', true, []],
    ['member', 'member', false, []],
    ['member', 'member', true, []],
  ];

  it('covers every combination', () => {
    expect(table).toHaveLength(ROLES.length * ROLES.length * 2);
  });

  it.each(table)('caller %s, row %s, self=%s', (caller, row, self, expected) => {
    expect(allowedRoleOptions(caller, row, self)).toEqual(expected);
  });

  it('treats a missing caller role as no rights', () => {
    expect(allowedRoleOptions(null, 'member', false)).toEqual([]);
  });
});

describe('canRemoveMember (caller role, row role, self)', () => {
  const table: Array<[OrganizationRole, OrganizationRole, boolean, boolean]> = [
    ['owner', 'owner', false, true],
    ['owner', 'owner', true, false],
    ['owner', 'admin', false, true],
    ['owner', 'admin', true, false],
    ['owner', 'member', false, true],
    ['owner', 'member', true, false],
    ['admin', 'owner', false, false],
    ['admin', 'owner', true, false],
    ['admin', 'admin', false, false],
    ['admin', 'admin', true, false],
    ['admin', 'member', false, true],
    ['admin', 'member', true, false],
    ['member', 'owner', false, false],
    ['member', 'owner', true, false],
    ['member', 'admin', false, false],
    ['member', 'admin', true, false],
    ['member', 'member', false, false],
    ['member', 'member', true, false],
  ];

  it('covers every combination', () => {
    expect(table).toHaveLength(ROLES.length * ROLES.length * 2);
  });

  it.each(table)('caller %s, row %s, self=%s', (caller, row, self, expected) => {
    expect(canRemoveMember(caller, row, self)).toBe(expected);
  });

  it('treats a missing caller role as no rights', () => {
    expect(canRemoveMember(null, 'member', false)).toBe(false);
  });
});
