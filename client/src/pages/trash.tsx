import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageIcon } from '@/components/page/page-icon';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { invalidatePageLists } from '@/lib/queryClient';
import { resolvePageTeamId } from '@/lib/page-team-scope';
import { PERSONAL_SCOPE_LABEL } from '@/lib/page-scope';
import {
  emptiedMessage,
  emptyTrashScopeText,
  failureMessage,
  restoredMessage,
  type TrashAction,
} from '@/lib/trash-screen';

/** GET /api/trash: the trashed pages the caller may list, without bodies. */
interface TrashRow {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  author: string;
  teamId: number | null;
  deletedAt: string;
  /** The caller holds the owner right that restore and delete forever need. */
  canRestore?: boolean;
}

interface TeamRef {
  id: number | string;
  name: string;
  displayName?: string | null;
}

class TrashRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super(`trash request ${status}`);
  }
}

async function trashRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new TrashRequestError(response.status, body);
  return body as T;
}

const statusOf = (error: unknown) => (error instanceof TrashRequestError ? error.status : 0);
const bodyOf = (error: unknown) => (error instanceof TrashRequestError ? error.body : null);

/**
 * The trash screen: the trashed pages the caller may list (GET /api/trash; with a team workspace
 * selected, that team's, by its numeric id). "복원" and "영구 삭제" are offered only on rows the
 * server marks `canRestore` (the caller is the page's owner); a refusal is always shown. Platform
 * admins also get "휴지통 비우기".
 */
