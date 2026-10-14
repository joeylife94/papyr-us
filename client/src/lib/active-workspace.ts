export interface WorkspaceTeamRef {
  id: string | number;
  name: string;
  displayName?: string | null;
}

export interface ActiveWorkspace {
  /** Team slug used in `/teams/:teamName/...` routes. */
  name: string;
  /** Human-readable team name, falling back to the slug. */
  displayName: string;
  /** Prefix for team-scoped routes (tasks, calendar, members, ...). */
  basePath: string;
  /** Workspace document list route. */
  documentsPath: string;
  /** Workspace-scoped document creation route. */
  createPath: string;
}

/**
 * Which workspace the current route belongs to:
 * - `team`: a team workspace the user can access;
 * - `personal`: the user's own documents (no team);
 * - `unknown`: not determinable yet (data still loading) or not workspace-scoped (e.g. tools).
 */
export type WorkspaceScope =
  | { kind: 'team'; workspace: ActiveWorkspace }
  | { kind: 'personal' }
  | { kind: 'unknown' };

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Team slug carried by a `/teams/:teamName/...` route, if any. */
export function teamNameFromPath(pathname: string): string | null {
  const segment = pathname.match(/^\/teams\/([^/]+)(?:\/|$)/)?.[1];
  return segment ? decodeSegment(segment) : null;
}

/**
 * React Query key of the document a reader (`/page/:slug`) or editor (`/edit/:pageId`) route
 * loads, so the shell can read that cached document instead of fetching it again.
 */
export function documentQueryKeyFromPath(pathname: string): string | null {
  const slug = pathname.match(/^\/page\/([^/]+)\/?$/)?.[1];
  if (slug) return `/api/pages/slug/${decodeSegment(slug)}`;
  const pageId = pathname.match(/^\/edit\/([^/]+)\/?$/)?.[1];
  return pageId ? `/api/pages/${decodeSegment(pageId)}` : null;
}

function teamWorkspace(name: string, teams: WorkspaceTeamRef[]): WorkspaceScope {
  const team = teams.find((candidate) => candidate.name === name);
  const basePath = `/teams/${encodeURIComponent(name)}`;
  return {
    kind: 'team',
    workspace: {
      name,
      displayName: team?.displayName || name,
      basePath,
      documentsPath: `${basePath}/pages`,
      createPath: `${basePath}/create`,
    },
  };
}

/**
 * Resolve the workspace scope of a route, for display and navigation only.
 *
 * Team routes name the workspace directly. Document routes have no team segment, so they are
 * resolved from the loaded document's teamId against the membership-scoped team list; a team
 * that is not in that list is reported as `unknown` rather than guessed.
 */
export function resolveWorkspaceScope(
  pathname: string,
  teams: WorkspaceTeamRef[] | undefined,
  document?: { teamId?: string | number | null } | null
): WorkspaceScope {
  const accessibleTeams = Array.isArray(teams) ? teams : [];

  const routeTeam = teamNameFromPath(pathname);
  if (routeTeam) return teamWorkspace(routeTeam, accessibleTeams);

  if (documentQueryKeyFromPath(pathname)) {
    if (!document) return { kind: 'unknown' };
    if (document.teamId == null) return { kind: 'personal' };
    const name = accessibleTeams.find((team) => String(team.id) === String(document.teamId))?.name;
    return name ? teamWorkspace(name, accessibleTeams) : { kind: 'unknown' };
  }

  if (pathname === '/' || /^\/create(\/[^/]+)?\/?$/.test(pathname)) return { kind: 'personal' };
  return { kind: 'unknown' };
}

/** Convenience accessor: the team workspace of a route, or null when it is not team-scoped. */
export function resolveActiveWorkspace(
  pathname: string,
  teams: WorkspaceTeamRef[] | undefined,
  document?: { teamId?: string | number | null } | null
): ActiveWorkspace | null {
  const scope = resolveWorkspaceScope(pathname, teams, document);
  return scope.kind === 'team' ? scope.workspace : null;
}
