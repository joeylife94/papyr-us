import { describe, expect, it } from 'vitest';
import { DBStorage } from '../../server/storage';
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

describe('the screen and the server agree (every combination)', () => {
  // The server's decision functions are the contract. For each consistent case, the screen
  // offers a change exactly when the server would accept it and write it, and offers removal
  // exactly when the server would accept it.
  const ACTOR_ID = 1;
  const OTHER_ID = 2;
  let compared = 0;

  for (const caller of ROLES) {
    for (const row of ROLES) {
      for (const isSelf of [false, true]) {
        for (const activeOwnerCount of [1, 2]) {
          // A self row holds the caller's own role; the owner count includes every active owner.
          if (isSelf && row !== caller) continue;
          const required = (caller === 'owner' ? 1 : 0) + (!isSelf && row === 'owner' ? 1 : 0);
          if (activeOwnerCount < required) continue;
          const name = `caller ${caller}, row ${row}, self=${isSelf}, ${activeOwnerCount} active owner(s)`;

          it(name, () => {
            const actor = { userId: ACTOR_ID, role: caller, isActive: true };
            const target = { userId: isSelf ? ACTOR_ID : OTHER_ID, role: row, isActive: true };
            const ctx = { activeOwnerCount, rowIsActive: true };
            const options = allowedRoleOptions(caller, row, isSelf, ctx);
            let anyChange = false;
            for (const requested of ROLES) {
              const decision = DBStorage.decideOrganizationRoleChange({
                actor,
                target,
                requested,
                activeOwnerCount,
              });
              const accepted = decision.ok && decision.write;
              if (requested === row) {
                // Setting the role a row already holds never writes.
                expect(decision.ok && decision.write).toBe(false);
                continue;
              }
              anyChange ||= accepted;
              expect(options.includes(requested), `${name}: offers ${requested}`).toBe(accepted);
            }
            // A row gets a control exactly when some change is possible, its own role included.
            expect(options.length > 0).toBe(anyChange);
            if (anyChange) expect(options).toContain(row);

            const removal = DBStorage.decideOrganizationMemberRemoval({
              actor,
              actorUserId: ACTOR_ID,
              targetUserId: target.userId,
              target,
              activeOwnerCount,
            });
            expect(canRemoveMember(caller, row, isSelf, ctx), `${name}: removal`).toBe(removal.ok);
            compared += 1;
          });
        }
      }
    }
  }

  it('compared every consistent case', () => {
    expect(compared).toBeGreaterThan(20);
  });

  it('offers the only active owner no lower role on their own row', () => {
    expect(allowedRoleOptions('owner', 'owner', true, { activeOwnerCount: 1 })).toEqual([]);
    expect(allowedRoleOptions('owner', 'owner', true, { activeOwnerCount: 2 })).toEqual([
      'owner',
      'admin',
      'member',
    ]);
  });
});
