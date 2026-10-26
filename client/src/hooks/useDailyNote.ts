import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useCurrentPageScope } from '@/hooks/usePageScope';
import { focusPageBodyWhenReady } from '@/lib/page-open';
import { invalidatePageLists } from '@/lib/queryClient';
import { localDateString } from '@shared/daily-notes';

const FAILURE_MESSAGES: Record<string, string> = {
  daily_note_trashed: '오늘의 노트가 휴지통에 있습니다. 휴지통에서 복원해 주세요.',
  daily_note_unavailable: '오늘의 노트 주소를 다른 문서가 사용하고 있어 열 수 없습니다.',
};

/**
 * "오늘의 노트" (#111): open today's note of the current scope, creating it on first use. The
 * server finds or creates it under a deterministic slug, so repeated or concurrent opens land on
 * the same page.
 */
export function useOpenDailyNote() {
  const scope = useCurrentPageScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const openDailyNote = useCallback(async () => {
    if (inFlight.current) return;
    if (scope.status !== 'ready') {
      toast({ title: '워크스페이스를 불러오는 중입니다', description: '잠시 후 다시 시도하세요.' });
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const res = await fetch('/api/pages/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: localDateString(),
          ...(scope.teamId !== null ? { teamId: scope.teamId } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.page?.slug) {
        toast({
          title: '오늘의 노트를 열지 못했습니다',
          description:
            FAILURE_MESSAGES[body?.code] ??
            (res.status === 403
              ? '이 워크스페이스에 접근할 수 없습니다.'
              : '잠시 후 다시 시도하세요.'),
          variant: 'destructive',
        });
        return;
      }
      if (body.created) void invalidatePageLists(queryClient);
      const path = `/page/${encodeURIComponent(body.page.slug)}`;
      navigate(path);
      focusPageBodyWhenReady(path);
    } catch {
      toast({
        title: '오늘의 노트를 열지 못했습니다',
        description: '네트워크 연결을 확인하세요.',
        variant: 'destructive',
      });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [scope, navigate, queryClient, toast]);

  return { openDailyNote, pending, ready: scope.status === 'ready', scope };
}
