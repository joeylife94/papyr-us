import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Book, Clock, Plus, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { WikiPage } from '@shared/schema';

interface HomeProps {
  searchQuery: string;
  selectedFolder: string;
  teamName?: string;
}

export default function Home({ searchQuery, selectedFolder, teamName }: HomeProps) {
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

  return (
    <div className="space-y-8">
      {/* Workspace heading: documents are the primary action, not dashboard statistics. */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            워크스페이스 / 문서
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {teamName ? `${teamName} 팀 문서` : '내 문서'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {teamName ? '팀의 문서를 확인하고 함께 작업하세요.' : '최근 문서를 확인하거나 새 문서를 작성하세요.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {!isLoading && !error && (
            <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">총 {totalCount}개</span>
          )}
          <Link
            to={teamName ? `/teams/${teamName}/create` : '/create'}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            새 문서 작성
          </Link>
        </div>
      </div>

      {/* Recent Pages */}
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {teamName ? '문서 목록' : '최근 문서'}
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="page-sort" className="text-sm text-slate-600 dark:text-slate-400">정렬</label>
              <select
                id="page-sort"
                className="text-sm border rounded-md px-2 py-1 bg-white dark:bg-slate-900"
                value={effectiveSort}
                onChange={(e) => setSort(e.target.value as 'updated' | 'rank')}
                disabled={!!searchQuery}
                title={searchQuery ? '검색 시 자동으로 관련도순 정렬됩니다' : '정렬 방식 선택'}
              >
                <option value="updated">최신순</option>
                <option value="rank">관련도순</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <div className="text-red-500 mb-4">
              <Book className="h-12 w-12 mx-auto mb-2" />
              <p className="text-lg font-medium">데이터를 불러오는데 실패했습니다</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                잠시 후 다시 시도해주세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {flatPages.map((page: WikiPage) => (
              <Link key={page.id} to={`/page/${page.slug}`}>
                <Card className="group h-full border border-slate-200 dark:border-slate-800 transition-colors duration-150 hover:border-primary/50 hover:bg-slate-50/70 dark:hover:bg-slate-900/70">
                  <CardHeader>
                    <CardTitle className="text-lg line-clamp-2">
                      {renderHighlighted(page.title, searchQuery)}
                    </CardTitle>
                    <div className="flex items-center space-x-4 text-sm text-slate-500 dark:text-slate-400">
                      <div className="flex items-center space-x-1">
                        <User className="h-3 w-3" />
                        <span>{page.author}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                        {renderHighlighted(page.content.substring(0, 150), searchQuery)}...
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {page.folder}
                        </Badge>
                        {page.tags.slice(0, 2).map((tag: string) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                        {page.tags.length > 2 && (
                          <Badge variant="outline">+{page.tags.length - 2}개 더</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
        {flatPages.length === 0 && !isLoading && !error && (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
            <Book className="h-10 w-10 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              {teamName ? `${teamName} 팀 문서가 없습니다` : '아직 문서가 없습니다'}
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              {teamName
                ? '새 문서를 작성하여 팀의 지식을 공유해보세요.'
                : '새 문서를 작성해 작업을 시작해 보세요.'}
            </p>
          </div>
        )}

        {flatPages.length > 0 && hasNextPage && (
          <div className="flex justify-center mt-8">
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? '로딩 중…' : '더 보기'}
            </button>
          </div>
        )}
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
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">
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
