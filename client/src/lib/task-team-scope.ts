export interface TaskTeamOption {
  id: number | string;
  name: string;
}

export interface TaskFormMemberOption {
  id: number;
  name: string;
  teamId?: number | string | null;
}

/**
 * Resolve the team a task form should submit against.
 *
 * Precedence is intentional:
 * 1. Effective route/filter team when the page is scoped.
 * 2. Existing task team while editing from the all-teams view, but only if
 *    that team is still present in the user's accessible team list.
 * 3. First accessible team when creating from the all-teams view or when an
 *    existing task team is no longer accessible.
 * 4. Empty string when the user has no accessible team.
 */
export function resolveTaskFormTeamId(
  taskTeamId: string | null | undefined,
  effectiveTeamId: string | undefined,
  teams: TaskTeamOption[]
): string {
  if (effectiveTeamId) return String(effectiveTeamId);

  if (taskTeamId) {
    const normalizedTaskTeamId = String(taskTeamId);
    const taskTeamIsAccessible = teams.some((team) => String(team.id) === normalizedTaskTeamId);
    if (taskTeamIsAccessible) return normalizedTaskTeamId;
  }

  return teams.length > 0 ? String(teams[0].id) : '';
}

/**
 * Only members belonging to the task form's selected team are valid assignee
 * options. This is especially important in the all-teams view where the
 * members endpoint legitimately returns the union of the user's teams.
 * Missing/null team metadata fails closed and is never offered as an assignee.
 */
export function membersForTaskTeam<T extends TaskFormMemberOption>(
  members: T[],
  teamId: string | null | undefined
): T[] {
  if (!teamId) return [];
  const normalizedTeamId = String(teamId);
  return members.filter(
    (member) => member.teamId != null && String(member.teamId) === normalizedTeamId
  );
}

/**
 * A scoped task form may only submit to its effective team. The all-teams
 * view may choose from the user's accessible team list.
 */
export function isTaskTeamSelectionLocked(effectiveTeamId: string | undefined): boolean {
  return Boolean(effectiveTeamId);
}
