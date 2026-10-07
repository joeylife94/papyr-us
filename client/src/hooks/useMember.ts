import { useQuery } from '@tanstack/react-query';

export interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  teamId?: number | null;
  avatarUrl?: string | null;
}

export function useMemberByEmail(email?: string, enabledOverride?: boolean) {
  return useQuery<Member | undefined>({
    queryKey: ['member-by-email', email],
    enabled: enabledOverride ?? !!email,
    queryFn: async () => {
      const res = await fetch(`/api/members/email/${encodeURIComponent(email!)}`);
      // Authentication users and legacy members do not have a one-to-one mapping.
      // The header only needs a notification recipient when the signed-in identity
      // can access a matching member record; absence or a protected legacy record
      // is not an application error on this optional feature path.
      if (res.status === 404 || res.status === 403) return undefined;
      if (!res.ok) throw new Error('Failed to fetch member by email');
      return res.json();
    },
    staleTime: 60_000,
  });
}
