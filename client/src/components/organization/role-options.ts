/**
 * Which organization role changes and removals the members table offers a caller (issue #124
 * X1c). This is display logic only: the server decides every change again under the
 * organization lock (DBStorage.decideOrganizationRoleChange / decideOrganizationMemberRemoval in
 * server/storage.ts) and a refusal is shown as it comes back. The rules below follow those two
 * functions step by step, and tests/unit/organization-role-options.test.ts compares the two for
 * every combination, so they cannot drift apart unnoticed.
 */
export type OrganizationRole = 'owner' | 'admin' | 'member';

export const ORGANIZATION_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'member'];

const RANK: Record<OrganizationRole, number> = { owner: 3, admin: 2, member: 1 };

/** What the screen knows about the organization beyond the caller's role and the row. */
export interface RoleOptionContext {
  /**
   * Owners of the organization that are active accounts, counted from the members list (what the
   * server's last-owner rule counts). Unknown (undefined): the last-owner rule is left to the
   * server.
   */
  activeOwnerCount?: number;
  /** Whether the row's account is active (an inactive owner does not count as an active owner). */
  rowIsActive?: boolean;
}

function isManager(role: OrganizationRole | null | undefined): role is 'owner' | 'admin' {
  return role === 'owner' || role === 'admin';
}

/** Would taking this owner out of the owners leave the organization without an active owner? */
function wouldLeaveNoActiveOwner(ctx: RoleOptionContext | undefined): boolean {
  if (ctx?.activeOwnerCount === undefined) return false;
  return ctx.activeOwnerCount - (ctx.rowIsActive === false ? 0 : 1) < 1;
}

/** Would the server accept the caller setting `requested` on a row that holds `row`? */
function roleChangeAllowed(
  caller: OrganizationRole,
  row: OrganizationRole,
  isSelf: boolean,
  requested: OrganizationRole,
  ctx: RoleOptionContext | undefined
): boolean {
  if (!isManager(caller)) return false;
  // Granting or changing the owner role needs an owner.
  if ((row === 'owner' || requested === 'owner') && caller !== 'owner') return false;
  // Changing another admin needs an owner.
  if (row === 'admin' && !isSelf && caller !== 'owner') return false;
  // Nobody raises their own role.
  if (isSelf && RANK[requested] > RANK[row]) return false;
  // An organization keeps an active owner.
  if (requested !== row && row === 'owner' && wouldLeaveNoActiveOwner(ctx)) return false;
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
  isSelf: boolean,
  ctx?: RoleOptionContext
): OrganizationRole[] {
  if (!caller || !isManager(caller)) return [];
  if (isSelf && row !== caller) return [];
  const options = ORGANIZATION_ROLES.filter((requested) =>
    roleChangeAllowed(caller, row, isSelf, requested, ctx)
  );
  // Only the current role left: there is nothing to change.
  return options.length === 1 && options[0] === row ? [] : [...options];
}

/** Does the members table offer "Remove" on this row? */
export function canRemoveMember(
  caller: OrganizationRole | null | undefined,
  row: OrganizationRole,
  isSelf: boolean,
  ctx?: RoleOptionContext
): boolean {
  if (!caller || !isManager(caller)) return false;
  if (isSelf) return false;
  if ((row === 'owner' || row === 'admin') && caller !== 'owner') return false;
  if (row === 'owner' && wouldLeaveNoActiveOwner(ctx)) return false;
  return true;
}
