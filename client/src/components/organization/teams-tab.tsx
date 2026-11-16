import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrganizationApiError, organizationRequest } from './api';

interface OrganizationTeam {
  id: number;
  name: string;
  displayName: string;
  isActive: boolean;
  memberCount: number;
  ownerCount: number;
}

export function TeamsTab({ userId }: { userId: number }) {
  const queryClient = useQueryClient();
  const {
    data: teams,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<OrganizationTeam[]>({
    queryKey: ['/api/organization/teams', userId],
    queryFn: () => organizationRequest<OrganizationTeam[]>('/api/organization/teams'),
    retry: false,
  });

  // A 403 means the caller's role is no longer what the page shows: ask for the organization
  // again so the page follows the real role instead of offering a retry that cannot work.
  const refused = error instanceof OrganizationApiError && error.status === 403;
  useEffect(() => {
    if (refused) queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] });
  }, [refused, queryClient, userId]);

  if (isLoading) {
    return (
      <p className="text-foreground-secondary" data-testid="teams-loading">
        팀을 불러오는 중…
      </p>
    );
  }
  if (isError || !teams) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="teams-error">
        <p className="text-foreground-secondary">팀 목록을 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-secondary">
        이 조직의 모든 팀입니다. 소유자가 없는 팀은 표시됩니다.
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table data-testid="teams-table">
          <TableHeader>
            <TableRow>
              <TableHead className="px-2 sm:px-4">팀</TableHead>
              <TableHead className="whitespace-nowrap px-2 text-right sm:px-4">구성원</TableHead>
              <TableHead className="whitespace-nowrap px-2 text-right sm:px-4">소유자</TableHead>
              <TableHead className="hidden sm:table-cell">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-foreground-secondary">
                  아직 팀이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              teams.map((team) => (
                <TableRow key={team.id} data-testid={`team-row-${team.name}`}>
                  <TableCell className="min-w-0 px-2 sm:min-w-[10rem] sm:px-4">
                    <div className="font-medium text-foreground">{team.displayName}</div>
                    <div className="break-all text-xs text-foreground-secondary">{team.name}</div>
                  </TableCell>
                  <TableCell className="px-2 text-right sm:px-4">{team.memberCount}</TableCell>
                  <TableCell className="px-2 text-right sm:px-4">
                    {team.ownerCount === 0 ? (
                      <Badge variant="destructive" data-testid={`team-ownerless-${team.name}`}>
                        소유자 없음
                      </Badge>
                    ) : (
                      team.ownerCount
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={team.isActive ? 'outline' : 'secondary'}>
                      {team.isActive ? '활성' : '비활성'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
