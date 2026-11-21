/**
 * The one reader of a team id (or the account id beside it) in a URL, like page-ids.ts for pages.
 * Only plain decimal digits without a sign, a leading zero, an exponent, a space, a fraction or any
 * other text, and within the database's integer range; everything else names no team, so a spelling
 * that a looser reader (parseInt, Number) would turn into another team never reaches it.
 */

/** The largest id the database holds; a larger one names nothing. */
export const MAX_TEAM_ID = 2147483647;

export function parseTeamIdParam(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id <= MAX_TEAM_ID ? id : null;
}

/**
 * A `teamId` read from a query string: no value (undefined or empty) names no team, a strict id
 * is that team, and anything else (another spelling, a repeated parameter, an object) is refused,
 * so a value that parseInt would turn into some team's number never selects that team.
 */
export function readTeamIdQuery(
  raw: unknown
): { ok: true; id: number | undefined } | { ok: false } {
  if (raw === undefined || raw === '') return { ok: true, id: undefined };
  const id = parseTeamIdParam(raw);
  return id === null ? { ok: false } : { ok: true, id };
}
