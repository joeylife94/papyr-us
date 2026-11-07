import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { embedRefusal, MAX_EMBED_DEPTH, MAX_EMBEDS_PER_PAGE } from '@shared/page-embeds';
import { createEmbedBudget, type EmbedBudget } from '@/lib/embed-budget';
import { MarkdownRenderer } from '@/components/wiki/markdown-renderer';
import { PageIcon } from './page-icon';
import { PageLinkChip, slotsOf } from './page-links';

/**
 * Page embeds (issue #135, decision P3-D2): an `![[page:<id>]]` embed shows the target page's
 * current content, read-only, inside the page being read or edited. Embeds are views: the
 * content is fetched with the viewer's own access (GET /api/pages/:id/embed, refetched when the
 * window regains focus) and never stored in the embedding page.
 *
 * A target the viewer cannot read, or one that is gone, shows "접근할 수 없는 페이지" and
 * nothing else. The embedded content renders through the same safe Markdown renderer as the page
 * (no raw HTML, safe URL schemes only), with its own link chips and tags; its own embeds render
 * down to `MAX_EMBED_DEPTH`, a page already above (a cycle) is not shown again, and at most
 * `MAX_EMBEDS_PER_PAGE` embeds render in one page view (see `EmbedBudget`). Those limits show
 * a notice with a link to the page instead.
 */

type EmbedData =
  | {
      id: number;
      accessible: true;
      title: string;
      slug: string;
      icon: string | null;
      updatedAt: string;
      content: string;
      truncated: boolean;
    }
  | { id: number; accessible: false };

interface EmbedScope {
  /** Pages the next embed sits inside, the viewed page first (when it has an id). */
  ancestors: number[];
  /** Depth of the document the next embed sits in: 0 for the viewed page. */
  depth: number;
  budget: EmbedBudget;
}

const EmbedScopeContext = createContext<EmbedScope | null>(null);

const newScope = (pageId?: number): EmbedScope => ({
  ancestors: pageId ? [pageId] : [],
  depth: 0,
  budget: createEmbedBudget(),
});

/**
 * The page being viewed: embeds below share one budget and know the page, so an embed of the
 * page itself is a cycle. Without a provider, each Markdown document gets its own scope.
 */
export function EmbedScopeProvider({ pageId, children }: { pageId?: number; children: ReactNode }) {
  const [budget] = useState(() => createEmbedBudget());
  const scope = useMemo<EmbedScope>(
    () => ({ ancestors: pageId ? [pageId] : [], depth: 0, budget }),
    [pageId, budget]
  );
  return <EmbedScopeContext.Provider value={scope}>{children}</EmbedScopeContext.Provider>;
}

const frame = 'not-prose my-3 rounded-lg border border-border bg-card text-sm';

function EmbedNotice({ pageId, children }: { pageId: number; children: ReactNode }) {
  return (
    <div
      className={`${frame} flex flex-wrap items-center gap-2 px-3 py-2 text-muted-foreground`}
      data-page-embed-state="limited"
    >
      <span>{children}</span>
      <PageLinkChip pageId={pageId} />
    </div>
  );
}

function Inaccessible() {
  return (
    <div
      className={`${frame} flex items-center gap-2 px-3 py-2 text-muted-foreground`}
      data-page-embed-state="inaccessible"
    >
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      접근할 수 없는 페이지
    </div>
  );
}

