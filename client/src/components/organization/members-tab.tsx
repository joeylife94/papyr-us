import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { aiAccessChange } from './ai-access-options';
import { allowedRoleOptions, canRemoveMember, type OrganizationRole } from './role-options';

interface OrganizationMember {
  userId: number;
  name: string;
  email: string;
  role: OrganizationRole;
  isActive: boolean;
  joinedAt: string;
  aiAllowed: boolean;
}

interface OwnerlessTeam {
  id: number;
  name: string;
  displayName: string;
}

interface Props {
  userId: number;
  callerRole: OrganizationRole;
  /** The organization's AI switch. Grants can be prepared while it is off. */
  organizationAiEnabled: boolean;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
}

export function MembersTab({ userId, callerRole, organizationAiEnabled }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [removing, setRemoving] = useState<OrganizationMember | null>(null);
  const [selfChange, setSelfChange] = useState<OrganizationRole | null>(null);
  const [ownerless, setOwnerless] = useState<{ member: string; teams: OwnerlessTeam[] } | null>(
    null
  );
  const membersKey = ['/api/organization/members', userId];

  const {
    data: members,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<OrganizationMember[]>({
    queryKey: membersKey,
    queryFn: () => organizationRequest<OrganizationMember[]>('/api/organization/members'),
    retry: false,
    // A 403 here means the caller's role is no longer what the page shows: the organization is
    // asked again below, and the page follows it, so a retry that can never work is not offered.
  });

  const refusedList = error instanceof OrganizationApiError && error.status === 403;
  useEffect(() => {
    if (refusedList) queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] });
  }, [refusedList, queryClient, userId]);

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
      if (target.userId === userId) {
        // The caller's own role changed: the page re-renders with the rights it now has. The
        // list is not asked again (a lowered caller would only get a refusal for it).
        queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] });
      } else {
        queryClient.invalidateQueries({ queryKey: membersKey });
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

  // True from the click until the answer is in: a quick second click is ignored at once, before
  // the pending state has been rendered.
  const aiRequestOpen = useRef(false);
  const aiMutation = useMutation({
    mutationFn: ({ target, aiAllowed }: { target: OrganizationMember; aiAllowed: boolean }) =>
      organizationRequest<{ userId: number; aiAllowed: boolean }>(
        `/api/organization/members/${target.userId}/ai`,
        { method: 'PATCH', body: { aiAllowed } }
      ),
    onSuccess: (result, { target, aiAllowed }) => {
      // Show the server's answer at once; the list is asked again as well.
      queryClient.setQueryData<OrganizationMember[]>(membersKey, (rows) =>
        rows?.map((row) =>
          row.userId === result.userId ? { ...row, aiAllowed: result.aiAllowed } : row
        )
      );
      queryClient.invalidateQueries({ queryKey: membersKey });
      // The caller's own grant changed: their AI entry points follow at once.
      if (target.userId === userId) {
        queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] });
      }
      toast({
        title: aiAllowed
          ? `${target.name} 님의 AI 사용을 허용했습니다`
          : `${target.name} 님의 AI 사용 허용을 해제했습니다`,
      });
    },
    onSettled: () => {
      aiRequestOpen.current = false;
    },
    onError: (error) => {
      // The switch goes back to what the server holds (the list is asked again).
      refreshAfterRefusal(error);
      toast({
        title: 'AI 사용 권한을 바꾸지 못했습니다',
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

  const activeOwnerCount = members.filter(
    (member) => member.role === 'owner' && member.isActive
  ).length;

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

      {!organizationAiEnabled ? (
        <p className="text-sm text-foreground-secondary" data-testid="ai-grants-org-off">
          조직의 AI 기능이 꺼져 있어 지금은 아무도 AI를 사용할 수 없습니다. 여기서 허용해 두면 설정
          탭에서 AI 기능을 켠 뒤부터 적용됩니다.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <Table data-testid="members-table">
          <TableHeader>
            <TableRow>
              <TableHead className="px-2 sm:px-4">구성원</TableHead>
              <TableHead className="px-2 sm:px-4">역할</TableHead>
              <TableHead className="hidden sm:table-cell">가입일</TableHead>
              <TableHead className="hidden sm:table-cell">상태</TableHead>
              <TableHead className="px-2 sm:px-4">AI</TableHead>
              <TableHead className="px-2 text-right sm:px-4">
                <span className="sr-only sm:not-sr-only">관리</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isSelf = member.userId === userId;
              const context = { activeOwnerCount, rowIsActive: member.isActive };
              const options = allowedRoleOptions(callerRole, member.role, isSelf, context);
              const removable = canRemoveMember(callerRole, member.role, isSelf, context);
              const aiChange = aiAccessChange(callerRole, member.role, isSelf, member.aiAllowed);
              return (
                <TableRow key={member.userId} data-testid={`member-row-${member.email}`}>
                  <TableCell className="min-w-0 max-w-[5.5rem] !px-2 sm:min-w-[12rem] sm:max-w-none sm:!px-4">
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
                  <TableCell className="!px-2 sm:!px-4">
                    {options.length > 0 ? (
                      <Select
                        value={member.role}
                        disabled={roleMutation.isPending}
                        onValueChange={(role) => {
                          if (role === member.role) return;
                          if (isSelf) {
                            // Your own role cannot be given back by you: ask first.
                            setSelfChange(role as OrganizationRole);
                          } else {
                            roleMutation.mutate({ target: member, role: role as OrganizationRole });
                          }
                        }}
                      >
                        <SelectTrigger
                          className="w-[5.5rem] sm:w-28"
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
                  <TableCell className="!px-2 sm:!px-4">
                    {aiChange ? (
                      <Switch
                        // The phone stylesheet gives every button a 44 px minimum: keep the switch a switch
                        className="min-h-0 min-w-0"
                        checked={member.aiAllowed}
                        disabled={aiMutation.isPending}
                        onCheckedChange={(checked) => {
                          if (aiRequestOpen.current) return;
                          aiRequestOpen.current = true;
                          aiMutation.mutate({ target: member, aiAllowed: checked });
                        }}
                        aria-label={`${member.name} 님의 AI 사용 허용`}
                        data-testid={`ai-switch-${member.email}`}
                      />
                    ) : (
                      <Badge
                        variant={member.aiAllowed ? 'outline' : 'secondary'}
                        data-testid={`ai-badge-${member.email}`}
                      >
                        {member.aiAllowed ? '허용' : '허용 안 함'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="!px-2 text-right sm:!px-4">
                    {removable ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-0"
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
        open={selfChange !== null}
        onOpenChange={(open) => (!open ? setSelfChange(null) : undefined)}
      >
        <AlertDialogContent data-testid="self-role-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              내 역할을 {selfChange ? ROLE_LABELS[selfChange] : ''}(으)로 낮출까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              역할을 낮추면 이 조직의 구성원과 설정을 더 이상 관리할 수 없게 되고, 직접 되돌릴 수도
              없습니다. 다시 올리려면 소유자가 역할을 바꿔 주어야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-self-role"
              onClick={() => {
                const me = members.find((member) => member.userId === userId);
                if (me && selfChange) roleMutation.mutate({ target: me, role: selfChange });
                setSelfChange(null);
              }}
            >
              낮추기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
