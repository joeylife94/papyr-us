import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  AutosaveController,
  type AutosaveHandlers,
  type PageWithRevision,
} from '@/lib/page-autosave-controller';

export type {
  AutosavePatch,
  AutosaveStatus,
  PageField,
  PageWithRevision,
  SaveConflict,
} from '@/lib/page-autosave-controller';

interface Options extends AutosaveHandlers {
  /**
   * The page as the editor loaded it, from a fresh read. Every save names its revision as the
   * base, and a save based on an older one is refused instead of overwriting (WP1). It is taken
   * once, from the page the editor was opened on, and afterwards only from this editor's own
   * saves, an automatic re-base or an explicit `loadLatest`, never from a background refetch: a
   * refetched page the editor is not showing would otherwise hide that someone else changed it.
   */
  page?: Pick<PageWithRevision, 'revision' | 'fieldRevisions'>;
  /**
   * Whether saves name their base revision. Off while realtime collaboration is on: the
   * collaboration server saves the page itself, so a client's base would be stale all the time.
   */
  guarded?: boolean;
}

/**
 * Debounced autosave for one page (issue #103 E2), a thin React wrapper around
 * `AutosaveController`, which holds the rules (see there): edits are merged into one pending
 * patch and sent about a second after typing stops, or at least every five seconds while it
 * continues. `flush()` saves now (Ctrl/Cmd+S). A failed save is retried with backoff. Leaving the
 * page flushes pending edits and checkpoints the page, which closes its editing session on the
 * server.
 *
 * When the stored page changed under a save, the controller either re-bases silently (nobody
 * touched the fields being written; `adopt` is called first so the editor shows the others) or
 * reports a `conflict` for the person to decide with `keepMine()` or `loadLatest()`.
 */
export function usePageAutosave(
  pageId: number | undefined,
  { page, guarded = true, onSaved, adopt, writing, current }: Options = {}
) {
  // One controller per page; the editor is mounted per page, so `page` is read once.
  const controller = useMemo(
    () => new AutosaveController({ pageId: pageId ?? 0, page, guarded }),
    [pageId]
  );
  controller.handlers = { onSaved, adopt, writing, current };
  controller.guarded = guarded;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  // Leaving the page (route change or tab close): flush and close the editing session.
  useEffect(() => {
    if (!pageId) return;
    controller.setMounted(true);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.hasPendingEdits) {
        void controller.leave();
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      void controller.dispose();
    };
  }, [pageId, controller]);

  const actions = useMemo(
    () => ({
      queue: controller.queue.bind(controller),
      flush: controller.flush.bind(controller),
      reset: controller.reset.bind(controller),
      keepMine: controller.keepMine.bind(controller),
      loadLatest: controller.loadLatest.bind(controller),
    }),
    [controller]
  );

  return {
    status: snapshot.status,
    savedAt: snapshot.savedAt,
    conflict: snapshot.conflict,
    ...actions,
  };
}
