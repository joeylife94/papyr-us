import { useQuery } from '@tanstack/react-query';
import { MAX_PAGE_LINK_RESOLVE_IDS } from '@shared/page-links';

/** A link target as GET /api/pages/links/resolve reports it to the current viewer (#103 E6). */
export type ResolvedPageLink =
  | { id: number; accessible: true; title: string; slug: string; icon: string | null }
  | { id: number; accessible: false };

/** GET /api/pages/:id/preview (#111 page preview). */
export interface PageLinkPreview {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  excerpt: string;
}

/** Query key prefix of link resolutions: `[PAGE_LINK_QUERY_KEY, pageId]`. */
export const PAGE_LINK_QUERY_KEY = '/api/pages/links/resolve';

// Every chip asks for its own id, so a cached title is shared by every link to that page. The
// requests made while a page renders are collected for a moment and sent as one batch, so a
// rendered page costs one resolve request however many links it holds.
const BATCH_WINDOW_MS = 10;
type Waiter = { resolve: (link: ResolvedPageLink) => void; reject: (error: unknown) => void };
let queued = new Map<number, Waiter[]>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

async function sendBatch(ids: number[], waiters: Map<number, Waiter[]>) {
  try {
    const res = await fetch(`${PAGE_LINK_QUERY_KEY}?ids=${ids.join(',')}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`resolve ${res.status}`);
    const body = (await res.json()) as { links?: ResolvedPageLink[] };
    const byId = new Map((body.links ?? []).map((link) => [link.id, link]));
    for (const id of ids) {
      // Anything the server did not report is treated as unreachable.
      const link = byId.get(id) ?? { id, accessible: false as const };
      waiters.get(id)?.forEach((waiter) => waiter.resolve(link));
    }
  } catch (error) {
    for (const id of ids) waiters.get(id)?.forEach((waiter) => waiter.reject(error));
  }
}

function flushBatch() {
  batchTimer = null;
  const waiters = queued;
  queued = new Map();
  const ids = Array.from(waiters.keys());
  for (let i = 0; i < ids.length; i += MAX_PAGE_LINK_RESOLVE_IDS) {
    void sendBatch(ids.slice(i, i + MAX_PAGE_LINK_RESOLVE_IDS), waiters);
  }
}

/** Resolve one link target, batched with the other chips rendering at the same time. */
export function resolvePageLink(pageId: number): Promise<ResolvedPageLink> {
  return new Promise((resolve, reject) => {
    const waiters = queued.get(pageId) ?? [];
    waiters.push({ resolve, reject });
    queued.set(pageId, waiters);
    if (!batchTimer) batchTimer = setTimeout(flushBatch, BATCH_WINDOW_MS);
  });
}

/**
 * The current title and icon of a link target. Stale at once, so a page that renders links
 * again (after a rename elsewhere) shows the current titles; cached ones show meanwhile.
 */
export function usePageLink(pageId: number) {
  return useQuery<ResolvedPageLink>({
    queryKey: [PAGE_LINK_QUERY_KEY, pageId],
    queryFn: () => resolvePageLink(pageId),
    staleTime: 0,
  });
}

/** The hover-card preview of a link target, loaded only while the card is open. */
export function usePageLinkPreview(pageId: number, enabled: boolean) {
  return useQuery<PageLinkPreview>({
    queryKey: [`/api/pages/${pageId}/preview`],
    enabled,
    staleTime: 30_000,
  });
}
