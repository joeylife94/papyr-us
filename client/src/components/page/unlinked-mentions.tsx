import { useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, TextSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageIcon } from '@/components/page/page-icon';

interface UnlinkedMention {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  snippet: string;
}

/** Split a snippet around case-insensitive occurrences of `title`, for highlighting as text. */
function splitMention(snippet: string, title: string): Array<{ text: string; match: boolean }> {
  const needle = title.trim();
  if (!needle) return [{ text: snippet, match: false }];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return snippet
    .split(new RegExp(`(${escaped})`, 'gi'))
    .filter(Boolean)
    .map((text) => ({ text, match: text.toLowerCase() === needle.toLowerCase() }));
}

/**
 * "링크되지 않은 언급" (#111 §5): readable pages of the same workspace that mention this page's
 * title without linking to it. Collapsed by default with the count in the header. Snippets are
 * untrusted plain text and are rendered as text only.
 */
export function UnlinkedMentions({ pageId, pageTitle }: { pageId: number; pageTitle: string }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const { data, isLoading, isError } = useQuery<{ mentions: UnlinkedMention[] }>({
    queryKey: [`/api/pages/${pageId}/unlinked-mentions`],
    staleTime: 30_000,
  });
  const mentions = useMemo(() => data?.mentions ?? [], [data]);

  return (
    <div className="rounded-lg border border-border bg-panel" data-testid="unlinked-mentions">
      <h2 className="text-sm font-medium">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-4 text-left text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
          />
          <TextSearch aria-hidden="true" className="h-4 w-4 text-highlight" />
          링크되지 않은 언급
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {isLoading ? '…' : isError ? '—' : `${mentions.length}개`}
          </span>
        </button>
      </h2>
      <div id={regionId} hidden={!open} className="border-t border-border px-4 pb-4 pt-3">
        {isError ? (
          <p className="text-sm text-muted-foreground">언급을 불러오지 못했습니다.</p>
        ) : mentions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isLoading ? '불러오는 중…' : '이 문서를 링크 없이 언급한 문서가 없습니다.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {mentions.map((mention) => (
              <li key={mention.id}>
                <Link
                  to={`/page/${mention.slug}`}
                  className="block rounded-md px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-foreground">
                    <PageIcon icon={mention.icon} />
                    <span className="truncate">{mention.title || '제목 없음'}</span>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
                    {splitMention(mention.snippet, pageTitle).map((part, index) =>
                      part.match ? (
                        <mark
                          key={index}
                          className="rounded-sm bg-primary/25 px-0.5 text-foreground"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        <span key={index}>{part.text}</span>
                      )
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
