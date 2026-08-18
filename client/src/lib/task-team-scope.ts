export interface TaskTeamOption {
  id: number | string;
  name: string;
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
 * A scoped task form may only submit to its effective team. The all-teams
 * view may choose from the user's accessible team list.
 */
export function isTaskTeamSelectionLocked(effectiveTeamId: string | undefined): boolean {
  return Boolean(effectiveTeamId);
}
