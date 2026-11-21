import { useQuery } from '@tanstack/react-query';

export type SignupMode = 'open' | 'invite_only' | 'closed';

/**
 * How this deployment lets people sign up (GET /api/auth/signup-policy, SIGNUP_MODE). `mode` is
 * null until the answer is in, and stays null when it cannot be read: the screens then show
 * the form as before, and the server's answer to the sign-up decides.
 */
export function useSignupPolicy(): { mode: SignupMode | null; isLoading: boolean } {
  const { data, isLoading } = useQuery<SignupMode | null>({
    queryKey: ['/api/auth/signup-policy'],
    queryFn: async () => {
      const response = await fetch('/api/auth/signup-policy', { credentials: 'include' });
      if (!response.ok) return null;
      const body = await response.json();
      return body?.mode === 'open' || body?.mode === 'invite_only' || body?.mode === 'closed'
        ? body.mode
        : null;
    },
    retry: false,
    staleTime: 60_000,
  });
  return { mode: data ?? null, isLoading };
}