/** One embed of page `pageId` (see the module comment). */
export function PageEmbed({ pageId }: { pageId: number }) {
  const parent = useContext(EmbedScopeContext);
  const [fallback] = useState(() => newScope());
  const scope = parent ?? fallback;
  const depth = scope.depth + 1;
  const refusal = embedRefusal(pageId, { ancestors: scope.ancestors, depth });

  // A place in the page's budget, taken while mounted (StrictMode remounts give it back first).
  const key = useId();
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    if (refusal) return;
    setGranted(scope.budget.claim(key));
    return () => scope.budget.release(key);
  }, [scope.budget, key, refusal]);

  const { data, isError } = useQuery<EmbedData>({
    queryKey: [`/api/pages/${pageId}/embed`],
    enabled: !refusal && granted === true,
    // Live: the target may change at any time; ask again when the window regains focus.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const childScope = useMemo<EmbedScope>(
    () => ({ ancestors: [...scope.ancestors, pageId], depth, budget: scope.budget }),
    [scope.ancestors, scope.budget, pageId, depth]
  );
  const footnoteIdPrefix = `embed-${key.replace(/[^A-Za-z0-9]/g, '')}-`;

  if (refusal === 'invalid') return <Inaccessible />;
  if (refusal === 'cycle') {
    return (
      <EmbedNotice pageId={pageId}>
        이 문서는 이미 위에 임베드되어 다시 표시하지 않습니다:
      </EmbedNotice>
    );
  }
  if (refusal === 'depth') {
    return (
      <EmbedNotice pageId={pageId}>임베드는 {MAX_EMBED_DEPTH}단계까지만 표시합니다:</EmbedNotice>
    );
  }
  if (granted === false) {
    return (
      <EmbedNotice pageId={pageId}>
        임베드는 한 페이지에 {MAX_EMBEDS_PER_PAGE}개까지만 표시합니다:
      </EmbedNotice>
    );
  }
  if (isError) {
    return (
      <div className={`${frame} px-3 py-2 text-muted-foreground`} data-page-embed-state="error">
        임베드한 문서를 불러오지 못했습니다
      </div>
    );
  }
  if (!data) {
    return (
      <div className={`${frame} space-y-2 p-3`} data-page-embed-state="loading" aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-raised" />
        <div className="h-4 w-full animate-pulse rounded bg-raised" />
      </div>
    );
  }
  if (!data.accessible) return <Inaccessible />;

  return (
    <section
      className={frame}
      aria-label={`임베드한 문서: ${data.title}`}
      data-page-embed-state="ok"
      data-page-embed-target={data.id}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <PageIcon icon={data.icon} className="text-[14px]" />
          <span className="truncate" data-testid="page-embed-title">
            {data.title}
          </span>
        </span>
        <Link
          to={`/page/${data.slug}`}
          onClick={(event) => event.stopPropagation()}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-highlight hover:bg-highlight/10 hover:underline"
        >
          열기
        </Link>
      </header>
      <div className="px-4 py-3" data-testid="page-embed-content">
        {data.content.trim() ? (
          <EmbedScopeContext.Provider value={childScope}>
            <MarkdownRenderer content={data.content} embedded footnoteIdPrefix={footnoteIdPrefix} />
          </EmbedScopeContext.Provider>
        ) : (
          <p className="text-muted-foreground">빈 문서입니다.</p>
        )}
        {data.truncated && (
          <p className="mt-2 text-xs text-muted-foreground">
            내용이 길어 앞부분만 표시합니다. 전체 내용은 &lsquo;열기&rsquo;에서 볼 수 있습니다.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Embeds for the `div[data-page-embed]` slots the markdown renderer leaves in its HTML
 * (lib/markdown.ts), rendered into them through portals.
 */
export function PageEmbedPortals({ root, html }: { root: HTMLElement | null; html: string }) {
  const [slots, setSlots] = useState<Array<{ element: Element; pageId: number }>>([]);
  const parent = useContext(EmbedScopeContext);
  const [fallback] = useState(() => newScope());
  useEffect(() => {
    setSlots(
      slotsOf(root, 'div[data-page-embed]').map((element) => ({
        element,
        pageId: Number(element.getAttribute('data-page-embed')),
      }))
    );
  }, [root, html]);
  const portals = slots.map(({ element, pageId }, index) =>
    createPortal(<PageEmbed pageId={pageId} />, element, `${pageId}-${index}`)
  );
  if (parent) return <>{portals}</>;
  return <EmbedScopeContext.Provider value={fallback}>{portals}</EmbedScopeContext.Provider>;
}
