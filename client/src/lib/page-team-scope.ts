export interface PageTeamRef {
  id: string | number;
  name: string;
}

/**
 * Resolve a team route name to an authoritative accessible team id.
 * Team-scoped page mutations must never send the human-readable route name as teamId.
 * The page API contract requires a numeric teamId, so numeric-looking IDs are normalized
 * to numbers and invalid IDs fail closed.
 */
export function resolvePageTeamId(
  routeTeamName: string | undefined,
  teams: PageTeamRef[]
): number | '' {
  if (!routeTeamName) return '';

  const matched = teams.find((team) => team.name === routeTeamName);
  if (!matched) return '';

  const teamId = Number(matched.id);
  return Number.isFinite(teamId) ? teamId : '';
}
