/**
 * Which team role changes, removals and leaving the team members screen offers a caller (WP2).
 * This is display logic only: the server decides every change again under the team lock
 * (DBStorage.decideTeamRoleChange / decideTeamMemberRemoval in server/storage.ts) and a refusal
 * is shown as it comes back. The rules below follow those two functions step by step, and
 * tests/unit/team-role-options.test.ts compares the two for every combination, so they cannot
 * drift apart unnoticed.
 */
export type TeamRole = 'owner' | 'admin' | 'member';

export const TEAM_ROLES: readonly TeamRole[] = ['owner', 'admin', 'member'];

const RANK: Record<TeamRole, number> = { owner: 3, admin: 2, member: 1 };

/** What the screen knows about the team beyond the caller's role and the row. */
export interface TeamRoleOptionContext {
  /**
   * Owners of the team that are active accounts, counted from the members list (what the server's
   * last-owner rule counts). Unknown (undefined): the last-owner rule is left to the server.
   */
  activeOwnerCount?: number;
  /** Whether the row's account is active (an inactive owner does not count as an active owner). */
  rowIsActive?: boolean;
}

function isManager(role: TeamRole | null | undefined): role is 'owner' | 'admin' {
  return role === 'owner' || role === 'admin';
}

/** Would taking this owner out of the owners leave the team without an active owner? */
function wouldLeaveNoActiveOwner(ctx: TeamRoleOptionContext | undefined): boolean {
  if (ctx?.activeOwnerCount === undefined) return false;
  return ctx.activeOwnerCount - (ctx.rowIsActive === false ? 0 : 1) < 1;
}

/** Would the server accept the caller setting `requested` on a row that holds `row`? */
function roleChangeAllowed(
  caller: TeamRole,
  row: TeamRole,
  isSelf: boolean,
  requested: TeamRole,
  ctx: TeamRoleOptionContext | undefined
): boolean {
  if (!isManager(caller)) return false;
  // Granting or changing the owner role needs an owner.
  if ((row === 'owner' || requested === 'owner') && caller !== 'owner') return false;
  // Changing another admin needs an owner.
  if (row === 'admin' && !isSelf && caller !== 'owner') return false;
  // Nobody raises their own role.
  if (isSelf && RANK[requested] > RANK[row]) return false;
  // A team keeps an active owner.
  if (requested !== row && row === 'owner' && wouldLeaveNoActiveOwner(ctx)) return false;
  return true;
}

/**
 * The roles to offer in the select of a member row, highest first, the row's current role
 * included. An empty list means the row gets no control. `isSelf` rows always hold the caller's
 * own role; a row that says otherwise gets no control.
 */
export function allowedTeamRoleOptions(
  caller: TeamRole | null | undefined,
  row: TeamRole,
  isSelf: boolean,
  ctx?: TeamRoleOptionContext
): TeamRole[] {
  if (!caller || !isManager(caller)) return [];
  if (isSelf && row !== caller) return [];
  const options = TEAM_ROLES.filter((requested) =>
    roleChangeAllowed(caller, row, isSelf, requested, ctx)
  );
  // Only the current role left: there is nothing to change.
  return options.length === 1 && options[0] === row ? [] : [...options];
}

/**
 * Does the screen offer "Remove" on this row? Another person's row only: the caller's own row
 * offers "Leave the team" (canLeaveTeam) instead.
 */
export function canRemoveTeamMember(
  caller: TeamRole | null | undefined,
  row: TeamRole,
  isSelf: boolean,
  ctx?: TeamRoleOptionContext
): boolean {
  if (!caller || !isManager(caller)) return false;
  if (isSelf) return false;
  if ((row === 'owner' || row === 'admin') && caller !== 'owner') return false;
  if (row === 'owner' && wouldLeaveNoActiveOwner(ctx)) return false;
  return true;
}

/** Does the screen offer "Leave the team" to a member holding `caller`? Not to the last active owner. */
export function canLeaveTeam(
  caller: TeamRole | null | undefined,
  ctx?: TeamRoleOptionContext
): boolean {
  if (!caller) return false;
  if (caller === 'owner' && wouldLeaveNoActiveOwner(ctx)) return false;
  return true;
}

/** Does the screen offer "Add member"? */
export function canAddTeamMember(caller: TeamRole | null | undefined): boolean {
  return isManager(caller);
}
