import { describe, expect, it } from 'vitest';
import { DBStorage } from '../../server/storage';
import { aiAccessChange } from '../../client/src/components/organization/ai-access-options';
import type { OrganizationRole } from '../../client/src/components/organization/role-options';

// Mirrors DBStorage.decideOrganizationAiAccessChange (server/storage.ts). The server decides;
// this only drives which switch the members table offers, so every combination is spelled out.

const ROLES: OrganizationRole[] = ['owner', 'admin', 'member'];

describe('aiAccessChange (caller role, row role, self, row allowed)', () => {
  // [caller, row, self, rowAllowed, change]
  const table: Array<
    [OrganizationRole, OrganizationRole, boolean, boolean, 'grant' | 'revoke' | null]
  > = [
    // owner: anyone, itself included
    ['owner', 'owner', false, false, 'grant'],
    ['owner', 'owner', false, true, 'revoke'],
    ['owner', 'owner', true, false, 'grant'],
    ['owner', 'owner', true, true, 'revoke'],
    ['owner', 'admin', false, false, 'grant'],
    ['owner', 'admin', false, true, 'revoke'],
    ['owner', 'member', false, false, 'grant'],
    ['owner', 'member', false, true, 'revoke'],
    // admin: plain members both ways; own row only to turn off; nothing on owners or admins
    ['admin', 'owner', false, false, null],
    ['admin', 'owner', false, true, null],
    ['admin', 'admin', false, false, null],
    ['admin', 'admin', false, true, null],
    ['admin', 'admin', true, false, null],
    ['admin', 'admin', true, true, 'revoke'],
    ['admin', 'member', false, false, 'grant'],
    ['admin', 'member', false, true, 'revoke'],
    // member: no control
    ['member', 'owner', false, true, null],
    ['member', 'admin', false, false, null],
    ['member', 'member', false, false, null],
    ['member', 'member', false, true, null],
    ['member', 'member', true, false, null],
    ['member', 'member', true, true, null],
  ];

  it.each(table)(
    'caller %s, row %s, self=%s, allowed=%s',
    (caller, row, self, allowed, expected) => {
      expect(aiAccessChange(caller, row, self, allowed)).toBe(expected);
    }
  );

  it('gives a row that claims to be the caller but holds another role no control', () => {
    expect(aiAccessChange('owner', 'member', true, true)).toBeNull();
    expect(aiAccessChange('admin', 'member', true, false)).toBeNull();
  });

  it('treats a missing caller role as no rights', () => {
    expect(aiAccessChange(null, 'member', false, true)).toBeNull();
    expect(aiAccessChange(undefined, 'member', false, false)).toBeNull();
  });
});

describe('the screen and the server agree (every combination)', () => {
  const ACTOR_ID = 1;
  const OTHER_ID = 2;
  let compared = 0;

  // Whether the server would accept and write `requested` for this row, from `rowAllowed`.
  const serverWrites = (
    caller: OrganizationRole,
    row: OrganizationRole,
    isSelf: boolean,
    rowAllowed: boolean,
    requested: boolean
  ) => {
    const decision = DBStorage.decideOrganizationAiAccessChange({
      actor: {
        userId: ACTOR_ID,
        role: caller,
        isActive: true,
        aiAllowed: isSelf ? rowAllowed : true,
      },
      target: {
        userId: isSelf ? ACTOR_ID : OTHER_ID,
        role: row,
        isActive: true,
        aiAllowed: rowAllowed,
      },
      requested,
    });
    return decision.ok && decision.write;
  };

  for (const caller of ROLES) {
    for (const row of ROLES) {
      for (const isSelf of [false, true]) {
        for (const rowAllowed of [false, true]) {
          // A self row holds the caller's own role.
          if (isSelf && row !== caller) continue;
          it(`caller ${caller}, row ${row}, self=${isSelf}, allowed=${rowAllowed}`, () => {
            const change = aiAccessChange(caller, row, isSelf, rowAllowed);
            // The switch offers the opposite of the row's value, and only when the server would
            // accept and write exactly that.
            expect(change !== null).toBe(
              serverWrites(caller, row, isSelf, rowAllowed, !rowAllowed)
            );
            if (change !== null) {
              expect(change).toBe(rowAllowed ? 'revoke' : 'grant');
            }
            compared += 1;
          });
        }
      }
    }
  }

  it('compared every consistent case', () => {
    expect(compared).toBe(ROLES.length * 2 * 2 + ROLES.length * (ROLES.length - 1) * 2);
  });
});
