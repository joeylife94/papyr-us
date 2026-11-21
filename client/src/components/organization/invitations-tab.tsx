import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { organizationErrorText } from './messages';
import {
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_CHOICES,
  INVITATION_ROLE_LABELS,
  INVITATION_STATUS_LABELS,
  canRevokeInvitation,
  deliveryText,
  invitableRoles,
  invitationLink,
  type InvitationDelivery,
  type InvitationRole,
  type InvitationStatus,
} from './invitation-options';
import type { OrganizationRole } from './role-options';

interface InvitationRow {
  id: number;
  email: string | null;
  role: InvitationRole;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  createdByName: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  revokedAt: string | null;
}

interface CreatedInvitation {
  invitation: InvitationRow;
  token: string;
  delivery: InvitationDelivery;
}

interface Props {
  userId: number;
  callerRole: OrganizationRole;
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invitations of the organization (issue #124 X1d): create, list with status, revoke. The link of
 * an invitation exists only in the answer that creates it (the server keeps a hash of the token,
 * never the token), so it is shown once, here; a pending invitation whose link was lost is
 * revoked and created again.
 */
export function InvitationsTab({ userId, callerRole }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const roles = invitableRoles(callerRole);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitationRole>('member');
  const [days, setDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; delivery: InvitationDelivery } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const listKey = ['/api/organization/invitations', userId];

  const {
    data: invitations,
    isLoading,
    isError,
    refetch,
  } = useQuery<InvitationRow[]>({
    queryKey: listKey,
    queryFn: () => organizationRequest<InvitationRow[]>('/api/organization/invitations'),
    retry: false,
  });

  const refreshAfterRefusal = (error: unknown) => {
    queryClient.invalidateQueries({ queryKey: listKey });
    if (error instanceof OrganizationApiError && (error.status === 403 || error.status === 401)) {
      queryClient.invalidateQueries({ queryKey: ['/api/organization', userId] });
    }
  };

  const createMutation = useMutation({
    mutationFn: (body: { email: string | null; role: InvitationRole; expiresInDays: number }) =>
      organizationRequest<CreatedInvitation>('/api/organization/invitations', {
        method: 'POST',
        body,
      }),
    onSuccess: (result) => {
      setCreated({
        link: invitationLink(window.location.origin, result.token),
        delivery: result.delivery,
      });
      setCopied(false);
      setEmail('');
      queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (error) => {
      refreshAfterRefusal(error);
      toast({
        title: '초대를 만들지 못했습니다',
        description: organizationErrorText(error),
        variant: 'destructive',
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (target: InvitationRow) =>
      organizationRequest<{ revoked: boolean }>(`/api/organization/invitations/${target.id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      toast({
        title: '초대를 취소했습니다',
        description: '이 링크로는 더 이상 가입할 수 없습니다.',
      });
    },
    onError: (error) => {
      refreshAfterRefusal(error);
      toast({
        title: '초대를 취소하지 못했습니다',
        description: organizationErrorText(error),
        variant: 'destructive',
      });
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed !== '' && !EMAIL_SHAPE.test(trimmed)) {
      setEmailError('이메일 형식이 올바르지 않습니다.');
      return;
    }
    setEmailError(null);
    setCreated(null);
    createMutation.mutate({
      email: trimmed === '' ? null : trimmed,
      role,
      expiresInDays: days,
    });
  };

  const copyLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      // The link is also selectable in the field above.
      toast({ title: '복사하지 못했습니다', description: '링크를 직접 선택해 복사하세요.' });
    }
  };

  return (
    <div className="space-y-6" data-testid="invitations-tab">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-md border border-border p-4"
        data-testid="invitation-form"
        noValidate
      >
        <div>
          <h2 className="text-base font-semibold text-foreground">새 초대</h2>
          <p className="text-sm text-foreground-secondary">
            이메일을 적으면 그 주소로 안내를 보내고, 그 주소의 계정만 수락할 수 있습니다. 비워 두면
            링크를 가진 한 사람이 쓸 수 있습니다. 새 구성원은 AI 사용 권한 없이 시작합니다.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
          <div className="space-y-1.5">
            <Label htmlFor="invitation-email">이메일 (선택)</Label>
            <Input
              id="invitation-email"
              type="email"
              value={email}
              maxLength={255}
              placeholder="name@example.com"
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError !== null}
              aria-describedby={emailError ? 'invitation-email-error' : undefined}
              data-testid="invitation-email"
            />
            {emailError ? (
              <p id="invitation-email-error" className="text-sm text-destructive" role="alert">
                {emailError}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invitation-role">역할</Label>
            <Select value={role} onValueChange={(value) => setRole(value as InvitationRole)}>
              <SelectTrigger id="invitation-role" data-testid="invitation-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((option) => (
                  <SelectItem key={option} value={option}>
                    {INVITATION_ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invitation-days">유효 기간</Label>
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger id="invitation-days" data-testid="invitation-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_CHOICES.map((choice) => (
                  <SelectItem key={choice} value={String(choice)}>
                    {choice}일
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={createMutation.isPending} data-testid="invitation-create">
          {createMutation.isPending ? '만드는 중…' : '초대 링크 만들기'}
        </Button>
      </form>

      {created ? (
        <div
          className="space-y-3 rounded-md border border-border bg-raised p-4"
          role="status"
          data-testid="invitation-created"
        >
          <p className="text-sm font-medium text-foreground" data-testid="invitation-delivery">
            {deliveryText(created.delivery)}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={created.link}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="초대 링크"
              className="font-mono text-xs"
              data-testid="invitation-link"
            />
            <Button
              type="button"
              variant="outline"
              onClick={copyLink}
              className="shrink-0"
              data-testid="invitation-copy"
            >
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? '복사했습니다' : '링크 복사'}
            </Button>
          </div>
          <p className="text-xs text-foreground-secondary">
            이 링크는 지금 한 번만 보여 드립니다. 서버에는 링크가 저장되지 않아 나중에 다시 볼 수
            없습니다. 잃어버렸다면 초대를 취소하고 새로 만드세요.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">초대 목록</h2>
        {isLoading ? (
          <p className="text-foreground-secondary" data-testid="invitations-loading">
            초대를 불러오는 중…
          </p>
        ) : isError || !invitations ? (
          <div className="flex flex-wrap items-center gap-3" data-testid="invitations-error">
            <p className="text-foreground-secondary">초대 목록을 불러오지 못했습니다.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              다시 시도
            </Button>
          </div>
        ) : invitations.length === 0 ? (
          <p className="text-sm text-foreground-secondary" data-testid="invitations-empty">
            아직 만든 초대가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table data-testid="invitations-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 sm:px-4">대상</TableHead>
                  <TableHead className="px-2 sm:px-4">역할</TableHead>
                  <TableHead className="px-2 sm:px-4">상태</TableHead>
                  <TableHead className="hidden sm:table-cell">만료일</TableHead>
                  <TableHead className="px-2 text-right sm:px-4">
                    <span className="sr-only sm:not-sr-only">관리</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((row) => (
                  <TableRow key={row.id} data-testid={`invitation-row-${row.id}`}>
                    <TableCell className="min-w-0 max-w-[8rem] !px-2 sm:max-w-none sm:!px-4">
                      <div className="break-all font-medium text-foreground">
                        {row.email ?? '링크를 가진 한 사람'}
                      </div>
                      {row.createdByName ? (
                        <div className="text-xs text-foreground-secondary">
                          {row.createdByName} 님이 만듦 · {formatDate(row.createdAt)}
                        </div>
                      ) : null}
                      {row.status === 'accepted' && row.acceptedByName ? (
                        <div className="text-xs text-foreground-secondary">
                          {row.acceptedByName} 님이 수락
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="!px-2 sm:!px-4">
                      <Badge variant={row.role === 'admin' ? 'default' : 'secondary'}>
                        {INVITATION_ROLE_LABELS[row.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="!px-2 sm:!px-4">
                      <Badge
                        variant={row.status === 'pending' ? 'outline' : 'secondary'}
                        data-testid={`invitation-status-${row.id}`}
                      >
                        {INVITATION_STATUS_LABELS[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {formatDate(row.expiresAt)}
                    </TableCell>
                    <TableCell className="!px-2 text-right sm:!px-4">
                      {canRevokeInvitation(callerRole, row.role, row.status) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-w-0"
                          disabled={revokeMutation.isPending}
                          aria-label={`${row.email ?? '링크 초대'} 초대 취소`}
                          onClick={() => revokeMutation.mutate(row)}
                          data-testid={`invitation-revoke-${row.id}`}
                        >
                          취소
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
