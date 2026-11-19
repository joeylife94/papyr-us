import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, UserMinus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { OrganizationApiError, organizationRequest } from '@/components/organization/api';
import { useToast } from '@/hooks/use-toast';
import { AddMemberDialog } from './add-member-dialog';
import { teamErrorText, TEAM_ROLE_LABELS } from './messages';
import {
  allowedTeamRoleOptions,
  canAddTeamMember,
  canLeaveTeam,
  canRemoveTeamMember,
  type TeamRole,
} from './role-options';

interface TeamMemberRow {
  userId: number;
  name: string;
  email: string;
  role: TeamRole;
  isActive: boolean;
  joinedAt: string;
}

interface TeamMembersResponse {
  teamId: number;
  /** The caller's own role in the team (a roster-only member counts as 'member'). */
  myRole: TeamRole;
  members: TeamMemberRow[];
}

interface Props {
  teamId: number;
  teamName: string;
  teamDisplayName: string;
  userId: number;
}

/**
 * The people whose membership gives access to a team's pages. Owners and admins manage them;
 * everyone else sees the list and can leave. The server decides every change again under the
 * team lock; what is offered here follows the same rules (./role-options.ts).
 */
export function TeamMembersView({ teamId, teamName, teamDisplayName, userId }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamMemberRow | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [selfChange, setSelfChange] = useState<TeamRole | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const membersKey = ['/api/teams', teamId, 'members', userId];

  const { data, isLoading, isError, error, refetch } = useQuery<TeamMembersResponse>({
    queryKey: membersKey,
    queryFn: () => organizationRequest<TeamMembersResponse>(`/api/teams/${teamId}/members`),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: membersKey });

  // A refusal may mean the caller's own rights changed: the list is asked again.
  const onFailure = (failure: unknown) => {
    setActionError(teamErrorText(failure));
    refresh();
  };

  const roleMutation = useMutation({
    mutationFn: ({ target, role }: { target: TeamMemberRow; role: TeamRole }) =>
      organizationRequest<{ userId: number; role: TeamRole }>(
        `/api/teams/${teamId}/memberships/${target.userId}`,
        { method: 'PATCH', body: { role } }
      ),
    onMutate: () => setActionError(null),
    onSuccess: (_result, { target, role }) => {
      refresh();
      toast({
        title: '역할을 바꿨습니다',
        description: `${target.name} 님의 역할: ${TEAM_ROLE_LABELS[role]}`,
      });
    },
    onError: onFailure,
  });

  const removeMutation = useMutation({
    mutationFn: (target: TeamMemberRow) =>
      organizationRequest<unknown>(`/api/teams/${teamId}/memberships/${target.userId}`, {
        method: 'DELETE',
      }),
    onMutate: () => setActionError(null),
    onSuccess: (_result, target) => {
      setRemoving(null);
      refresh();
      toast({
        title: '멤버를 내보냈습니다',
        description: `${target.name} 님은 더 이상 이 팀의 문서에 접근할 수 없습니다.`,
      });
    },
    onError: (failure) => {
      setRemoving(null);
      onFailure(failure);
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () =>
      organizationRequest<unknown>(`/api/teams/${teamId}/memberships/me`, { method: 'DELETE' }),
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setLeaving(false);
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      toast({ title: '팀에서 나갔습니다', description: `${teamDisplayName} 팀에서 나왔습니다.` });
      navigate('/');
    },
    onError: (failure) => {
      setLeaving(false);
      onFailure(failure);
    },
  });

  if (isLoading) {
    return (
      <p className="text-foreground-secondary" data-testid="team-members-loading">
        팀 멤버를 불러오는 중…
      </p>
    );
  }
  if (isError || !data) {
    const notMember = error instanceof OrganizationApiError && error.status === 403;
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="team-members-error">
        <p className="text-foreground-secondary">
          {notMember ? teamErrorText(error) : '팀 멤버 목록을 불러오지 못했습니다.'}
        </p>
        {!notMember ? (
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        ) : null}
      </div>
    );
  }

  const { members } = data;
  const callerRole = data.myRole;
  const me = members.find((member) => member.userId === userId);
  const activeOwnerCount = members.filter(
    (member) => member.role === 'owner' && member.isActive
  ).length;
  const canManage = canAddTeamMember(callerRole);
  // Leaving needs a row of the caller's own: a roster-only member has none.
  const showLeave = !!me && canLeaveTeam(me.role, { activeOwnerCount, rowIsActive: true });
  const lastOwnerHint = !!me && me.role === 'owner' && !showLeave;

  return (
    <div className="space-y-4" data-testid="team-members">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground-secondary" data-testid="team-members-role-line">
          {canManage
            ? `내 역할: ${TEAM_ROLE_LABELS[callerRole]}. 멤버를 추가하고 역할을 바꾸거나 내보낼 수 있습니다.`
            : '팀 멤버 목록입니다. 멤버 관리는 팀 소유자와 관리자가 합니다.'}
        </p>
        {canManage ? (
          <Button onClick={() => setAdding(true)} data-testid="team-add-member">
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            멤버 추가
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-raised p-3 text-sm text-destructive"
          data-testid="team-members-action-error"
        >
          {actionError}
        </p>
      ) : null}

      {members.length === 0 ? (
        <p className="text-foreground-secondary" data-testid="team-members-empty">
          이 팀에는 아직 멤버가 없습니다.
        </p>
      ) : (
        <ul
          className="divide-y divide-border rounded-md border border-border"
          data-testid="team-members-list"
        >
          {members.map((member) => {
            const isSelf = member.userId === userId;
            const context = { activeOwnerCount, rowIsActive: member.isActive };
            const options = allowedTeamRoleOptions(callerRole, member.role, isSelf, context);
            const removable = canRemoveTeamMember(callerRole, member.role, isSelf, context);
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3"
                data-testid={`team-member-row-${member.email}`}
              >
                <div className="min-w-0 flex-1 basis-40">
                  <div className="font-medium text-foreground">
                    <span className="break-words">{member.name}</span>
                    {isSelf ? (
                      <span className="ml-2 text-xs font-normal text-foreground-secondary">
                        (나)
                      </span>
                    ) : null}
                    {!member.isActive ? (
                      <Badge variant="secondary" className="ml-2">
                        비활성
                      </Badge>
                    ) : null}
                  </div>
                  <div className="break-all text-xs text-foreground-secondary">{member.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {options.length > 0 ? (
                    <Select
                      value={member.role}
                      disabled={roleMutation.isPending}
                      onValueChange={(role) => {
                        if (role === member.role) return;
                        if (isSelf) {
                          // Your own role cannot be given back by you: ask first.
                          setSelfChange(role as TeamRole);
                        } else {
                          roleMutation.mutate({ target: member, role: role as TeamRole });
                        }
                      }}
                    >
                      <SelectTrigger
                        className="w-28"
                        aria-label={`${member.name} 님의 역할`}
                        data-testid={`team-role-select-${member.email}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((role) => (
                          <SelectItem key={role} value={role}>
                            {TEAM_ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant={member.role === 'member' ? 'secondary' : 'default'}
                      data-testid={`team-role-badge-${member.email}`}
                    >
                      {TEAM_ROLE_LABELS[member.role]}
                    </Badge>
                  )}
                  {removable ? (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`${member.name} 님을 팀에서 내보내기`}
                      onClick={() => setRemoving(member)}
                      data-testid={`team-remove-${member.email}`}
                    >
                      <UserMinus className="h-4 w-4 sm:hidden" aria-hidden="true" />
                      <span className="hidden sm:inline">내보내기</span>
                    </Button>
                  ) : null}
                  {isSelf && showLeave ? (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="이 팀에서 나가기"
                      onClick={() => setLeaving(true)}
                      data-testid="team-leave"
                    >
                      <LogOut className="h-4 w-4 sm:hidden" aria-hidden="true" />
                      <span className="hidden sm:inline">팀 나가기</span>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lastOwnerHint ? (
        <p className="text-sm text-foreground-secondary" data-testid="team-last-owner-hint">
          내가 이 팀의 마지막 소유자라서 나갈 수 없습니다. 먼저 다른 멤버를 소유자로 지정하세요.
        </p>
      ) : null}

      <p className="text-sm text-foreground-secondary">
        이 목록은 팀 문서에 접근할 수 있는 사람입니다. 연락처와 역할을 적어 두는{' '}
        <Link
          to={`/teams/${encodeURIComponent(teamName)}/members`}
          className="underline underline-offset-2 hover:text-foreground"
        >
          디렉터리
        </Link>
        와는 별개입니다.
      </p>

      {canManage ? (
        <AddMemberDialog
          teamId={teamId}
          open={adding}
          onOpenChange={setAdding}
          onChanged={refresh}
        />
      ) : null}

      <AlertDialog
        open={selfChange !== null}
        onOpenChange={(open) => (!open ? setSelfChange(null) : undefined)}
      >
        <AlertDialogContent data-testid="team-self-role-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              내 역할을 {selfChange ? TEAM_ROLE_LABELS[selfChange] : ''}(으)로 낮출까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              역할을 낮추면 이 팀의 멤버를 더 이상 관리할 수 없게 되고, 직접 되돌릴 수도 없습니다.
              다시 올리려면 팀 소유자가 역할을 바꿔 주어야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              data-testid="team-confirm-self-role"
              onClick={() => {
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
        <AlertDialogContent data-testid="team-remove-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.name} 님을 팀에서 내보낼까요?</AlertDialogTitle>
            <AlertDialogDescription>
              조직의 구성원으로는 그대로 남지만, 이 팀의 문서에는 더 이상 접근할 수 없게 됩니다.
              나중에 다시 추가할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeMutation.isPending}
              data-testid="team-confirm-remove"
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

      <AlertDialog
        open={leaving}
        onOpenChange={(open) => (!open && !leaveMutation.isPending ? setLeaving(false) : undefined)}
      >
        <AlertDialogContent data-testid="team-leave-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{teamDisplayName} 팀에서 나갈까요?</AlertDialogTitle>
            <AlertDialogDescription>
              나가면 이 팀의 문서에 더 이상 접근할 수 없습니다. 다시 들어오려면 팀 소유자나 관리자가
              추가해 주어야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaveMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={leaveMutation.isPending}
              data-testid="team-confirm-leave"
              onClick={(event) => {
                event.preventDefault();
                leaveMutation.mutate();
              }}
            >
              {leaveMutation.isPending ? '나가는 중…' : '나가기'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
