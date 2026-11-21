import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { organizationRequest } from '@/components/organization/api';
import { useToast } from '@/hooks/use-toast';
import {
  SHARE_CANDIDATE_LIMIT,
  SHARE_CANDIDATE_MIN_QUERY_LENGTH,
  SHARE_GRANT_LEVELS,
  type PageSharingResponse,
} from '@shared/page-sharing';
import { shareErrorText } from './permission-labels';
import {
  LEVEL_DESCRIPTIONS,
  LEVEL_LABELS,
  baselineText,
  canRemoveRow,
  dialogMode,
  entryLabel,
  entryNote,
  publicControl,
  rowControl,
  selectedLevel,
  type PageLevel,
} from './share-state';
import { sharingKey } from './use-page-sharing';

interface Props {
  pageId: number;
  pageTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PageSharingResponse;
}

interface CandidatesResponse {
  people: Array<{ userId: number; name: string; email: string }>;
  teams: Array<{ teamId: number; name: string }>;
  morePeople: boolean;
  moreTeams: boolean;
}

type GrantLevel = (typeof SHARE_GRANT_LEVELS)[number];
const selectClass =
  'rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

function LevelSelect({
  value,
  onChange,
  label,
  disabled,
  testId,
  options = SHARE_GRANT_LEVELS,
}: {
  value: string;
  onChange: (level: GrantLevel) => void;
  label: string;
  disabled?: boolean;
  testId?: string;
  options?: readonly GrantLevel[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as GrantLevel)}
      aria-label={label}
      disabled={disabled}
      className={selectClass}
      data-testid={testId}
    >
      {options.map((level) => (
        <option key={level} value={level}>
          {LEVEL_LABELS[level]}
        </option>
      ))}
    </select>
  );
}

/**
 * The page's sharing. An owner manages it: who has access, adding people and teams of the page's
 * organization, public access and share links. Anyone else who can read the page sees the names
 * and levels, nothing more. The server decides every change again; a refusal is shown in words.
 */
