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
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error('Failed to fetch member by email');
      return res.json();
    },
    staleTime: 60_000,
  });
}
