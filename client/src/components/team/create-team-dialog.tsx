import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { TEAM_DISPLAY_NAME_MAX_LENGTH } from '@shared/team-members';
import { createTeamErrorText } from './messages';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a navigation caused by the dialog (closes the mobile drawer). */
  onNavigate?: () => void;
}

/**
 * "New team": any member of an organization may create one inside their own organization and
 * becomes its owner. The server decides (POST /api/teams); a refusal is shown here in words.
 */
export function CreateTeamDialog({ open, onOpenChange, onNavigate }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // True from the click until the answer is in, so a quick second click sends nothing.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) {
      setDisplayName('');
      setDescription('');
      setError(null);
    }
  }, [open]);

  const trimmed = displayName.trim();

  const submit = async () => {
    if (inFlight.current) return;
    if (!trimmed) {
      setError('팀 이름을 입력하세요.');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      let response: Response;
      try {
        response = await fetch('/api/teams', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: trimmed,
            ...(description.trim() ? { description: description.trim() } : {}),
          }),
        });
      } catch {
        setError(createTeamErrorText(0));
        return;
      }
      if (!response.ok) {
        setError(createTeamErrorText(response.status));
        return;
      }
      const team = (await response.json()) as { name: string; displayName: string };
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      toast({
        title: '팀을 만들었습니다',
        description: `${team.displayName} 팀의 소유자가 되었습니다.`,
      });
      onOpenChange(false);
      navigate(`/teams/${encodeURIComponent(team.name)}/team-members`);
      onNavigate?.();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!submitting ? onOpenChange(next) : undefined)}>
      <DialogContent className="max-w-md" data-testid="create-team-dialog">
        <DialogHeader>
          <DialogTitle>새 팀 만들기</DialogTitle>
          <DialogDescription>
            내 조직 안에 팀을 만듭니다. 만든 사람이 팀의 소유자가 되고, 멤버는 나중에 추가할 수
            있습니다.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="create-team-name">팀 이름</Label>
            <Input
              id="create-team-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={TEAM_DISPLAY_NAME_MAX_LENGTH}
              autoComplete="off"
              data-testid="create-team-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-team-description">설명 (선택)</Label>
            <Input
              id="create-team-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
              autoComplete="off"
              data-testid="create-team-description"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive" data-testid="create-team-error">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={submitting} data-testid="create-team-submit">
              {submitting ? '만드는 중…' : '팀 만들기'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
