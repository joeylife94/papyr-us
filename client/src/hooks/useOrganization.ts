import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { aiStateOf, type AiState } from '@/lib/ai-gate';

export { aiStateOf, type AiState };

export type OrganizationRole = 'owner' | 'admin' | 'member';

export interface CurrentOrganization {
  id: number;
  slug: string;
  name: string;
  role: OrganizationRole;
  /** The organization's AI switch. */
  aiEnabled: boolean;
  /** The caller's own AI grant; a missing field counts as not granted. */
  aiAllowed: boolean;
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
  /** The session ended (401): no organization data is shown, and nothing says "no organization". */
  isSignedOut: boolean;
  /** Why AI is or is not offered (see aiStateOf). The one place AI entry points read. */
  aiState: AiState;
  /** The organization has AI on and the caller has been granted it. */
  aiAvailable: boolean;
}

/** The organization request answered 401: the session is gone. */
class SignedOutError extends Error {}

/**
 * The signed-in account's own organization (GET /api/organization). Resolves to `null` for an
 * account that belongs to none (403). A 401, or no signed-in account at all, means signed out
 * (`isSignedOut`): no organization data, and screens must not say "no organization". Any other
 * failure is `isError`. Screens must not show "no organization" while `isLoading` or `isError`.
 * `aiState` / `aiAvailable` are the one rule for AI entry points (see aiStateOf in ai-gate.ts).
 * The key includes the user id, so switching accounts never shows the previous one's answer, and
 * the answer is asked again on every use (staleTime/gcTime 0) so a changed role or AI setting is
 * never shown stale.
 */
export function useOrganization(): UseOrganizationResult {
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const userId: number | undefined = user?.id;

  const { data, isLoading, isError, error } = useQuery<CurrentOrganization | null>({
    queryKey: ['/api/organization', userId],
    queryFn: async () => {
      const response = await fetch('/api/organization', { credentials: 'include' });
      if (response.status === 401) throw new SignedOutError();
      if (response.status === 403) return null;
      if (!response.ok) throw new Error('Failed to load organization');
      return response.json();
    },
    enabled: isAuthenticated && userId != null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const isSignedOut =
    (isError && error instanceof SignedOutError) || (!isAuthLoading && !isAuthenticated);
  const failed = isError && !isSignedOut;
  const organization = isError ? null : (data ?? null);
  const loading = isAuthLoading || isLoading;
  const aiState = aiStateOf({
    organization,
    isLoading: loading,
    isError: failed,
    signedOut: isSignedOut,
  });
  return {
    organization,
    isLoading: loading,
    isError: failed,
    isSignedOut,
    canManage: organization?.role === 'owner' || organization?.role === 'admin',
    aiState,
    aiAvailable: aiState === 'available',
  };
}
