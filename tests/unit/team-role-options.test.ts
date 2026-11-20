import { describe, expect, it } from 'vitest';
import { DBStorage } from '../../server/storage';
import {
  allowedTeamRoleOptions,
  canAddTeamMember,
  canLeaveTeam,
  canRemoveTeamMember,
  type TeamRole,
} from '../../client/src/components/team/role-options';

// Mirrors DBStorage.decideTeamRoleChange / decideTeamMemberRemoval (server/storage.ts). The
// server decides; this only drives what the screen offers, so every combination is spelled out
// here and compared with the server's functions below.

const ROLES: TeamRole[] = ['owner', 'admin', 'member'];

describe('allowedTeamRoleOptions (caller role, row role, self)', () => {
  // [caller, row, self, options in rank order; [] = no control]
  const table: Array<[TeamRole, TeamRole, boolean, TeamRole[]]> = [
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
    expect(allowedTeamRoleOptions(caller, row, self)).toEqual(expected);
  });

  it('treats a missing caller role as no rights', () => {
    expect(allowedTeamRoleOptions(null, 'member', false)).toEqual([]);
    expect(allowedTeamRoleOptions(undefined, 'member', false)).toEqual([]);
  });
});

describe('canRemoveTeamMember (caller role, row role, self)', () => {
  // Another person's row only: leaving is canLeaveTeam, so a self row never offers "Remove".
  const table: Array<[TeamRole, TeamRole, boolean, boolean]> = [
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
    expect(canRemoveTeamMember(caller, row, self)).toBe(expected);
  });

  it('treats a missing caller role as no rights', () => {
    expect(canRemoveTeamMember(null, 'member', false)).toBe(false);
  });
});

describe('canLeaveTeam and canAddTeamMember', () => {
  it('every role may leave; the last active owner may not', () => {
    expect(canLeaveTeam('member')).toBe(true);
    expect(canLeaveTeam('admin')).toBe(true);
    expect(canLeaveTeam('owner')).toBe(true);
    expect(canLeaveTeam('owner', { activeOwnerCount: 2 })).toBe(true);
    expect(canLeaveTeam('owner', { activeOwnerCount: 1 })).toBe(false);
    expect(canLeaveTeam('admin', { activeOwnerCount: 1 })).toBe(true);
    expect(canLeaveTeam(null)).toBe(false);
  });

  it('only an owner or admin adds members', () => {
    expect(canAddTeamMember('owner')).toBe(true);
    expect(canAddTeamMember('admin')).toBe(true);
    expect(canAddTeamMember('member')).toBe(false);
    expect(canAddTeamMember(null)).toBe(false);
  });
});

describe('the screen and the server agree (every combination)', () => {
  // The server's decision functions are the contract. For each consistent case, the screen
  // offers a change exactly when the server would accept it and write it, offers removal of
  // another person exactly when the server would accept it, and offers leaving exactly when the
  // server would let that person leave.
  const ACTOR_ID = 1;
  const OTHER_ID = 2;
  let compared = 0;

  for (const caller of ROLES) {
    for (const row of ROLES) {
      for (const isSelf of [false, true]) {
        for (const activeOwnerCount of [1, 2]) {
          for (const rowIsActive of [true, false]) {
            // A self row holds the caller's own role; the active owners are counted among the rows.
            if (isSelf && row !== caller) continue;
            // An inactive actor is not an actor at all: the server reads it as no membership.
            if (isSelf && !rowIsActive) continue;
            const activeOwnersAmongRows =
              (caller === 'owner' ? 1 : 0) + (!isSelf && row === 'owner' && rowIsActive ? 1 : 0);
            if (activeOwnerCount < activeOwnersAmongRows) continue;
            const name = `caller ${caller}, row ${row}, self=${isSelf}, row active=${rowIsActive}, ${activeOwnerCount} active owner(s)`;

            it(name, () => {
              const actor = { userId: ACTOR_ID, role: caller, isActive: true };
              const target = {
                userId: isSelf ? ACTOR_ID : OTHER_ID,
                role: row,
                isActive: rowIsActive,
              };
              const ctx = { activeOwnerCount, rowIsActive };
              const options = allowedTeamRoleOptions(caller, row, isSelf, ctx);
              let anyChange = false;
              for (const requested of ROLES) {
                const decision = DBStorage.decideTeamRoleChange({
                  actor,
                  target,
                  requested,
                  activeOwnerCount,
                });
                const accepted = decision.ok && decision.write;
                if (requested === row) {
                  // Setting the role a row already holds never writes.
                  expect(accepted).toBe(false);
                  continue;
                }
                anyChange ||= accepted;
                expect(options.includes(requested), `${name}: offers ${requested}`).toBe(accepted);
              }
              // A row gets a control exactly when some change is possible, its own role included.
              expect(options.length > 0).toBe(anyChange);
              if (anyChange) expect(options).toContain(row);

              if (isSelf) {
                expect(
                  canRemoveTeamMember(caller, row, true, ctx),
                  `${name}: no remove on self`
                ).toBe(false);
                const leaving = DBStorage.decideTeamMemberRemoval({
                  actor,
                  target: actor,
                  leaving: true,
                  activeOwnerCount,
                });
                expect(canLeaveTeam(caller, ctx), `${name}: leave`).toBe(leaving.ok);
              } else {
                const removal = DBStorage.decideTeamMemberRemoval({
                  actor,
                  target,
                  leaving: false,
                  activeOwnerCount,
                });
                expect(canRemoveTeamMember(caller, row, false, ctx), `${name}: removal`).toBe(
                  removal.ok
                );
              }
              compared += 1;
            });
          }
        }
      }
    }
  }

  it('compared every consistent case', () => {
    expect(compared).toBeGreaterThan(30);
  });

  it('offers the only active owner no lower role on their own row', () => {
    expect(allowedTeamRoleOptions('owner', 'owner', true, { activeOwnerCount: 1 })).toEqual([]);
    expect(allowedTeamRoleOptions('owner', 'owner', true, { activeOwnerCount: 2 })).toEqual([
      'owner',
      'admin',
      'member',
    ]);
  });

  it('adding is offered exactly to the callers the server lets admit', () => {
    for (const caller of ROLES) {
      for (const isActive of [true, false]) {
        // An inactive actor is read as no membership by the server.
        const actor = isActive ? { userId: 1, role: caller, isActive } : null;
        const decision = DBStorage.decideTeamAdmission({ actor });
        expect(canAddTeamMember(isActive ? caller : null), `${caller}, active=${isActive}`).toBe(
          decision.ok
        );
      }
    }
    expect(DBStorage.decideTeamAdmission({ actor: null }).ok).toBe(false);
    expect(canAddTeamMember(undefined)).toBe(false);
  });
});
