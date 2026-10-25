import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveWorkspace } from '@/hooks/useActiveWorkspace';
import { toPlainTextPreview } from '@/lib/markdown';
import { Book, Plus, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { WikiPage } from '@shared/schema';

interface HomeProps {
  searchQuery: string;
  selectedFolder: string;
  teamName?: string;
}

const ROW_GRID = 'md:grid-cols-[minmax(0,1fr)_110px_140px_100px]';

export default function Home({ searchQuery, selectedFolder, teamName }: HomeProps) {
  const navigate = useNavigate();
  const workspace = useActiveWorkspace();
  const createPath = teamName ? `/teams/${teamName}/create` : '/create';
  // Auto-switch to relevance ranking when searching
  const [sort, setSort] = useState<'updated' | 'rank'>('updated');
  const effectiveSort = searchQuery ? 'rank' : sort;
  const limit = 12;

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<{ pages: WikiPage[]; total: number; offset: number; limit: number }>({
      queryKey: ['/api/pages', searchQuery, selectedFolder, teamName, effectiveSort],
      queryFn: async ({ pageParam = 0 }) => {
        try {
          const queryParams = new URLSearchParams();
          if (searchQuery) queryParams.append('q', searchQuery);
          if (selectedFolder) queryParams.append('folder', selectedFolder);
          if (teamName) queryParams.append('teamId', teamName);
          queryParams.append('limit', String(limit));
          queryParams.append('offset', String(pageParam));
          queryParams.append('sort', effectiveSort);

          const response = await fetch(`/api/pages?${queryParams.toString()}`);
          if (!response.ok) {
            console.error('API Error:', response.status, response.statusText);
            throw new Error(`API Error: ${response.status}`);
          }
          const payload = await response.json();
          // Attach pagination meta for getNextPageParam
          return { ...payload, offset: pageParam, limit };
        } catch (error) {
          console.error('Fetch error:', error);
          throw error; // Let React Query handle the error state & retries
        }
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        const loaded = allPages.reduce((sum, p) => sum + p.pages.length, 0);
        if (loaded < (lastPage.total || 0)) {
          return (lastPage.offset || 0) + (lastPage.limit || limit);
        }
        return undefined;
      },
      retry: 3,
      retryDelay: 1000,
    });

  const firstPage = (data as any)?.pages?.[0] as
    | { pages: WikiPage[]; total: number; offset: number; limit: number }
    | undefined;
  const totalCount = firstPage?.total || 0;
  const flatPages: WikiPage[] = (
    (data as any)?.pages
      ? ((data as any).pages as any[]).flatMap((p: any) => p.pages as WikiPage[])
      : []
  ) as WikiPage[];
  const listLabel = teamName ? '문서 목록' : '최근 문서';

  return (
    <div className="space-y-6 pb-16 lg:pb-0">
      {/* Workspace heading: the document list is the primary surface, creation the primary action. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="truncate text-[13px] text-muted-foreground">
            {teamName ? `${workspace?.displayName ?? teamName} · 워크스페이스` : '개인 문서 공간'}
          </p>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="break-words break-keep text-2xl font-extrabold tracking-tight text-foreground sm:text-[28px]">
              {teamName ? `${teamName} 팀 문서` : '내 문서'}
            </h1>
            {!isLoading && !error && (
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                문서 {totalCount}개
              </span>
            )}
          </div>
          <p className="text-sm text-foreground-secondary">
            {teamName
              ? '팀의 문서를 확인하고 함께 작업하세요.'
              : '최근 문서를 확인하거나 새 문서를 작성하세요.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="page-sort" className="text-[13px] text-muted-foreground">
              정렬
            </label>
            <select
              id="page-sort"
              className="h-9 rounded-lg border border-border bg-card px-2.5 text-[13.5px] text-foreground"
              value={effectiveSort}
              onChange={(e) => setSort(e.target.value as 'updated' | 'rank')}
              disabled={!!searchQuery}
              title={searchQuery ? '검색 시 자동으로 관련도순 정렬됩니다' : '정렬 방식 선택'}
            >
              <option value="updated">최신순</option>
              <option value="rank">관련도순</option>
            </select>
          </div>
          {/* A button (not a link) keeps the accepted GJ-01 / buyer-proof locator contract.
              Below the desktop breakpoint the floating button takes over. */}
          <Button
            onClick={() => navigate(createPath)}
            className="hidden gap-2 font-bold lg:inline-flex"
          >
            <Plus className="h-4 w-4" />새 문서 작성
          </Button>
        </div>
      </header>

      <section aria-label={listLabel}>
        {error ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
            <Book className="mx-auto mb-2 h-10 w-10 text-destructive" />
            <p className="text-base font-semibold text-foreground">
              데이터를 불러오는데 실패했습니다
            </p>
            <p className="text-sm text-foreground-secondary">잠시 후 다시 시도해주세요.</p>
          </div>
        ) : !isLoading && flatPages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
            <Book className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            {/* The workspace name is already in the page heading; repeating it here would also
                make the accepted `${team} 팀 문서` heading locator ambiguous. */}
            <h3 className="mb-1 text-base font-semibold text-foreground">아직 문서가 없습니다</h3>
            <p className="text-sm text-foreground-secondary">
              {teamName
                ? "'새 문서 작성'으로 팀의 첫 문서를 만들어 보세요."
                : "'새 문서 작성'으로 첫 문서를 만들어 보세요."}
            </p>
          </div>
        ) : (
          // One responsive structure, not separate desktop and mobile copies, so each title
          // appears exactly once.
          <div
            role="table"
            aria-label={listLabel}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div
              role="row"
              className={`hidden h-10 items-center gap-4 border-b border-border px-[18px] font-mono text-[11px] text-muted-foreground md:grid ${ROW_GRID}`}
            >
              <span role="columnheader">제목</span>
              <span role="columnheader">폴더</span>
              <span role="columnheader">작성자</span>
              <span role="columnheader" className="text-right">
                수정
              </span>
            </div>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    role="row"
                    className="flex flex-col gap-2 border-b border-border px-4 py-4 last:border-b-0 md:px-[18px]"
                  >
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                ))
              : flatPages.map((page: WikiPage) => (
                  <PageRow key={page.id} page={page} searchQuery={searchQuery} />
                ))}
          </div>
        )}

        {flatPages.length > 0 && hasNextPage && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? '로딩 중…' : '더 보기'}
            </Button>
          </div>
        )}
      </section>

      {/* Below the desktop breakpoint the create action floats above the mobile tab bar. */}
      <Button
        onClick={() => navigate(createPath)}
        className="fixed bottom-20 right-4 z-30 h-[52px] gap-2 rounded-2xl px-5 text-[14.5px] font-extrabold shadow-xl lg:hidden"
      >
        <Plus className="h-[18px] w-[18px]" />새 문서 작성
      </Button>
    </div>
  );
}

