export interface CalendarTeamRef {
  id: string | number;
  name: string;
}

export function resolveCalendarTeamId(
  routeTeamId: string | undefined,
  routeTeamName: string | undefined,
  teams: CalendarTeamRef[]
): string {
  if (routeTeamId) {
    const matchedById = teams.find((team) => String(team.id) === String(routeTeamId));
    return matchedById ? String(matchedById.id) : '';
  }

  if (routeTeamName) {
    const matchedByName = teams.find((team) => team.name === routeTeamName);
    return matchedByName ? String(matchedByName.id) : '';
  }

  return '';
}
