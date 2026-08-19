export interface PageTeamRef {
  id: string | number;
  name: string;
}

/**
 * Resolve a team route name to an authoritative accessible team id.
 * Team-scoped page mutations must never send the human-readable route name as teamId.
 */
export function resolvePageTeamId(
  routeTeamName: string | undefined,
  teams: PageTeamRef[]
): string {
  if (!routeTeamName) return '';

  const matched = teams.find((team) => team.name === routeTeamName);
  return matched ? String(matched.id) : '';
}