export default function TrashPage() {
  const { teamName } = useParams<{ teamName?: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId: number | undefined = user?.id;
  const { flags } = useFeatureFlags();

  // The team list is the sidebar's (membership-scoped); a team name resolves to an id only there.
  const teamsQuery = useQuery<TeamRef[]>({
    queryKey: ['/api/teams'],
    enabled: flags.FEATURE_TEAMS,
    queryFn: async () => {
      const response = await fetch('/api/teams');
      return response.ok ? response.json() : [];
    },
  });
  const teams = teamsQuery.data ?? [];
  const teamId = teamName ? resolvePageTeamId(teamName, teams) : '';
  const teamLabel = teamName
    ? (teams.find((team) => team.name === teamName)?.displayName ?? teamName)
    : null;
  const teamsPending = !!teamName && teamsQuery.isLoading;
  // A team route whose team is not one of the caller's: nothing is asked for it (fail closed)
  const teamUnknown = !!teamName && !teamsPending && teamId === '';
  const scopeQuery = teamId === '' ? '' : `?teamId=${teamId}`;

  const trash = useQuery<TrashRow[]>({
    queryKey: ['/api/trash', teamId === '' ? 'all' : teamId],
    queryFn: () => trashRequest<TrashRow[]>(`/api/trash${scopeQuery}`),
    enabled: !teamsPending && !teamUnknown,
    // Pages are trashed from everywhere: ask again whenever the screen opens
    staleTime: 0,
  });

  // Whether the caller is a platform admin (the admin screen's own check; 403 and a disabled
  // admin area both mean "no")
  const adminSession = useQuery<{ admin: boolean }>({
    queryKey: ['/api/admin/session', userId],
    queryFn: async () => {
      const response = await fetch('/api/admin/session', { credentials: 'include' });
      return response.ok ? response.json() : { admin: false };
    },
    enabled: userId != null && flags.FEATURE_ADMIN,
    staleTime: 0,
    gcTime: 0,
  });
  const isPlatformAdmin = adminSession.data?.admin === true;

  const [notice, setNotice] = useState<{ text: string; href: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TrashRow | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // The count in the empty-trash dialog is the list as read when the dialog opened
  const [emptyCheck, setEmptyCheck] = useState<
    { state: 'checking' } | { state: 'failed' } | { state: 'ready'; count: number }
  >({ state: 'checking' });

  const refresh = () => {
    void invalidatePageLists(queryClient);
  };
  const fail = (action: TrashAction, error: unknown) => {
    const status = statusOf(error);
    setFailure(failureMessage(action, status, bodyOf(error)));
    // A page that is no longer in the trash, or no longer ours: show the list as it is now
    if (status === 404 || status === 403) refresh();
  };

  const restore = useMutation({
    mutationFn: (row: TrashRow) =>
      trashRequest<{ slug?: string; restoredCount?: number }>(`/api/trash/${row.id}/restore`, {
        method: 'POST',
      }),
    onMutate: () => {
      setFailure(null);
      setNotice(null);
    },
    onSuccess: (restored, row) => {
      const text = restoredMessage(row.title || '제목 없음', restored.restoredCount);
      setNotice({ text, href: `/page/${restored.slug ?? row.slug}` });
      toast({ title: '문서 복원됨', description: text });
      refresh();
    },
    onError: (error) => fail('restore', error),
  });

  const remove = useMutation({
    mutationFn: (row: TrashRow) =>
      trashRequest<unknown>(`/api/trash/${row.id}`, { method: 'DELETE' }),
    onMutate: () => {
      setFailure(null);
      setNotice(null);
    },
    onSuccess: (_result, row) => {
      toast({
        title: '영구 삭제됨',
        description: `"${row.title || '제목 없음'}" 문서를 영구 삭제했습니다.`,
      });
      refresh();
    },
    onError: (error) => fail('delete', error),
    onSettled: () => setConfirmDelete(null),
  });

  const empty = useMutation({
    mutationFn: () =>
      trashRequest<{ message: string }>(`/api/trash${scopeQuery}`, { method: 'DELETE' }),
    onMutate: () => {
      setFailure(null);
      setNotice(null);
    },
    onSuccess: (result) => {
      toast({ title: '휴지통을 비웠습니다', description: emptiedMessage(result.message) });
      refresh();
    },
    onError: (error) => fail('empty', error),
    onSettled: () => setConfirmEmpty(false),
  });

  const rows = trash.data ?? [];
  // Opening the dialog reads the team's list again; deleting is possible only after that read
  // succeeded, and the dialog counts what it returned.
  const openEmptyDialog = () => {
    setEmptyCheck({ state: 'checking' });
    setConfirmEmpty(true);
    void trash
      .refetch()
      .then((result) =>
        setEmptyCheck(
          result.isSuccess && result.data
            ? { state: 'ready', count: result.data.length }
            : { state: 'failed' }
        )
      );
  };
  const busy = restore.isPending || remove.isPending || empty.isPending;
  const scopeLabel = teamLabel ?? '모든 문서';

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0" data-testid="trash-screen">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Trash2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            휴지통
          </h1>
          <p className="mt-1 text-sm text-foreground-secondary">
            {teamLabel
              ? `"${teamLabel}" 팀에서 삭제된 문서입니다. `
              : '내가 볼 수 있는 삭제된 문서입니다. '}
            문서 소유자는 복원하거나 영구 삭제할 수 있습니다.
          </p>
        </div>
        {isPlatformAdmin && teamId !== '' && teamLabel && trash.isSuccess && rows.length > 0 && (
          <Button
            variant="outline"
            onClick={openEmptyDialog}
            disabled={busy}
            data-testid="empty-trash"
            className="text-destructive"
          >
            휴지통 비우기
          </Button>
        )}
      </header>

      {notice && (
        <div
          role="status"
          data-testid="trash-notice"
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-raised px-3 py-2 text-sm text-foreground"
        >
          <span className="min-w-0 break-words">{notice.text}</span>
          <Link to={notice.href} className="font-semibold text-highlight underline">
            복원한 문서 열기
          </Link>
        </div>
      )}
      {failure && (
        <div
          role="alert"
          data-testid="trash-failure"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{failure}</span>
        </div>
      )}

      {teamUnknown ? (
        <p role="alert" className="text-sm text-destructive">
          이 워크스페이스의 휴지통을 볼 수 없습니다.
        </p>
      ) : trash.isError ? (
        <div role="alert" className="space-y-3 text-sm text-destructive" data-testid="trash-error">
          <p>
            {statusOf(trash.error) === 403
              ? '이 워크스페이스의 휴지통을 볼 수 없습니다.'
              : `휴지통을 불러오지 못했습니다 (오류 ${statusOf(trash.error)}).`}
          </p>
          <Button variant="outline" size="sm" onClick={() => void trash.refetch()}>
            다시 시도
          </Button>
        </div>
      ) : teamsPending || trash.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
          data-testid="trash-empty"
        >
          휴지통이 비어 있습니다. 삭제한 문서가 여기에 표시됩니다.
        </p>
      ) : (
        <ul
          aria-label={`${scopeLabel} 휴지통`}
          className="divide-y divide-border rounded-md border border-border"
        >
          {rows.map((row) => {
            const team = row.teamId == null ? null : teams.find((t) => Number(t.id) === row.teamId);
            const where =
              row.teamId == null
                ? PERSONAL_SCOPE_LABEL
                : (team?.displayName ?? team?.name ?? '팀 문서');
            return (
              <li
                key={row.id}
                data-testid="trash-row"
                data-page-id={row.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-3"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                    <PageIcon icon={row.icon} />
                    <span className="truncate" data-testid="trash-row-title">
                      {row.title || '제목 없음'}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span data-testid="trash-row-team">{where}</span>
                    <span className="truncate">작성자 {row.author}</span>
                    <span>
                      {formatDistanceToNow(new Date(row.deletedAt), {
                        addSuffix: true,
                        locale: ko,
                      })}{' '}
                      삭제됨
                    </span>
                  </p>
                </div>
                {row.canRestore === true ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => restore.mutate(row)}
                      aria-label={`${row.title || '제목 없음'} 복원`}
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      복원
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirmDelete(row)}
                      aria-label={`${row.title || '제목 없음'} 영구 삭제`}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      영구 삭제
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground" data-testid="trash-row-readonly">
                    문서 소유자만 복원할 수 있습니다
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent data-testid="trash-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              "{confirmDelete?.title || '제목 없음'}" 문서를 영구 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              영구 삭제한 문서는 복구할 수 없으며, 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => confirmDelete && remove.mutate(confirmDelete)}
              data-testid="trash-delete-confirm"
            >
              영구 삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialogContent data-testid="trash-empty-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>휴지통을 비울까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {emptyCheck.state === 'ready'
                ? `${emptyTrashScopeText(teamLabel ?? '', emptyCheck.count)} 이 작업은 되돌릴 수 없습니다.`
                : emptyCheck.state === 'checking'
                  ? '삭제할 문서를 확인하는 중입니다…'
                  : null}
            </AlertDialogDescription>
            {emptyCheck.state === 'failed' && (
              <p role="alert" className="text-sm text-destructive">
                휴지통 목록을 불러오지 못해 삭제할 수 없습니다. 닫고 다시 시도해 주세요.
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={empty.isPending || emptyCheck.state !== 'ready' || emptyCheck.count === 0}
              onClick={() => empty.mutate()}
              data-testid="trash-empty-confirm"
            >
              휴지통 비우기
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
