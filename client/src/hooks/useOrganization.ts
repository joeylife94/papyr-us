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

/**
 * The signed-in account's own organization (GET /api/organization). Resolves to `null` for an
 * account that belongs to none (or is signed out); only a failure other than 401/403 is an error.
 * The key includes the user id, so switching accounts never shows the previous one's answer.
 */
export function useOrganization() {
  const { isAuthenticated, user } = useAuth();
  const userId: number | undefined = user?.id;

  const { data, isLoading } = useQuery<CurrentOrganization | null>({
    queryKey: ['/api/organization', userId],
    queryFn: async () => {
      const response = await fetch('/api/organization', { credentials: 'include' });
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new Error('Failed to load organization');
      return response.json();
    },
    enabled: isAuthenticated && userId != null,
    retry: false,
  });

  const organization = data ?? null;
  return {
    organization,
    isLoading,
    canManage: organization?.role === 'owner' || organization?.role === 'admin',
  };
}
