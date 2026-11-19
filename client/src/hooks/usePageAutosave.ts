import { useCallback, useEffect, useRef, useState } from 'react';
import type { Block, PageCover, WikiPage } from '@shared/schema';

/** Fields the autosave endpoint accepts (see PUT /api/pages/:id/autosave). */
export interface AutosavePatch {
  title?: string;
  blocks?: Block[];
  tags?: string[];
  folder?: string;
  /** One emoji, or null to remove the icon (issue #103 E4). */
  icon?: string | null;
  /** A preset or uploaded image cover, or null to remove it (issue #134). */
  cover?: PageCover | null;
}

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

/** A page as the server answers reads: the stored fields plus the revision saves are based on. */
export type PageWithRevision = WikiPage & { revision?: string };

/** The server refused a save because the page changed after the revision it was based on. */
export interface SaveConflict {
  /** The page as it is stored now. */
  page: PageWithRevision;
  currentRevision: string;
}

const IDLE_DELAY_MS = 1000;
const MAX_WAIT_MS = 5000;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;

interface Options {
  /** Called with the server's answer after each successful save. */
  onSaved?: (result: { id: number; slug: string; title: string }) => void;
  /**
   * The revision of the page as the editor loaded it. Every save names the revision it is based
   * on, and a save based on an older one is refused instead of overwriting (WP1). It is taken
   * once, from the page the editor was opened on, and afterwards only from this editor's own
   * saves or an explicit `loadLatest`, never from a background refetch: a refetched page the
   * editor is not showing would otherwise hide that someone else changed it.
   */
  baseRevision?: string;
  /**
   * Whether saves name their base revision. Off while realtime collaboration is on: the
   * collaboration server saves the page itself, so a client's base would be stale all the time.
   */
  guarded?: boolean;
}

/**
 * Debounced autosave for one page (issue #103 E2): edits are merged into one pending patch and
 * sent about a second after typing stops, or at least every five seconds while it continues.
 * `flush()` saves now (Ctrl/Cmd+S). A failed save is retried with backoff, together with any
 * newer edits. Leaving the page flushes pending edits and checkpoints the page, which closes its
 * editing session on the server.
 *
 * When the server answers 409 (the page was changed by someone else), autosaving stops and
 * `conflict` carries the page as it is now. The unsent edits are kept until the person chooses:
 * `keepMine()` saves them on top of the current revision, `loadLatest()` drops them and returns
 * the current page to show.
 */
export function usePageAutosave(
  pageId: number | undefined,
  { onSaved, baseRevision, guarded = true }: Options = {}
) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  const conflictRef = useRef<SaveConflict | null>(null);
  const baseRef = useRef<string | undefined>(baseRevision);
  const guardedRef = useRef(guarded);
  guardedRef.current = guarded;
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const pending = useRef<AutosavePatch>({});
  const hasPending = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const maxTimer = useRef<ReturnType<typeof setTimeout>>();
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const failures = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const clearTimers = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    idleTimer.current = undefined;
    maxTimer.current = undefined;
    retryTimer.current = undefined;
  };

  const send = useCallback(
    async (keepalive = false) => {
      if (!pageId || !hasPending.current || conflictRef.current) return;
      // Serialize saves so an older patch can never land after a newer one.
      if (inFlight.current) await inFlight.current;
      if (!hasPending.current || conflictRef.current) return;
      const body = pending.current;
      pending.current = {};
      hasPending.current = false;
      clearTimers();
      setStatus('saving');
      const run = (async () => {
        try {
          const res = await fetch(`/api/pages/${pageId}/autosave`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              guardedRef.current && baseRef.current
                ? { ...body, baseRevision: baseRef.current }
                : body
            ),
            credentials: 'include',
            keepalive,
          });
          if (res.status === 409) {
            const refused = await res.json().catch(() => null);
            if (refused?.code === 'page_revision_conflict' && refused.page) {
              // Keep the edits for the person's decision, and stop saving until it is made.
              pending.current = { ...body, ...pending.current };
              hasPending.current = true;
              failures.current = 0;
              clearTimers();
              const found: SaveConflict = {
                page: refused.page,
                currentRevision: String(refused.currentRevision),
              };
              conflictRef.current = found;
              setConflict(found);
              setStatus('conflict');
              return;
            }
          }
          if (!res.ok) throw new Error(`autosave ${res.status}`);
          const result = await res.json();
          if (typeof result.revision === 'string') baseRef.current = result.revision;
          failures.current = 0;
          setSavedAt(new Date());
          setStatus(hasPending.current ? 'pending' : 'saved');
          onSavedRef.current?.(result);
        } catch {
          // Put the failed edits back under any newer ones so a retry sends both.
          pending.current = { ...body, ...pending.current };
          hasPending.current = true;
          setStatus('error');
          // Retry on its own, so the last edits are saved even if the user stops typing.
          if (mounted.current) {
            failures.current += 1;
            const delay = Math.min(RETRY_BASE_MS * 2 ** (failures.current - 1), RETRY_MAX_MS);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => void sendRef.current?.(false), delay);
          }
        }
      })();
      inFlight.current = run;
      await run;
      inFlight.current = null;
    },
    [pageId]
  );
  const sendRef = useRef(send);
  sendRef.current = send;

  const flush = useCallback(() => send(false), [send]);

  /**
   * Drop unsent edits (after a restore replaced the page they were made on, or the latest page
   * was loaded). `revision` is the revision of the page now shown, the base of the next save.
   */
  const reset = useCallback((revision?: string) => {
    pending.current = {};
    hasPending.current = false;
    failures.current = 0;
    clearTimers();
    conflictRef.current = null;
    setConflict(null);
    if (revision !== undefined) baseRef.current = revision;
    setStatus('idle');
  }, []);

  /** Drop the unsent edits and return the page as it is stored now, to show in their place. */
  const loadLatest = useCallback((): PageWithRevision | null => {
    const latest = conflictRef.current;
    if (!latest) return null;
    reset(latest.currentRevision);
    return latest.page;
  }, [reset]);

  /** Save the unsent edits on top of the current page, deliberately replacing its changes. */
  const keepMine = useCallback(() => {
    const latest = conflictRef.current;
    if (!latest) return;
    baseRef.current = latest.currentRevision;
    conflictRef.current = null;
    setConflict(null);
    setStatus('pending');
    void sendRef.current?.(false);
  }, []);

  const queue = useCallback(
    (patch: AutosavePatch) => {
      pending.current = { ...pending.current, ...patch };
      hasPending.current = true;
      // While a conflict waits for a decision, edits are only collected.
      if (conflictRef.current) return;
      setStatus('pending');
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => void send(false), IDLE_DELAY_MS);
      if (!maxTimer.current) {
        maxTimer.current = setTimeout(() => void send(false), MAX_WAIT_MS);
      }
    },
    [send]
  );

  // Leaving the page (route change or tab close): flush and close the editing session.
  useEffect(() => {
    if (!pageId) return;
    mounted.current = true;
    const leave = () => {
      void send(true).finally(() => {
        void fetch(`/api/pages/${pageId}/checkpoint`, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
        }).catch(() => undefined);
      });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasPending.current) {
        leave();
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // The final flush below is the last attempt; no retries after the page is gone.
      mounted.current = false;
      leave();
    };
  }, [pageId, send]);

  return { status, savedAt, queue, flush, reset, conflict, loadLatest, keepMine };
}
