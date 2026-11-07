import {
  documentQueryKeyFromPath,
  teamNameFromPath,
  type WorkspaceTeamRef,
} from './active-workspace';

/**
 * The workspace scope that the quick switcher and daily notes (#111) search and create pages
 * in, as the numeric team id the page APIs take:
 * - a team route (`/teams/:teamName/...`) is that team, when it is one of the user's teams;
 * - a document route is the open document's team, when it is one of the user's teams;
 * - everything else (and a team the user is not in) is the user's team-less pages.
 *
 * Same rules as `resolveWorkspaceScope` (the shell's display scope), but never "unknown": while
 * the data needed to decide is still loading the scope is `loading`, and callers wait instead of
 * guessing. The server re-checks membership on every request.
 */
export type CurrentPageScope =
  | { status: 'loading' }
  | { status: 'ready'; teamId: number | null; label: string };

export const PERSONAL_SCOPE_LABEL = '내 문서';

const personal: CurrentPageScope = { status: 'ready', teamId: null, label: PERSONAL_SCOPE_LABEL };

export interface CurrentPageScopeInput {
  pathname: string;
  /** The user's teams (membership-scoped `/api/teams`). */
  teams: WorkspaceTeamRef[] | undefined;
  /** The team list has loaded or failed, or teams are disabled. */
  teamsSettled: boolean;
  /** The document a reader/editor route shows, from the query cache. */
  document: { teamId?: string | number | null } | undefined;
  /** The document has loaded or failed (or the route shows none). */
  documentSettled: boolean;
}

function teamScope(team: WorkspaceTeamRef | undefined): CurrentPageScope {
  const teamId = Number(team?.id);
  if (!team || !Number.isInteger(teamId) || teamId <= 0) return personal;
  return { status: 'ready', teamId, label: team.displayName || team.name };
}

export function resolveCurrentPageScope(input: CurrentPageScopeInput): CurrentPageScope {
  const teams = Array.isArray(input.teams) ? input.teams : [];

  const routeTeam = teamNameFromPath(input.pathname);
  if (routeTeam) {
    if (!input.teamsSettled) return { status: 'loading' };
    return teamScope(teams.find((team) => team.name === routeTeam));
  }

  if (documentQueryKeyFromPath(input.pathname)) {
    if (!input.documentSettled) return { status: 'loading' };
    const documentTeamId = input.document?.teamId;
    if (documentTeamId == null) return personal;
    if (!input.teamsSettled) return { status: 'loading' };
    return teamScope(teams.find((team) => String(team.id) === String(documentTeamId)));
  }

  return personal;
}

/** Query string value of a scope for the scope-taking page APIs (`teamId`; '' = team-less). */
export function scopeTeamParam(scope: CurrentPageScope): string {
  return scope.status === 'ready' && scope.teamId !== null ? String(scope.teamId) : '';
}
