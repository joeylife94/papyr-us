import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { documentQueryKeyFromPath, type WorkspaceTeamRef } from '@/lib/active-workspace';
import { resolveCurrentPageScope, type CurrentPageScope } from '@/lib/page-scope';
import type { WikiPage } from '@shared/schema';

/**
 * The scope the quick switcher and daily notes act in (see `resolveCurrentPageScope`). Loads the
 * membership-scoped team list when needed (team ids are required to create in a team) and reads
 * the open document from the cache only, like `useWorkspaceScope`.
 */
export function useCurrentPageScope(): CurrentPageScope {
  const { pathname } = useLocation();
  const { flags } = useFeatureFlags();
  const documentKey = documentQueryKeyFromPath(pathname);

  const teams = useQuery<WorkspaceTeamRef[]>({
    queryKey: ['/api/teams'],
    enabled: flags.FEATURE_TEAMS,
  });
  const document = useQuery<WikiPage>({
    queryKey: [documentKey ?? '/api/pages/none'],
    enabled: false,
  });

  return resolveCurrentPageScope({
    pathname,
    teams: teams.data,
    teamsSettled: !flags.FEATURE_TEAMS || teams.isSuccess || teams.isError,
    document: documentKey ? document.data : undefined,
    documentSettled: !documentKey || document.isSuccess || document.isError,
  });
}
