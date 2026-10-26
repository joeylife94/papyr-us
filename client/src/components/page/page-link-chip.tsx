import { useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { HoverCardContent } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { PageIcon } from './page-icon';
import { usePageLink, usePageLinkPreview } from './page-link-data';

/** Shown instead of a link whose target is deleted or not readable by the viewer (#103 E6). */
export const UNREACHABLE_PAGE_LABEL = '접근할 수 없는 페이지';

interface PageLinkChipProps {
  pageId: number;
  /**
   * Editor previews pass false: the chip is a mouse shortcut there (it neither takes focus nor
   * joins the tab order, so clicking it never turns the block into its textarea), and the block's
   * textarea is the keyboard path. Reader chips are ordinary links.
   */
  focusable?: boolean;
}

const chipClass =
  'not-prose mx-px inline-flex max-w-full items-center gap-1 rounded-md px-1 align-baseline leading-snug';

/**
 * A link to another page: its icon and current title, linking to the page (#103 E6). Unreachable
 * targets show a muted label without title or icon. Hovering or focusing an accessible chip
 * opens a preview card (#111).
 */
export function PageLinkChip({ pageId, focusable = true }: PageLinkChipProps) {
  const { data, isPending } = usePageLink(pageId);

  if (isPending) {
    return (
      <span
        className={cn(chipClass, 'bg-muted text-muted-foreground')}
        data-page-link-state="loading"
      >
        <span aria-hidden="true">…</span>
        <span className="sr-only">링크 불러오는 중</span>
      </span>
    );
  }

  if (!data?.accessible) {
    return (
      <span
        className={cn(chipClass, 'cursor-default bg-muted text-muted-foreground')}
        data-page-link-state="unreachable"
      >
        {UNREACHABLE_PAGE_LABEL}
      </span>
    );
  }

  const keepFocus = (event: MouseEvent) => {
    if (!focusable) event.preventDefault();
  };

  return (
    <PageLinkPreviewCard pageId={pageId}>
      <Link
        to={`/page/${data.slug}`}
        data-page-link={pageId}
        tabIndex={focusable ? undefined : -1}
        onMouseDown={keepFocus}
        className={cn(
          chipClass,
          'font-medium text-highlight no-underline transition-colors hover:bg-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <PageIcon icon={data.icon} className="text-[0.95em]" />
        <span className="min-w-0 truncate">{data.title}</span>
      </Link>
    </PageLinkPreviewCard>
  );
}

/** Obsidian-style page preview: icon, title and a short excerpt after a short hover (#111). */
function PageLinkPreviewCard({ pageId, children }: { pageId: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError } = usePageLinkPreview(pageId, open);

  return (
    <HoverCardPrimitive.Root openDelay={400} closeDelay={150} open={open} onOpenChange={setOpen}>
      <HoverCardPrimitive.Trigger asChild>{children}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardContent
          align="start"
          className="w-72 max-w-[calc(100vw-2rem)] p-3"
          data-testid="page-link-preview"
        >
          {isError ? (
            <p className="text-sm text-muted-foreground">미리보기를 불러올 수 없습니다.</p>
          ) : isPending ? (
            <div className="space-y-2" aria-hidden="true">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <div className="min-w-0 space-y-1.5">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                <PageIcon icon={data.icon} />
                <span className="truncate">{data.title}</span>
              </p>
              <p className="line-clamp-5 break-words text-xs leading-relaxed text-muted-foreground">
                {data.excerpt || '내용이 없는 문서입니다.'}
              </p>
            </div>
          )}
        </HoverCardContent>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}
