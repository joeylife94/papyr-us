import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { OrganizationApiError, organizationRequest } from '@/components/organization/api';
import { useToast } from '@/hooks/use-toast';
import { TEAM_CANDIDATE_LIMIT, TEAM_CANDIDATE_MIN_QUERY_LENGTH } from '@shared/team-members';
import { teamErrorText } from './messages';

interface Candidate {
  name: string;
  email: string;
}

interface CandidatesResponse {
  candidates: Candidate[];
  /** There are more matches than the candidates shown. */
  more: boolean;
}

interface Props {
  teamId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the server accepted an addition, and after a refusal that may mean a stale list. */
  onChanged: () => void;
}

/**
 * "Add member": organization members who are not in the team yet, searched by name or email. The
 * server lists only the team's own organization and decides the addition again; a refusal is
 * shown in words on the row it happened on.
 */
export function AddMemberDialog({ teamId, open, onOpenChange, onChanged }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  // The last refusal of an addition. It stays until the person acts again (a new search, another
  // addition, closing), even when the list refreshed and the row it concerned is gone.
  const [addError, setAddError] = useState<{ name: string; text: string } | null>(null);
  const [addingEmail, setAddingEmail] = useState<string | null>(null);

  // The search goes out once the person pauses typing.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setTerm('');
      setAddError(null);
    }
  }, [open]);

  const searching = [...term].length >= TEAM_CANDIDATE_MIN_QUERY_LENGTH;
  const candidatesKey = ['/api/teams', teamId, 'member-candidates', term];
  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CandidatesResponse>({
    queryKey: candidatesKey,
    queryFn: () =>
      organizationRequest<CandidatesResponse>(
        `/api/teams/${teamId}/member-candidates?q=${encodeURIComponent(term)}`
      ),
    enabled: open && searching,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const addMutation = useMutation({
    mutationFn: (candidate: Candidate) =>
      organizationRequest(`/api/teams/${teamId}/memberships`, {
        method: 'POST',
        body: { email: candidate.email },
      }),
    onMutate: (candidate) => {
      setAddingEmail(candidate.email);
      setAddError(null);
    },
    onSuccess: (_result, candidate) => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'member-candidates'] });
      onChanged();
      toast({
        title: '팀에 추가했습니다',
        description: `${candidate.name} 님이 팀 멤버가 되었습니다.`,
      });
    },
    onError: (failure, candidate) => {
      setAddError({ name: candidate.name, text: teamErrorText(failure) });
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'member-candidates'] });
      // A refusal may mean the caller's own role changed: the members view asks again.
      onChanged();
    },
    onSettled: () => setAddingEmail(null),
  });

  let body;
  if (!searching) {
    body = (
      <p className="text-sm text-foreground-secondary" data-testid="team-candidates-hint">
        이름이나 이메일을 {TEAM_CANDIDATE_MIN_QUERY_LENGTH}자 이상 입력하면 내 조직의 구성원을 찾아
        줍니다.
      </p>
    );
  } else if (isLoading) {
    body = (
      <p className="text-sm text-foreground-secondary" data-testid="team-candidates-loading">
        조직 구성원을 찾는 중…
      </p>
    );
  } else if (isError || !result) {
    const refused = error instanceof OrganizationApiError && error.status === 403;
    body = (
      <div className="space-y-2" data-testid="team-candidates-error">
        <p className="text-sm text-foreground-secondary">
          {refused ? teamErrorText(error) : '조직 구성원 목록을 불러오지 못했습니다.'}
        </p>
        {!refused ? (
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        ) : null}
      </div>
    );
  } else if (result.candidates.length === 0) {
    body = (
      <p className="text-sm text-foreground-secondary" data-testid="team-candidates-empty">
        검색 결과가 없습니다. 이미 팀에 있는 사람은 나오지 않습니다. 이름이나 이메일을 다시
        확인하세요.
      </p>
    );
  } else {
    body = (
      <div className="space-y-2">
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {result.candidates.map((candidate) => (
            <li
              key={candidate.email}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
              data-testid={`team-candidate-${candidate.email}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{candidate.name}</div>
                <div className="break-all text-xs text-foreground-secondary">{candidate.email}</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={addMutation.isPending}
                aria-label={`${candidate.name} 님을 팀에 추가`}
                data-testid={`team-candidate-add-${candidate.email}`}
                onClick={() => addMutation.mutate(candidate)}
              >
                {addingEmail === candidate.email ? '추가하는 중…' : '추가'}
              </Button>
            </li>
          ))}
        </ul>
        {result.more ? (
          <p className="text-sm text-foreground-secondary" data-testid="team-candidates-more">
            검색 결과가 더 있습니다. 처음 {TEAM_CANDIDATE_LIMIT}명만 보여 줍니다. 이름이나 이메일을
            더 길게 입력해 좁혀 보세요.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="add-member-dialog">
        <DialogHeader>
          <DialogTitle>팀 멤버 추가</DialogTitle>
          <DialogDescription>
            내 조직의 구성원 중에서 고릅니다. 추가된 사람은 이 팀의 문서에 접근할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setAddError(null);
          }}
          placeholder="이름 또는 이메일로 검색"
          aria-label="조직 구성원 검색"
          maxLength={100}
          // The term the typing pause has let through: what a search is (or is not) asked for
          data-settled-term={term}
          data-testid="team-candidate-search"
        />
        {addError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-raised p-3 text-sm text-destructive"
            data-testid="team-candidate-error"
          >
            {addError.name} 님을 추가하지 못했습니다. {addError.text}
          </p>
        ) : null}
        {body}
      </DialogContent>
    </Dialog>
  );
}
