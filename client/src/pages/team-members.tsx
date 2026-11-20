import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { TeamMembersView } from '@/components/team/team-members-view';

interface TeamSummary {
  id: number;
  name: string;
  displayName: string;
}

/**
 * "Team members" of a team in the workspace: the people whose membership gives access to the
 * team's pages. Not the directory at /teams/:teamName/members, which lists contact rows that
 * grant nothing.
 */
export default function TeamMembersPage({ teamName }: { teamName?: string }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId: number | undefined = user?.id;
  const queryClient = useQueryClient();
  const teamsKey = ['/api/teams', 'for-members-page', userId];

  const {
    data: teams,
    isLoading,
    isError,
  } = useQuery<TeamSummary[]>({
    queryKey: teamsKey,
    queryFn: async () => {
      const response = await fetch('/api/teams', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load teams');
      return response.json();
    },
    enabled: isAuthenticated && userId != null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const team = teams?.find((candidate) => candidate.name === teamName);

  let body;
  if (authLoading || isLoading) {
    body = (
      <p className="text-foreground-secondary" data-testid="team-page-loading">
        팀 정보를 불러오는 중…
      </p>
    );
  } else if (isError) {
    body = (
      <Card className="max-w-xl" data-testid="team-page-error">
        <CardHeader>
          <CardTitle className="text-lg">팀 정보를 불러오지 못했습니다</CardTitle>
        </CardHeader>
        <CardContent className="text-foreground-secondary">
          <p className="mb-3">잠시 후 다시 시도하세요.</p>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: teamsKey })}
          >
            다시 시도
          </Button>
        </CardContent>
      </Card>
    );
  } else if (!team || userId == null) {
    body = (
      <Card className="max-w-xl" data-testid="team-page-not-found">
        <CardHeader>
          <CardTitle className="text-lg">팀을 찾을 수 없습니다</CardTitle>
        </CardHeader>
        <CardContent className="text-foreground-secondary">
          <p className="mb-3">
            없는 팀이거나, 이 계정이 멤버로 들어 있지 않은 팀입니다. 팀 소유자나 관리자에게 추가를
            요청하세요.
          </p>
          <Button variant="outline" asChild>
            <Link to="/">홈으로</Link>
          </Button>
        </CardContent>
      </Card>
    );
  } else {
    body = (
      <TeamMembersView
        teamId={team.id}
        teamName={team.name}
        teamDisplayName={team.displayName}
        userId={userId}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1
        className="flex min-w-0 items-center gap-3 text-2xl font-bold text-foreground sm:text-3xl"
        data-testid="team-members-heading"
      >
        <Users className="h-7 w-7 shrink-0 text-highlight" aria-hidden="true" />
        <span className="break-words">{team ? `${team.displayName} 팀 멤버` : '팀 멤버'}</span>
      </h1>
      {body}
    </div>
  );
}