function PageRow({ page, searchQuery }: { page: WikiPage; searchQuery: string }) {
  const updated = formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true, locale: ko });

  return (
    <div
      role="row"
      className={`relative grid gap-x-4 gap-y-1 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-accent md:items-center md:px-[18px] ${ROW_GRID}`}
    >
      <div role="cell" className="flex min-w-0 flex-col gap-1">
        {/* The title link stretches over the row, so the whole row is the click target. */}
        <Link
          to={`/page/${page.slug}`}
          className="truncate text-[15px] font-bold text-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {renderHighlighted(page.title, searchQuery)}
        </Link>
        <p className="truncate text-[13px] text-muted-foreground">
          {renderHighlighted(toPlainTextPreview(page.content), searchQuery)}
        </p>
        {page.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {page.tags.slice(0, 2).map((tag: string) => (
              <Badge key={tag} variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                {tag}
              </Badge>
            ))}
            {page.tags.length > 2 && (
              <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                +{page.tags.length - 2}
              </Badge>
            )}
          </div>
        )}
        {/* Phones show folder, author and time on one line instead of columns. */}
        <p className="font-mono text-[11.5px] text-muted-foreground md:hidden">
          {page.folder} · {page.author} · {updated}
        </p>
      </div>
      <div role="cell" className="hidden md:block">
        <span className="rounded-md border border-border px-2 py-0.5 text-xs capitalize text-foreground-secondary">
          {page.folder}
        </span>
      </div>
      <div
        role="cell"
        className="hidden min-w-0 items-center gap-2 text-[13px] text-foreground-secondary md:flex"
      >
        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{page.author}</span>
      </div>
      <div
        role="cell"
        className="hidden text-right font-mono text-xs text-muted-foreground md:block"
      >
        <time dateTime={new Date(page.updatedAt).toISOString()}>{updated}</time>
      </div>
    </div>
  );
}

function renderHighlighted(text: string, query: string) {
  if (!query || !query.trim()) return text;
  try {
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${safe})`, 'ig');
    const parts = text.split(re);
    return (
      <>
        {parts.map((part, i) =>
          part.match(re) ? (
            <mark key={i} className="bg-warning/20 rounded px-0.5">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  } catch {
    return text;
  }
}
