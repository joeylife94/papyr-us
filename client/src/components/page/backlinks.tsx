import { useId } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { PageIcon } from './page-icon';

interface Backlink {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  updatedAt: string;
}

/**
 * "이 문서를 링크한 문서" (#103 E6): pages that link to this one, limited by the server to live
 * pages the viewer can read. Refetched whenever the page view mounts, so it follows edits made
 * on other pages.
 */
export function Backlinks({ pageId }: { pageId: number }) {
  const headingId = useId();
  const { data, isPending, isError } = useQuery<{ backlinks: Backlink[] }>({
    queryKey: [`/api/pages/${pageId}/backlinks`],
    staleTime: 0,
  });
  const backlinks = data?.backlinks ?? [];

  return (
    <section
      aria-labelledby={headingId}
      data-testid="backlinks"
      className="mt-12 border-t border-border pt-8"
    >
      <h2 id={headingId} className="mb-3 flex items-baseline gap-2 text-sm font-semibold">
        <span className="text-foreground">이 문서를 링크한 문서</span>
        {backlinks.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">{backlinks.length}</span>
        )}
      </h2>
      {isPending ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-8 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-2/3 animate-pulse rounded-md bg-muted" />
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">링크한 문서를 불러오지 못했습니다.</p>
      ) : backlinks.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 이 문서를 링크한 문서가 없습니다.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {backlinks.map((backlink) => (
            <li key={backlink.id}>
              <Link
                to={`/page/${backlink.slug}`}
                className="flex min-h-10 min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PageIcon icon={backlink.icon} />
                <span className="min-w-0 flex-1 truncate font-medium">{backlink.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(backlink.updatedAt), {
                    addSuffix: true,
                    locale: ko,
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
