/**
 * Which organization role changes and removals the members table offers a caller (issue #124
 * X1c). This is display logic only: the server decides every change again under the
 * organization lock (DBStorage.decideOrganizationRoleChange / decideOrganizationMemberRemoval in
 * server/storage.ts) and a refusal is shown as it comes back. The rules below follow those two
 * functions step by step; the owner count is not known here, so the "last owner" refusal is left
 * to the server.
 */
export type OrganizationRole = 'owner' | 'admin' | 'member';

export const ORGANIZATION_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'member'];

const RANK: Record<OrganizationRole, number> = { owner: 3, admin: 2, member: 1 };

function isManager(role: OrganizationRole | null | undefined): role is 'owner' | 'admin' {
  return role === 'owner' || role === 'admin';
}

/** Would the server accept the caller setting `requested` on a row that holds `row`? */
function roleChangeAllowed(
  caller: OrganizationRole,
  row: OrganizationRole,
  isSelf: boolean,
  requested: OrganizationRole
): boolean {
  if (!isManager(caller)) return false;
  // Granting or changing the owner role needs an owner.
  if ((row === 'owner' || requested === 'owner') && caller !== 'owner') return false;
  // Changing another admin needs an owner.
  if (row === 'admin' && !isSelf && caller !== 'owner') return false;
  // Nobody raises their own role.
  if (isSelf && RANK[requested] > RANK[row]) return false;
  return true;
}

/**
 * The roles to offer in the select of a member row, highest first, the row's current role
 * included. An empty list means the row gets no control. `isSelf` rows always hold the caller's
 * own role; a row that says otherwise gets no control.
 */
export function allowedRoleOptions(
  caller: OrganizationRole | null | undefined,
  row: OrganizationRole,
  isSelf: boolean
): OrganizationRole[] {
  if (!caller || !isManager(caller)) return [];
  if (isSelf && row !== caller) return [];
  const options = ORGANIZATION_ROLES.filter((requested) =>
    roleChangeAllowed(caller, row, isSelf, requested)
  );
  // Only the current role left: there is nothing to change.
  return options.length === 1 && options[0] === row ? [] : [...options];
}

/** Does the members table offer "Remove" on this row? */
export function canRemoveMember(
  caller: OrganizationRole | null | undefined,
  row: OrganizationRole,
  isSelf: boolean
): boolean {
  if (!caller || !isManager(caller)) return false;
  if (isSelf) return false;
  if ((row === 'owner' || row === 'admin') && caller !== 'owner') return false;
  return true;
}
