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
import { teamErrorText } from './messages';

interface Candidate {
  name: string;
  email: string;
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
  const [rowError, setRowError] = useState<{ email: string; text: string } | null>(null);
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
      setRowError(null);
    }
  }, [open]);

  const candidatesKey = ['/api/teams', teamId, 'member-candidates', term];
  const {
    data: candidates,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Candidate[]>({
    queryKey: candidatesKey,
    queryFn: () =>
      organizationRequest<Candidate[]>(
        `/api/teams/${teamId}/member-candidates${term ? `?q=${encodeURIComponent(term)}` : ''}`
      ),
    enabled: open,
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
      setRowError(null);
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
      setRowError({ email: candidate.email, text: teamErrorText(failure) });
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'member-candidates'] });
      // A refusal may mean the caller's own role changed: the members view asks again.
      onChanged();
    },
    onSettled: () => setAddingEmail(null),
  });

  const searching = term !== '';
  let body;
  if (isLoading) {
    body = (
      <p className="text-sm text-foreground-secondary" data-testid="team-candidates-loading">
        조직 구성원을 불러오는 중…
      </p>
    );
  } else if (isError || !candidates) {
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
  } else if (candidates.length === 0) {
    body = (
      <p className="text-sm text-foreground-secondary" data-testid="team-candidates-empty">
        {searching
          ? '검색 결과가 없습니다. 이름이나 이메일을 다시 확인하세요.'
          : '추가할 수 있는 조직 구성원이 없습니다. 조직의 모든 구성원이 이미 이 팀에 있습니다.'}
      </p>
    );
  } else {
    body = (
      <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {candidates.map((candidate) => (
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
            {rowError?.email === candidate.email ? (
              <p
                role="alert"
                className="w-full text-sm text-destructive"
                data-testid="team-candidate-error"
              >
                {rowError.text}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
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
          onChange={(event) => setSearch(event.target.value)}
          placeholder="이름 또는 이메일로 검색"
          aria-label="조직 구성원 검색"
          maxLength={100}
          data-testid="team-candidate-search"
        />
        {body}
      </DialogContent>
    </Dialog>
  );
}
