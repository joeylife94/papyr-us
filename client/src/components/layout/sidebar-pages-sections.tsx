import { Link, useLocation } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { PageIcon } from '@/components/page/page-icon';
import { useAuth } from '@/hooks/useAuth';
import { useRecentPages } from '@/hooks/useRecentPages';
import { sortFavorites } from '@/lib/trash-screen';

const sectionLabel = 'px-2.5 pb-1.5 font-mono text-[11px] uppercase text-muted-foreground';
const rowLink =
  'flex min-h-[34px] items-center gap-2 rounded-md px-2.5 text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** GET /api/favorites: only live pages the caller may list (trashed or unreadable ones are absent). */
interface FavoriteRow {
  id: number;
  pageId: number;
  createdAt: string;
  pageTitle: string;
  pageSlug: string;
}

/** GET /api/pages/:id/link-preview */
type PreviewAnswer =
  | { id: number; accessible: false }
  | { id: number; accessible: true; title: string; slug: string; icon?: string | null };

/** "즐겨찾기": the caller's favourites, newest first, each linking to its page. */
export function FavoritesSection({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery<FavoriteRow[]>({
    queryKey: ['/api/favorites'],
    enabled: user?.id != null,
  });
  const rows = sortFavorites(data ?? []);

  return (
    <nav aria-label="즐겨찾기" className="flex flex-col" data-testid="sidebar-favorites">
      <h3 className={sectionLabel}>즐겨찾기</h3>
      {isError ? (
        <p role="alert" className="px-2.5 text-xs text-destructive">
          즐겨찾기를 불러오지 못했습니다.
        </p>
      ) : isLoading ? (
        <div className="h-8 animate-pulse rounded-md bg-raised" aria-hidden="true" />
      ) : rows.length === 0 ? (
        <p className="px-2.5 text-xs text-muted-foreground" data-testid="favorites-empty">
          즐겨찾기한 문서가 없습니다. 문서 상단의 별을 눌러 추가하세요.
        </p>
      ) : (
        rows.map((row) => {
          const href = `/page/${row.pageSlug}`;
          return (
            <Link
              key={row.id}
              to={href}
              onClick={onNavigate}
              aria-current={pathname === href ? 'page' : undefined}
              className={cn(
                rowLink,
                pathname === href
                  ? 'bg-raised font-semibold text-foreground'
                  : 'text-foreground-secondary hover:bg-raised hover:text-foreground'
              )}
            >
              <span className="truncate">{row.pageTitle || '제목 없음'}</span>
            </Link>
          );
        })
      )}
    </nav>
  );
}

/**
 * "최근 문서": the pages this account opened last in its organization (a localStorage list of ids,
 * see lib/recent-pages.ts). An entry is shown only once the server confirms the account can still
 * read the page, with the server's current title and address. A page the server answers as
 * unreadable, trashed or missing (accessible: false, 403, 404) is hidden but stays stored, so a
 * restored page reappears; the cap of 10 evicts the oldest.
 */
export function RecentSection({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { entries } = useRecentPages();
  const previews = useQueries({
    queries: entries.map((entry) => ({
      queryKey: [`/api/pages/${entry.id}/link-preview`],
      // Asked again whenever the sidebar mounts or the page lists are invalidated, so a page the
      // account lost access to is noticed
      staleTime: 0,
    })),
  });

  const verdicts = previews.map((query, index) => {
    const answer = query.data as PreviewAnswer | undefined;
    return {
      entry: entries[index],
      // Not confirmed (inaccessible, trashed, 403/404, error) means hidden; the entry stays stored
      ready: answer?.accessible === true ? answer : null,
      pending: !answer && !query.isError,
    };
  });
  const shown = verdicts.filter((verdict) => verdict.ready);
  const waiting = verdicts.some((verdict) => verdict.pending);

  return (
    <nav aria-label="최근 문서" className="flex flex-col" data-testid="sidebar-recent">
      <h3 className={sectionLabel}>최근 문서</h3>
      {shown.length === 0 ? (
        waiting ? (
          <div className="h-8 animate-pulse rounded-md bg-raised" aria-hidden="true" />
        ) : (
          <p className="px-2.5 text-xs text-muted-foreground" data-testid="recent-empty">
            최근에 연 문서가 없습니다.
          </p>
        )
      ) : (
        shown.map(({ entry, ready }) => {
          const href = `/page/${ready!.slug}`;
          return (
            <Link
              key={entry.id}
              to={href}
              onClick={onNavigate}
              aria-current={pathname === href ? 'page' : undefined}
              className={cn(
                rowLink,
                pathname === href
                  ? 'bg-raised font-semibold text-foreground'
                  : 'text-foreground-secondary hover:bg-raised hover:text-foreground'
              )}
            >
              <PageIcon icon={ready!.icon} fallback={false} />
              <span className="truncate">{ready!.title || '제목 없음'}</span>
            </Link>
          );
        })
      )}
    </nav>
  );
}
