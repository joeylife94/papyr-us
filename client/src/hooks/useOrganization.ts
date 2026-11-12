import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

export type OrganizationRole = 'owner' | 'admin' | 'member';

export interface CurrentOrganization {
  id: number;
  slug: string;
  name: string;
  role: OrganizationRole;
  aiEnabled: boolean;
}

export interface UseOrganizationResult {
  /** The caller's organization; null for a caller without one, while loading, and on error. */
  organization: CurrentOrganization | null;
  /** True while authentication or the organization request is still loading. */
  isLoading: boolean;
  /** True when the request failed for a reason other than 401/403 (which mean "none"). */
  isError: boolean;
  /** Owner or admin of the organization. */
  canManage: boolean;
}

/**
 * The signed-in account's own organization (GET /api/organization). Resolves to `null` for an
 * account that belongs to none (or is signed out); a 401/403 is that answer, any other failure
 * is `isError`. Screens must not show "no organization" while `isLoading` or `isError`.
 * The key includes the user id, so switching accounts never shows the previous one's answer, and
 * the answer is asked again on every use (staleTime/gcTime 0) so a changed role or AI setting is
 * never shown stale.
 */
export function useOrganization(): UseOrganizationResult {
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const userId: number | undefined = user?.id;

  const { data, isLoading, isError } = useQuery<CurrentOrganization | null>({
    queryKey: ['/api/organization', userId],
    queryFn: async () => {
      const response = await fetch('/api/organization', { credentials: 'include' });
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new Error('Failed to load organization');
      return response.json();
    },
    enabled: isAuthenticated && userId != null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const organization = isError ? null : (data ?? null);
  return {
    organization,
    isLoading: isAuthLoading || isLoading,
    isError,
    canManage: organization?.role === 'owner' || organization?.role === 'admin',
  };
}
