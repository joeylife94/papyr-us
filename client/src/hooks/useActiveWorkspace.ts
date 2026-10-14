import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  documentQueryKeyFromPath,
  resolveWorkspaceScope,
  type ActiveWorkspace,
  type WorkspaceScope,
  type WorkspaceTeamRef,
} from '@/lib/active-workspace';
import type { WikiPage } from '@shared/schema';

/**
 * Workspace scope of the current route for the shell, reader and editor.
 *
 * Reads only what the sidebar (membership-scoped `/api/teams`) and the reader/editor (the open
 * document) have already loaded: both observers are disabled, so this hook never issues a
 * request and never widens what the user can see. Authorization stays server-side.
 */
export function useWorkspaceScope(): WorkspaceScope {
  const { pathname } = useLocation();
  const documentKey = documentQueryKeyFromPath(pathname);

  const { data: teams } = useQuery<WorkspaceTeamRef[]>({
    queryKey: ['/api/teams'],
    enabled: false,
  });
  const { data: document } = useQuery<WikiPage>({
    queryKey: [documentKey ?? '/api/pages/none'],
    enabled: false,
  });

  return resolveWorkspaceScope(pathname, teams, documentKey ? document : null);
}

/** The current team workspace, or null when the route is personal or not workspace-scoped. */
export function useActiveWorkspace(): ActiveWorkspace | null {
  const scope = useWorkspaceScope();
  return scope.kind === 'team' ? scope.workspace : null;
}