export function PageShareDialog({ pageId, pageTitle, open, onOpenChange, data }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
        data-testid="page-share-dialog"
      >
        <DialogHeader>
          <DialogTitle className="break-words">
            {dialogMode(data) === 'manage' ? '문서 공유' : '이 문서에 접근할 수 있는 사람'}
          </DialogTitle>
          <DialogDescription className="break-words">
            {dialogMode(data) === 'manage'
              ? `'${pageTitle}'에 접근할 수 있는 사람과 팀을 정합니다.`
              : `'${pageTitle}' 문서의 접근 권한입니다. 문서 소유자만 바꿀 수 있습니다.`}
          </DialogDescription>
        </DialogHeader>
        {dialogMode(data) === 'manage' ? (
          <ManageSharing pageId={pageId} data={data} open={open} />
        ) : (
          <ReadOnlyAccess data={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyAccess({ data }: { data: PageSharingResponse }) {
  return (
    <div className="space-y-4" data-testid="share-readonly">
      <p className="text-sm text-foreground-secondary">{baselineText(data.baseline)}</p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {data.entries.length === 0 ? (
          <li className="px-3 py-2 text-sm text-foreground-secondary">
            따로 권한을 받은 사람이나 팀이 없습니다.
          </li>
        ) : (
          data.entries.map((entry, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-3 px-3 py-2"
              data-testid="share-readonly-entry"
            >
              <span className="min-w-0 truncate">
                {entry.entityType === 'team' ? (
                  <Users className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
                ) : null}
                {entryLabel(entry)}
                {entry.isYou ? <span className="text-foreground-secondary"> (나)</span> : null}
              </span>
              <Badge variant="outline">{LEVEL_LABELS[entry.permission]}</Badge>
            </li>
          ))
        )}
      </ul>
      {data.publicAccess ? (
        <p className="text-sm text-foreground-secondary" data-testid="share-readonly-public">
          조직 밖의 누구나 이 문서를{' '}
          {data.publicAccess.level === 'commenter' ? '보고 댓글을 달' : '볼'} 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}

function ManageSharing({
  pageId,
  data,
  open,
}: {
  pageId: number;
  data: PageSharingResponse;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [newLevel, setNewLevel] = useState<GrantLevel>('viewer');
  const [password, setPassword] = useState('');
  const [expires, setExpires] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: sharingKey(pageId) });

  const searching = [...term].length >= SHARE_CANDIDATE_MIN_QUERY_LENGTH;
  const candidatesQuery = useQuery<CandidatesResponse>({
    queryKey: ['/api/pages', pageId, 'share-candidates', term],
    queryFn: () =>
      organizationRequest<CandidatesResponse>(
        `/api/pages/${pageId}/share-candidates?q=${encodeURIComponent(term)}`
      ),
    enabled: open && searching,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const change = useMutation({
    mutationFn: (request: { path: string; method: string; body?: unknown }) =>
      organizationRequest(request.path, { method: request.method, body: request.body }),
    onMutate: () => setError(null),
    onError: (failure) => setError(shareErrorText(failure)),
    onSettled: () => {
      refresh();
    },
  });

  const grant = (entityType: 'user' | 'team', entityId: number, permission: GrantLevel) =>
    change.mutate({
      path: `/api/pages/${pageId}/permissions`,
      method: 'POST',
      body: { entityType, entityId, permission },
    });
  const removeGrant = (grantId: number) =>
    change.mutate({ path: `/api/pages/${pageId}/permissions/${grantId}`, method: 'DELETE' });
  const setPublic = (level: 'off' | 'viewer' | 'commenter') => {
    if (level === 'off') {
      if (data.publicAccess?.grantId !== undefined) removeGrant(data.publicAccess.grantId);
      return;
    }
    change.mutate({
      path: `/api/pages/${pageId}/permissions`,
      method: 'POST',
      body: { entityType: 'public', permission: level },
    });
  };

  const createLink = useMutation({
    mutationFn: () =>
      organizationRequest(`/api/pages/${pageId}/share`, {
        method: 'POST',
        body: {
          permission: 'viewer',
          password: password || undefined,
          expiresAt: expires ? new Date(expires).toISOString() : undefined,
        },
      }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setPassword('');
      setExpires('');
      toast({ title: '공유 링크를 만들었습니다' });
    },
    onError: (failure) => setError(shareErrorText(failure)),
    onSettled: () => {
      refresh();
    },
  });
  const revokeLink = (token: string) =>
    change.mutate({
      path: `/api/pages/${pageId}/share/${encodeURIComponent(token)}`,
      method: 'DELETE',
    });

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
      toast({ title: '링크를 복사했습니다' });
    } catch {
      toast({ title: '링크를 복사하지 못했습니다', variant: 'destructive' });
    }
  };

  const busy = change.isPending;
  const hasEntry = (entityType: 'user' | 'team', entityId: number) =>
    data.entries.some((entry) => entry.entityType === entityType && entry.entityId === entityId);
  const publicState = publicControl(data.publicAccess);
  const candidates = candidatesQuery.data;

  return (
    <div className="space-y-6" data-testid="share-manage">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-raised p-3 text-sm text-destructive"
          data-testid="share-error"
        >
          {error}
        </p>
      ) : null}

      <section className="space-y-2" aria-labelledby="share-access-heading">
        <h3 id="share-access-heading" className="font-semibold">
          접근할 수 있는 사람
        </h3>
        <p className="text-sm text-foreground-secondary" data-testid="share-baseline">
          {baselineText(data.baseline)}
        </p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.entries.map((entry) => {
            const label = entryLabel(entry);
            const control = rowControl(entry);
            const note = entryNote(entry);
            return (
              <li
                key={entry.grantId ?? label}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
                data-testid={`share-entry-${label}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">
                    {entry.entityType === 'team' ? (
                      <Users className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
                    ) : null}
                    {label}
                    {entry.isYou ? <span className="text-foreground-secondary"> (나)</span> : null}
                  </div>
                  {entry.email ? (
                    <div className="break-all text-xs text-foreground-secondary">{entry.email}</div>
                  ) : null}
                  {note ? (
                    <div className="text-xs text-destructive" data-testid="share-entry-note">
                      {note}
                    </div>
                  ) : null}
                </div>
                {control === 'fixed' ? (
                  <Badge variant="outline">{LEVEL_LABELS[entry.permission]}</Badge>
                ) : (
                  <LevelSelect
                    value={selectedLevel(entry)}
                    label={`${label}의 권한`}
                    disabled={busy || control === 'former'}
                    testId={`share-level-${label}`}
                    onChange={(level) =>
                      entry.entityId !== undefined && grant(entry.entityType, entry.entityId, level)
                    }
                  />
                )}
                {canRemoveRow(entry) ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy || entry.grantId === undefined}
                    aria-label={`${label}의 접근 제거`}
                    data-testid={`share-remove-${label}`}
                    onClick={() => entry.grantId !== undefined && removeGrant(entry.grantId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2" aria-labelledby="share-add-heading">
        <h3 id="share-add-heading" className="font-semibold">
          사람이나 팀 추가
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="이름 또는 이메일로 검색"
            aria-label="조직 구성원과 팀 검색"
            maxLength={100}
            className="min-w-0 flex-1"
            data-settled-term={term}
            data-testid="share-search"
          />
          <LevelSelect
            value={newLevel}
            onChange={setNewLevel}
            label="추가할 권한"
            testId="share-new-level"
          />
        </div>
        {!searching ? (
          <p className="text-sm text-foreground-secondary" data-testid="share-search-hint">
            이름이나 이메일을 {SHARE_CANDIDATE_MIN_QUERY_LENGTH}자 이상 입력하면 내 조직의 구성원과
            팀을 찾아 줍니다. 다른 조직의 사람은 추가할 수 없습니다.
          </p>
        ) : candidatesQuery.isLoading ? (
          <p className="text-sm text-foreground-secondary">찾는 중…</p>
        ) : candidatesQuery.isError || !candidates ? (
          <p className="text-sm text-foreground-secondary" data-testid="share-search-error">
            {shareErrorText(candidatesQuery.error)}
          </p>
        ) : candidates.people.length === 0 && candidates.teams.length === 0 ? (
          <p className="text-sm text-foreground-secondary" data-testid="share-search-empty">
            검색 결과가 없습니다. 이름이나 이메일을 다시 확인하세요.
          </p>
        ) : (
          <div className="space-y-2">
            <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {candidates.people.map((person) => (
                <li
                  key={`u${person.userId}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                  data-testid={`share-candidate-${person.email}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">{person.name}</div>
                    <div className="break-all text-xs text-foreground-secondary">
                      {person.email}
                    </div>
                  </div>
                  {hasEntry('user', person.userId) ? (
                    <span className="text-sm text-foreground-secondary">이미 있음</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      aria-label={`${person.name} 님을 추가`}
                      data-testid={`share-add-${person.email}`}
                      onClick={() => grant('user', person.userId, newLevel)}
                    >
                      추가
                    </Button>
                  )}
                </li>
              ))}
              {candidates.teams.map((team) => (
                <li
                  key={`t${team.teamId}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                  data-testid={`share-candidate-team-${team.name}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">
                      <Users className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
                      {team.name}
                    </div>
                    <div className="text-xs text-foreground-secondary">팀 전체</div>
                  </div>
                  {hasEntry('team', team.teamId) ? (
                    <span className="text-sm text-foreground-secondary">이미 있음</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      aria-label={`${team.name} 팀을 추가`}
                      data-testid={`share-add-team-${team.name}`}
                      onClick={() => grant('team', team.teamId, newLevel)}
                    >
                      추가
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {candidates.morePeople || candidates.moreTeams ? (
              <p className="text-sm text-foreground-secondary" data-testid="share-search-more">
                검색 결과가 더 있습니다. 처음 {SHARE_CANDIDATE_LIMIT}개만 보여 줍니다. 더 길게
                입력해 좁혀 보세요.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="share-public-heading">
        <h3 id="share-public-heading" className="font-semibold">
          공개 접근
        </h3>
        <p className="text-sm text-foreground-secondary">
          켜면 조직 밖의 누구나 이 문서를 열어볼 수 있습니다. 공개 접근으로는 편집할 수 없고,
          댓글까지만 허용할 수 있습니다.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={publicState.value}
            onChange={(event) => setPublic(event.target.value as 'off' | 'viewer' | 'commenter')}
            aria-label="공개 접근"
            disabled={busy}
            className={selectClass}
            data-testid="share-public-level"
          >
            <option value="off">사용 안 함</option>
            <option value="viewer">누구나 보기</option>
            <option value="commenter">누구나 보기와 댓글</option>
          </select>
          {publicState.cappedNote ? (
            <span className="text-sm text-foreground-secondary" data-testid="share-public-capped">
              {publicState.cappedNote}
            </span>
          ) : null}
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="share-links-heading">
        <h3 id="share-links-heading" className="font-semibold">
          공유 링크
        </h3>
        <p className="text-sm text-foreground-secondary">
          링크를 아는 사람은 로그인 없이 문서를 읽기 전용으로 볼 수 있습니다. 비밀번호와 만료일을
          정할 수 있습니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="share-link-password">비밀번호 (선택)</Label>
            <Input
              id="share-link-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비워 두면 없음"
              data-testid="share-link-password"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="share-link-expires">만료일 (선택)</Label>
            <Input
              id="share-link-expires"
              type="datetime-local"
              value={expires}
              onChange={(event) => setExpires(event.target.value)}
              data-testid="share-link-expires"
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={createLink.isPending}
          onClick={() => createLink.mutate()}
          data-testid="share-link-create"
        >
          <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
          공유 링크 만들기
        </Button>
        <ul className="space-y-2" data-testid="share-links">
          {(data.links ?? []).length === 0 ? (
            <li className="text-sm text-foreground-secondary" data-testid="share-links-empty">
              만든 공유 링크가 없습니다.
            </li>
          ) : (
            (data.links ?? []).map((link) => (
              <li
                key={link.token}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2"
                data-testid="share-link"
                data-token={link.token}
              >
                <div className="min-w-0 flex-1">
                  <code className="block truncate text-sm">/share/{link.token}</code>
                  <div className="text-xs text-foreground-secondary">
                    조회 {link.accessCount}회{link.hasPassword ? ' · 비밀번호 있음' : ''}
                    {link.expiresAt
                      ? ` · ${new Date(link.expiresAt).toLocaleString()}까지`
                      : ' · 만료 없음'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="링크 복사"
                  onClick={() => copyLink(link.token)}
                  data-testid="share-link-copy"
                >
                  {copiedToken === link.token ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label="링크 취소"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => revokeLink(link.token)}
                  data-testid="share-link-revoke"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))
          )}
        </ul>
      </section>
      <p className="text-xs text-foreground-secondary">
        {(['owner', 'editor', 'commenter', 'viewer'] as PageLevel[])
          .map((level) => `${LEVEL_LABELS[level]}: ${LEVEL_DESCRIPTIONS[level]}`)
          .join(' ')}
      </p>
    </div>
  );
}
