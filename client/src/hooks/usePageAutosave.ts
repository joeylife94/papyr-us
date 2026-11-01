import { useCallback, useEffect, useRef, useState } from 'react';
import type { Block } from '@shared/schema';

/** Fields the autosave endpoint accepts (see PUT /api/pages/:id/autosave). */
export interface AutosavePatch {
  title?: string;
  blocks?: Block[];
  tags?: string[];
  folder?: string;
  /** One emoji, or null to remove the icon (issue #103 E4). */
  icon?: string | null;
}

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const IDLE_DELAY_MS = 1000;
const MAX_WAIT_MS = 5000;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;

interface Options {
  /** Called with the server's answer after each successful save. */
  onSaved?: (result: { id: number; slug: string; title: string }) => void;
}

/**
 * Debounced autosave for one page (issue #103 E2): edits are merged into one pending patch and
 * sent about a second after typing stops, or at least every five seconds while it continues.
 * `flush()` saves now (Ctrl/Cmd+S). A failed save is retried with backoff, together with any
 * newer edits. Leaving the page flushes pending edits and checkpoints the page, which closes its
 * editing session on the server.
 */
export function usePageAutosave(pageId: number | undefined, { onSaved }: Options = {}) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
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
      if (!pageId || !hasPending.current) return;
      // Serialize saves so an older patch can never land after a newer one.
      if (inFlight.current) await inFlight.current;
      if (!hasPending.current) return;
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
            body: JSON.stringify(body),
            credentials: 'include',
            keepalive,
          });
          if (!res.ok) throw new Error(`autosave ${res.status}`);
          const result = await res.json();
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

  /** Drop unsent edits (after a restore replaced the page they were made on). */
  const reset = useCallback(() => {
    pending.current = {};
    hasPending.current = false;
    failures.current = 0;
    clearTimers();
    setStatus('idle');
  }, []);

  const queue = useCallback(
    (patch: AutosavePatch) => {
      pending.current = { ...pending.current, ...patch };
      hasPending.current = true;
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

  return { status, savedAt, queue, flush, reset };
}
