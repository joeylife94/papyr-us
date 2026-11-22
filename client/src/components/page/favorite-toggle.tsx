import { Star } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * The page header's star: adds the page to the caller's favourites or removes it, as
 * GET /api/favorites/check/:pageId says. A page the caller cannot list answers 404 to the add
 * (shown as an error, nothing changes); while the state is unknown the button is disabled.
 */
export function FavoriteToggle({ pageId, pageTitle }: { pageId: number; pageTitle: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const checkKey = [`/api/favorites/check/${pageId}`];
  const { data, isLoading } = useQuery<{ isFavorited: boolean }>({
    queryKey: checkKey,
    // The state is the caller's own and changes from other tabs; ask again on every page open
    staleTime: 0,
  });
  const favorited = data?.isFavorited === true;

  const toggle = useMutation({
    mutationFn: async (add: boolean) => {
      const response = await fetch(`/api/favorites/${pageId}`, {
        method: add ? 'POST' : 'DELETE',
        credentials: 'include',
      });
      // "Already a favourite" and "already removed" are the state the click asked for
      if (!response.ok && response.status !== 409 && !(response.status === 404 && !add)) {
        throw new Error(`${response.status}`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: checkKey });
      void queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });
    },
    onError: (_error, add) =>
      toast({
        title: add ? '즐겨찾기에 추가하지 못했습니다' : '즐겨찾기에서 제거하지 못했습니다',
        description: `"${pageTitle || '제목 없음'}" 문서의 즐겨찾기를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.`,
        variant: 'destructive',
      }),
  });

  const label = favorited ? '즐겨찾기에서 제거' : '즐겨찾기에 추가';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => toggle.mutate(!favorited)}
      disabled={isLoading || !data || toggle.isPending}
      title={label}
      aria-label={label}
      aria-pressed={favorited}
      data-testid="favorite-toggle"
      className={cn(favorited ? 'text-highlight' : 'text-muted-foreground hover:text-foreground')}
    >
      <Star className={cn('h-4 w-4', favorited && 'fill-current')} aria-hidden="true" />
    </Button>
  );
}
