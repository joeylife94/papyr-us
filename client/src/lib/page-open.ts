import type { QueryClient } from '@tanstack/react-query';

const PAGE_LIST_KEY = /^\/api\/(pages($|\?|\/tree|\/title-search)|page-tree|folders)/;

/** Refresh the page lists, tree and folder listings after a page was created outside them. */
export function invalidatePageLists(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && PAGE_LIST_KEY.test(key);
    },
  });
}

const POLL_MS = 50;
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Put the caret at the end of the page body once the page at `pathname` has rendered its editor
 * (after opening a page from the quick switcher or a daily note, #111). Gives up silently when
 * the user moves elsewhere or the page opens read-only (no editor appears in time). Waits until
 * a closing dialog has been gone for one tick, so its focus return cannot take the caret back.
 * Returns a cancel function.
 */
export function focusPageBodyWhenReady(pathname: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  let dialogSeenLastTick = true;
  const timer = window.setInterval(() => {
    if (window.location.pathname !== pathname || Date.now() - startedAt > timeoutMs) {
      window.clearInterval(timer);
      return;
    }
    const dialogPresent = !!document.querySelector('[role="dialog"]');
    const settled = !dialogPresent && !dialogSeenLastTick;
    dialogSeenLastTick = dialogPresent;
    if (!settled) return;
    const fields = document.querySelectorAll<HTMLTextAreaElement>('[data-page-body] textarea');
    const field = fields[fields.length - 1];
    if (!field) return;
    window.clearInterval(timer);
    field.focus();
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }, POLL_MS);
  return () => window.clearInterval(timer);
}
