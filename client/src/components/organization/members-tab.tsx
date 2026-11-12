import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { OrganizationApiError, organizationRequest } from './api';
import { organizationErrorText, ROLE_LABELS } from './messages';
import { allowedRoleOptions, canRemoveMember, type OrganizationRole } from './role-options';

interface OrganizationMember {
  userId: number;
  name: string;
  email: string;
  role: OrganizationRole;
  isActive: boolean;
  joinedAt: string;
}

interface OwnerlessTeam {
  id: number;
  name: string;
  displayName: string;
}

interface Props {
  userId: number;
  callerRole: OrganizationRole;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
}

export function MembersTab({ userId, callerRole }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [removing, setRemoving] = useState<OrganizationMember | null>(null);
  const [ownerless, setOwnerless] = useState<{ member: string; teams: OwnerlessTeam[] } | null>(
    null
  );
  const membersKey = ['/api/organization/members', userId];

  const {
    data: members,
    isLoading,
    isError,
    refetch,
  } = useQuery<OrganizationMember[]>({
    queryKey: membersKey,
    queryFn: () => organizationRequest<OrganizationMember[]>('/api/organization/members'),
    retry: false,
  });

  // A refusal may mean the caller's own rights changed: ask for the organization again too.
  const refreshAfterRefusal = (error: unknown) => {
    queryClient.invalidateQueries({ queryKey: membersKey });
    if (error instanceof OrganizationApiError && (error.status === 403 || error.status === 401)) {
      queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] });
    }
  };

  const roleMutation = useMutation({
    mutationFn: ({ target, role }: { target: OrganizationMember; role: OrganizationRole }) =>
      organizationRequest<{ userId: number; role: OrganizationRole }>(
        `/api/organization/members/${target.userId}`,
        { method: 'PATCH', body: { role } }
      ),
    onSuccess: (_result, { target, role }) => {
      queryClient.invalidateQueries({ queryKey: membersKey });
      if (target.userId === userId) {
        // The caller's own role changed: the page re-renders with the rights it now has.
        queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] });
      }
      toast({
        title: '역할을 바꿨습니다',
        description: `${target.name} 님의 역할: ${ROLE_LABELS[role]}`,
      });
    },
    onError: (error) => {
      refreshAfterRefusal(error);
      toast({
        title: '역할을 바꾸지 못했습니다',
        description: organizationErrorText(error),
        variant: 'destructive',
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (target: OrganizationMember) =>
      organizationRequest<{ removed: boolean; teamsLeftWithoutOwner: OwnerlessTeam[] }>(
        `/api/organization/members/${target.userId}`,
        { method: 'DELETE' }
      ),
    onSuccess: (result, target) => {
      setRemoving(null);
      queryClient.invalidateQueries({ queryKey: membersKey });
      queryClient.invalidateQueries({ queryKey: ['/api/organization/teams', userId] });
      const teams = result.teamsLeftWithoutOwner ?? [];
      setOwnerless(teams.length > 0 ? { member: target.name, teams } : null);
      toast({
        title: '구성원을 내보냈습니다',
        description: `${target.name} 님은 로그인할 수 있지만 이 조직의 문서와 팀에는 더 이상 접근할 수 없습니다.`,
      });
    },
    onError: (error) => {
      setRemoving(null);
      refreshAfterRefusal(error);
      toast({
        title: '구성원을 내보내지 못했습니다',
        description: organizationErrorText(error),
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <p className="text-foreground-secondary" data-testid="members-loading">
        구성원을 불러오는 중…
      </p>
    );
  }
  if (isError || !members) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="members-error">
        <p className="text-foreground-secondary">구성원 목록을 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ownerless ? (
        <div
          className="rounded-md border border-border bg-raised p-4 text-sm"
          role="status"
          data-testid="ownerless-teams"
        >
          <p className="font-medium text-foreground">
            {ownerless.member} 님을 내보내면서 소유자가 없는 팀이 생겼습니다.
          </p>
          <p className="text-foreground-secondary">이 팀들은 이제 소유자가 없습니다:</p>
          <ul className="mt-1 list-disc pl-5 text-foreground">
            {ownerless.teams.map((team) => (
              <li key={team.id}>
                {team.displayName} <span className="text-foreground-secondary">({team.name})</span>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setOwnerless(null)}>
            닫기
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <Table data-testid="members-table">
          <TableHeader>
            <TableRow>
              <TableHead className="px-2 sm:px-4">구성원</TableHead>
              <TableHead className="px-2 sm:px-4">역할</TableHead>
              <TableHead className="hidden sm:table-cell">가입일</TableHead>
              <TableHead className="hidden sm:table-cell">상태</TableHead>
              <TableHead className="px-2 text-right sm:px-4">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isSelf = member.userId === userId;
              const options = allowedRoleOptions(callerRole, member.role, isSelf);
              const removable = canRemoveMember(callerRole, member.role, isSelf);
              return (
                <TableRow key={member.userId} data-testid={`member-row-${member.email}`}>
                  <TableCell className="min-w-0 max-w-[8.5rem] px-2 sm:min-w-[12rem] sm:max-w-none sm:px-4">
                    <div className="font-medium text-foreground">
                      {member.name}
                      {isSelf ? (
                        <span className="ml-2 text-xs font-normal text-foreground-secondary">
                          (나)
                        </span>
                      ) : null}
                    </div>
                    <div className="break-all text-xs text-foreground-secondary">
                      {member.email}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 sm:px-4">
                    {options.length > 0 ? (
                      <Select
                        value={member.role}
                        disabled={roleMutation.isPending}
                        onValueChange={(role) => {
                          if (role !== member.role) {
                            roleMutation.mutate({ target: member, role: role as OrganizationRole });
                          }
                        }}
                      >
                        <SelectTrigger
                          className="w-24 sm:w-28"
                          aria-label={`${member.name} 님의 역할`}
                          data-testid={`role-select-${member.email}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant={member.role === 'member' ? 'secondary' : 'default'}
                        data-testid={`role-badge-${member.email}`}
                      >
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap sm:table-cell">
                    {formatDate(member.joinedAt)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={member.isActive ? 'outline' : 'secondary'}>
                      {member.isActive ? '활성' : '비활성'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 text-right sm:px-4">
                    {removable ? (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`${member.name} 님을 조직에서 내보내기`}
                        onClick={() => setRemoving(member)}
                        data-testid={`remove-member-${member.email}`}
                      >
                        <UserMinus className="h-4 w-4 sm:hidden" />
                        <span className="hidden sm:inline">내보내기</span>
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) =>
          !open && !removeMutation.isPending ? setRemoving(null) : undefined
        }
      >
        <AlertDialogContent data-testid="remove-member-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.name} 님을 조직에서 내보낼까요?</AlertDialogTitle>
            <AlertDialogDescription>
              계정과 로그인은 그대로 남지만, 이 조직의 문서와 팀에는 더 이상 접근할 수 없게 됩니다.
              팀 멤버십과 문서 개별 권한도 함께 사라집니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeMutation.isPending}
              data-testid="confirm-remove-member"
              onClick={(event) => {
                // Keep the dialog open until the server has answered.
                event.preventDefault();
                if (removing) removeMutation.mutate(removing);
              }}
            >
              {removeMutation.isPending ? '내보내는 중…' : '내보내기'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
