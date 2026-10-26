import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Link2, Lock } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { PageIcon } from '@/components/page/page-icon';
import { cn } from '@/lib/utils';
import { splitPageLinks } from '@shared/page-links';

type LinkPreview =
  | { id: number; accessible: true; title: string; slug: string; icon: string | null }
  | { id: number; accessible: false };

/**
 * One `[[page:<id>]]` link (issue #103 E6): the target's current icon and title, or
 * "접근할 수 없는 페이지" when it is deleted or the viewer cannot read it (no title is shown).
 * `focusable={false}` (editor previews, #113) keeps the link out of the tab order and keeps focus
 * where it is when the link is pressed; a click still opens the page.
 */
export function PageLinkChip({
  pageId,
  className,
  focusable = true,
}: {
  pageId: number;
  className?: string;
  focusable?: boolean;
}) {
  const { data, isLoading } = useQuery<LinkPreview>({
    queryKey: [`/api/pages/${pageId}/link-preview`],
  });
  const base =
    'mx-0.5 inline-flex max-w-full items-baseline gap-1 rounded px-1 align-baseline text-[0.95em] no-underline';
  if (isLoading || !data) {
    return (
      <span
        className={cn(base, 'bg-raised text-muted-foreground', className)}
        data-page-link-state="loading"
      >
        …
      </span>
    );
  }
  if (!data.accessible) {
    return (
      <span
        className={cn(base, 'bg-raised text-muted-foreground', className)}
        data-page-link-state="inaccessible"
      >
        <Lock className="h-3 w-3 self-center" aria-hidden="true" />
        접근할 수 없는 페이지
      </span>
    );
  }
  return (
    <Link
      to={`/page/${data.slug}`}
      onClick={(event) => event.stopPropagation()}
      tabIndex={focusable ? undefined : -1}
      onMouseDown={focusable ? undefined : (event) => event.preventDefault()}
      data-page-link-state="ok"
      data-page-link-target={data.id}
      className={cn(
        base,
        'font-medium text-highlight underline-offset-2 hover:bg-highlight/10 hover:underline',
        className
      )}
    >
      <PageIcon icon={data.icon} className="self-center text-[0.95em]" />
      <span className="truncate">{data.title}</span>
    </Link>
  );
}

/** Text with its link tokens shown as chips (newlines kept). */
export function TextWithPageLinks({ text }: { text: string }) {
  return (
    <>
      {splitPageLinks(text).map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <PageLinkChip key={index} pageId={segment.pageId} />
        )
      )}
    </>
  );
}

/**
 * Chips for the `span[data-page-link]` placeholders that the markdown renderer leaves in its
 * HTML (lib/markdown.ts), rendered into them through portals.
 */
export function PageLinkPortals({ root, html }: { root: HTMLElement | null; html: string }) {
  const [slots, setSlots] = useState<Array<{ element: Element; pageId: number }>>([]);
  useEffect(() => {
    if (!root) return setSlots([]);
    setSlots(
      Array.from(root.querySelectorAll('span[data-page-link]')).map((element) => ({
        element,
        pageId: Number(element.getAttribute('data-page-link')),
      }))
    );
  }, [root, html]);
  return (
    <>
      {slots.map(({ element, pageId }, index) =>
        createPortal(<PageLinkChip pageId={pageId} />, element, `${pageId}-${index}`)
      )}
    </>
  );
}

interface Backlink {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
}

/** "이 문서를 링크한 문서": readable pages linking to this one (page_links index). */
export function Backlinks({ pageId }: { pageId: number }) {
  const { data: backlinks = [], isLoading } = useQuery<Backlink[]>({
    queryKey: [`/api/pages/${pageId}/backlinks`],
  });
  return (
    <section aria-labelledby="backlinks-heading" className="mt-12">
      <h2
        id="backlinks-heading"
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground-secondary"
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />이 문서를 링크한 문서
        {backlinks.length > 0 && (
          <span className="font-mono text-xs text-muted-foreground">{backlinks.length}</span>
        )}
      </h2>
      {isLoading ? (
        <div className="h-5 w-40 animate-pulse rounded bg-raised" />
      ) : backlinks.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 이 문서를 링크한 문서가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="backlinks">
          {backlinks.map((page) => (
            <li key={page.id}>
              <Link
                to={`/page/${page.slug}`}
                className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-foreground hover:bg-raised"
              >
                <PageIcon icon={page.icon} className="text-[14px]" />
                {page.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface PickerProps {
  /** Where to show the picker (the text area being typed in). */
  anchor: { top: number; left: number };
  /** Team of the page being edited; personal pages search personal pages. */
  teamId?: number | null;
  /** The source page itself, left out of the results. */
  excludeId?: number;
  onSelect: (page: { id: number; title: string }) => void;
  onClose: () => void;
}

/**
 * The link picker opened by typing `@` or `[[` (issue #103 E6): a combobox over readable pages
 * of the current workspace, searched by title. Arrows move, Enter links, Esc closes.
 */
export function PageLinkPicker({ anchor, teamId, excludeId, onSelect, onClose }: PickerProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);
  const params = new URLSearchParams({ q: debounced });
  if (teamId) params.set('teamId', String(teamId));
  const { data: results = [], isFetching } = useQuery<Backlink[]>({
    queryKey: [`/api/page-links/search?${params.toString()}`],
  });
  const options = results.filter((page) => page.id !== excludeId);

  return createPortal(
    <div
      className="fixed z-50 w-80 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      style={{
        top: Math.min(anchor.top, window.innerHeight - 340),
        left: Math.min(anchor.left, window.innerWidth - 336),
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <Command label="링크할 문서 선택" shouldFilter={false} loop>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          onBlur={(event) => {
            // Clicking an option keeps focus inside; leaving the picker closes it.
            if (
              !event.currentTarget.closest('[cmdk-root]')?.contains(event.relatedTarget as Node)
            ) {
              onClose();
            }
          }}
          placeholder="문서 제목으로 검색"
        />
        <CommandList className="max-h-64">
          {!isFetching && options.length === 0 && (
            <CommandEmpty>일치하는 문서가 없습니다</CommandEmpty>
          )}
          {options.length > 0 && (
            <CommandGroup heading="문서 링크">
              {options.map((page) => (
                <CommandItem
                  key={page.id}
                  value={String(page.id)}
                  onSelect={() => onSelect({ id: page.id, title: page.title })}
                >
                  <PageIcon icon={page.icon} className="text-[14px]" />
                  <span className="truncate">{page.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>,
    document.body
  );
}
