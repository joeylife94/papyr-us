import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, ChevronRight, Clock, FileText, Plus, User } from 'lucide-react';
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

  const createPath = teamName ? `/teams/${teamName}/create` : '/create';
  const workspaceTitle = teamName ? `${teamName} documents` : 'Documents';

  return (
    <section className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            {teamName ? 'Team workspace' : 'Knowledge workspace'}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {workspaceTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalCount === 1 ? '1 document' : `${totalCount} documents`} · most recently updated
            first
          </p>
        </div>
        <Link
          to={createPath}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" />
          New document
        </Link>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">
          {searchQuery ? `Search results for “${searchQuery}”` : 'All documents'}
        </h2>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={effectiveSort}
            onChange={(e) => setSort(e.target.value as 'updated' | 'rank')}
            disabled={!!searchQuery}
            title={searchQuery ? 'Search results are sorted by relevance' : 'Select sort order'}
          >
            <option value="updated">Last updated</option>
            <option value="rank">Relevance</option>
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-9 w-9 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <BookOpen className="mb-3 h-8 w-8 text-destructive" />
            <h3 className="font-medium text-foreground">Documents could not be loaded</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Refresh the page or try again in a moment.
            </p>
          </div>
        ) : flatPages.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <FileText className="mb-3 h-9 w-9 text-muted-foreground" />
            <h3 className="font-medium text-foreground">No documents yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Start with a document that gives your team a shared place for decisions and notes.
            </p>
            <Link to={createPath} className="mt-5 text-sm font-medium text-primary hover:underline">
              Create the first document
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {flatPages.map((page: WikiPage) => {
              const tags = page.tags ?? [];
              return (
                <Link
                  key={page.id}
                  to={`/page/${page.slug}`}
                  className="group flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/60 sm:gap-4 sm:px-5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="truncate font-medium text-foreground group-hover:text-primary">
                        {renderHighlighted(page.title, searchQuery)}
                      </h3>
                      <Badge
                        variant="secondary"
                        className="hidden shrink-0 capitalize sm:inline-flex"
                      >
                        {page.folder}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      {renderHighlighted(page.content.substring(0, 180), searchQuery)}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {page.author}
                      </span>
                      {tags.slice(0, 2).map((tag: string) => (
                        <span key={tag} className="hidden sm:inline">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="hidden shrink-0 items-center gap-2 text-right text-xs text-muted-foreground md:flex">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {flatPages.length > 0 && hasNextPage && (
        <div className="flex justify-center">
          <button
            className="h-10 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more documents'}
          </button>
        </div>
      )}
    </section>
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
