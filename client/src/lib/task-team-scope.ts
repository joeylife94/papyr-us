export interface TaskTeamOption {
  id: number | string;
  name: string;
}

/**
 * Resolve the team a task form should submit against.
 *
 * Precedence is intentional:
 * 1. Existing task team when editing.
 * 2. Effective route/filter team when the page is scoped.
 * 3. First accessible team when creating from the all-teams view.
 * 4. Empty string when the user has no accessible team.
 */
export function resolveTaskFormTeamId(
  taskTeamId: string | null | undefined,
  effectiveTeamId: string | undefined,
  teams: TaskTeamOption[]
): string {
  if (taskTeamId) return String(taskTeamId);
  if (effectiveTeamId) return String(effectiveTeamId);
  return teams.length > 0 ? String(teams[0].id) : '';
}

/**
 * A scoped task form may only submit to its effective team. The all-teams
 * view may choose from the user's accessible team list.
 */
export function isTaskTeamSelectionLocked(effectiveTeamId: string | undefined): boolean {
  return Boolean(effectiveTeamId);
}
