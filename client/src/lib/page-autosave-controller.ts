import type { Block, PageCover, WikiPage } from '@shared/schema';

/**
 * The autosave state machine of one open page (issue #103 E2, WP1), kept apart from React so it
 * can be tested with a mocked `fetch` and fake timers; `usePageAutosave` wraps it.
 *
 * Edits are merged into one pending patch and sent about a second after typing stops, or at
 * least every five seconds while it continues. Every save names the revision the editor last knew
 * (`baseRevision`). When the server refuses a save because the stored page moved on (409), the
 * answer carries the page as it is now, and the controller compares it, field by field, with what
 * this editor last knew of the stored page:
 *
 * - No field the person is writing changed on the server: nobody touched what they write. The
 *   other fields are adopted (the view shows them first), the new revision becomes the base and
 *   the same patch is sent again, without a notice. This happens once per patch: a second refusal
 *   in a row becomes a conflict, never a loop.
 * - A field being written also changed on the server: a conflict. Autosaving stops and `conflict`
 *   says which fields collide. Edits made meanwhile are only collected. The person then chooses
 *   `keepMine()` (adopt what else changed, then save over the collided fields on the new
 *   revision) or `loadLatest()` (drop the edits and show the current page). Whichever is chosen,
 *   the title and body typed so far were sent once more on the old base, which the server refuses
 *   and records as a version, so they can be recovered; leaving the page does the same.
 *
 * The server refuses every stale write exactly as before; nothing is merged there.
 */

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

export type PageField = keyof AutosavePatch;

const PAGE_FIELDS: PageField[] = ['title', 'blocks', 'tags', 'folder', 'icon', 'cover'];

/** Per field, a short token of its stored value (the server computes them, see page-revision.ts). */
export type FieldRevisions = Partial<Record<PageField, string>>;

/** A page as the server answers reads: the stored fields plus the revisions saves are based on. */
export type PageWithRevision = WikiPage & {
  revision?: string;
  fieldRevisions?: FieldRevisions;
};

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

/** The server refused a save because the page changed after the revision it was based on. */
export interface SaveConflict {
  /** The page as it is stored now. */
  page: PageWithRevision;
  currentRevision: string;
  /** The fields this editor is writing that also changed in the stored page. */
  fields: PageField[];
}

export interface AutosaveSnapshot {
  status: AutosaveStatus;
  savedAt: Date | null;
  conflict: SaveConflict | null;
}

export interface AutosaveHandlers {
  /** Called with the server's answer after each successful save. */
  onSaved?: (result: { id: number; slug: string; title: string }) => void;
  /**
   * The stored page differs from what the editor shows in `fields`, which the person is not
   * writing: show these values of `page` now (before anything is saved on top of them).
   */
  adopt?: (page: PageWithRevision, fields: PageField[]) => void;
}

export interface AutosaveOptions {
  pageId: number;
  /** The page as the editor loaded it (from a fresh read). */
  page?: Pick<PageWithRevision, 'revision' | 'fieldRevisions'>;
  /** Whether saves name their base revision (off while realtime collaboration saves the page). */
  guarded?: boolean;
  fetchImpl?: typeof fetch;
}

export const IDLE_DELAY_MS = 1000;
export const MAX_WAIT_MS = 5000;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;

/** Fields of `page` that differ from what the editor last knew; unknown counts as different. */
function changedSince(known: FieldRevisions | undefined, page: PageWithRevision): PageField[] {
  return PAGE_FIELDS.filter((field) => {
    const before = known?.[field];
    const now = page.fieldRevisions?.[field];
    return before === undefined || now === undefined || before !== now;
  });
}

export class AutosaveController {
  handlers: AutosaveHandlers = {};
  guarded: boolean;
  private readonly pageId: number;
  private readonly fetchImpl: typeof fetch;
  private snapshot: AutosaveSnapshot = { status: 'idle', savedAt: null, conflict: null };
  private listeners = new Set<() => void>();
  private base: string | undefined;
  private known: FieldRevisions | undefined;
  private pending: AutosavePatch = {};
  private hasPending = false;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private maxTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private autoRebases = 0;
  private mounted = true;
  private inFlight: Promise<void> | null = null;

  constructor(options: AutosaveOptions) {
    this.pageId = options.pageId;
    this.guarded = options.guarded ?? true;
    this.base = options.page?.revision;
    this.known = options.page?.fieldRevisions;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  get hasPendingEdits() {
    return this.hasPending;
  }

  setMounted(mounted: boolean) {
    this.mounted = mounted;
  }

  private set(next: Partial<AutosaveSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }

  private clearTimers() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.idleTimer = this.maxTimer = this.retryTimer = undefined;
  }

  /** Merge an edit into the pending patch and schedule a save. */
  queue(patch: AutosavePatch) {
    this.pending = { ...this.pending, ...patch };
    this.hasPending = true;
    const open = this.snapshot.conflict;
    if (open) {
      // While a conflict waits for a decision, edits are only collected; what collides may grow.
      const fields = this.collidingFields(open.page);
      if (fields.join() !== open.fields.join()) this.set({ conflict: { ...open, fields } });
      return;
    }
    this.set({ status: 'pending' });
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.send(false), IDLE_DELAY_MS);
    if (!this.maxTimer) this.maxTimer = setTimeout(() => void this.send(false), MAX_WAIT_MS);
  }

  flush() {
    return this.send(false);
  }

  async send(keepalive = false): Promise<void> {
    if (this.snapshot.conflict || !this.hasPending) return;
    // Serialize saves so an older patch can never land after a newer one.
    if (this.inFlight) await this.inFlight;
    if (this.snapshot.conflict || !this.hasPending) return;
    const body = this.pending;
    this.pending = {};
    this.hasPending = false;
    this.clearTimers();
    this.set({ status: 'saving' });
    const run = this.attempt(body, keepalive);
    this.inFlight = run;
    await run;
    this.inFlight = null;
  }

  private request(body: AutosavePatch, keepalive: boolean) {
    const base = this.guarded ? this.base : undefined;
    return this.fetchImpl(`/api/pages/${this.pageId}/autosave`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(base ? { ...body, baseRevision: base } : body),
      credentials: 'include',
      keepalive,
    });
  }

  private async attempt(body: AutosavePatch, keepalive: boolean) {
    try {
      const res = await this.request(body, keepalive);
      if (res.status === 409) {
        const refused = await res.json().catch(() => null);
        if (refused?.code === 'page_revision_conflict' && refused.page) {
          this.refused(body, refused.page, String(refused.currentRevision));
          return;
        }
      }
      if (!res.ok) throw new Error(`autosave ${res.status}`);
      const result = await res.json();
      if (typeof result.revision === 'string') this.base = result.revision;
      if (result.fieldRevisions) this.known = result.fieldRevisions;
      this.failures = 0;
      this.autoRebases = 0;
      this.set({ savedAt: new Date(), status: this.hasPending ? 'pending' : 'saved' });
      this.handlers.onSaved?.(result);
    } catch {
      // Put the failed edits back under any newer ones so a retry sends both.
      this.pending = { ...body, ...this.pending };
      this.hasPending = true;
      this.set({ status: 'error' });
      // Retry on its own, so the last edits are saved even if the user stops typing.
      if (this.mounted) {
        this.failures += 1;
        const delay = Math.min(RETRY_BASE_MS * 2 ** (this.failures - 1), RETRY_MAX_MS);
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => void this.send(false), delay);
      }
    }
  }

  /** The fields being written that also changed in `page`; if none, whatever changed. */
  private collidingFields(page: PageWithRevision): PageField[] {
    const changed = changedSince(this.known, page);
    const written = Object.keys(this.pending) as PageField[];
    const colliding = changed.filter((field) => written.includes(field));
    return colliding.length > 0 ? colliding : changed;
  }

  private refused(body: AutosavePatch, page: PageWithRevision, currentRevision: string) {
    this.pending = { ...body, ...this.pending };
    this.hasPending = true;
    this.failures = 0;
    this.clearTimers();
    const written = Object.keys(this.pending) as PageField[];
    const changed = changedSince(this.known, page);
    const colliding = changed.filter((field) => written.includes(field));
    if (colliding.length === 0 && this.autoRebases < 1) {
      // Nobody touched what is being written: take over the rest and send the same patch again.
      this.autoRebases += 1;
      this.handlers.adopt?.(
        page,
        changed.filter((field) => !written.includes(field))
      );
      this.base = currentRevision;
      this.known = page.fieldRevisions;
      this.set({ status: 'pending' });
      this.idleTimer = setTimeout(() => void this.send(false), 0);
      return;
    }
    this.set({
      status: 'conflict',
      conflict: { page, currentRevision, fields: this.collidingFields(page) },
    });
  }

  /**
   * Save the unsent edits on top of the current page. What else changed in the stored page is
   * shown first, so that after this the screen and the stored page agree in every field.
   */
  keepMine() {
    const open = this.snapshot.conflict;
    if (!open) return;
    const written = Object.keys(this.pending) as PageField[];
    this.handlers.adopt?.(
      open.page,
      changedSince(this.known, open.page).filter((field) => !written.includes(field))
    );
    this.base = open.currentRevision;
    this.known = open.page.fieldRevisions;
    this.autoRebases = 0;
    this.set({ conflict: null, status: 'pending' });
    void this.send(false);
  }

  /**
   * Send the title and body typed so far once more on the old base. The server refuses it and
   * records the refused text as a version; nothing is written. Best effort.
   */
  private async preserveRefused(keepalive: boolean) {
    if (!this.snapshot.conflict || !this.hasPending) return;
    if (this.pending.title === undefined && this.pending.blocks === undefined) return;
    try {
      await this.request(this.pending, keepalive);
    } catch {
      // The text is still on screen; nothing more can be done from here.
    }
  }

  /** Drop the unsent edits and return the page as it is stored now, to show in their place. */
  async loadLatest(): Promise<PageWithRevision | null> {
    const open = this.snapshot.conflict;
    if (!open) return null;
    await this.preserveRefused(false);
    let latest = open.page;
    try {
      const res = await this.fetchImpl(`/api/pages/${this.pageId}`, { credentials: 'include' });
      if (res.ok) latest = await res.json();
    } catch {
      // Show the page as of the refusal rather than nothing.
    }
    this.reset(latest);
    return latest;
  }

  /** Drop unsent edits and take `page` as what the editor shows (after a restore or a reload). */
  reset(page?: Pick<PageWithRevision, 'revision' | 'fieldRevisions'>) {
    this.pending = {};
    this.hasPending = false;
    this.failures = 0;
    this.autoRebases = 0;
    this.clearTimers();
    if (page) {
      this.base = page.revision;
      this.known = page.fieldRevisions;
    }
    this.set({ status: 'idle', conflict: null });
  }

  /**
   * Leaving the page: whatever was typed and is not stored ends up stored or, when it collides
   * with a change made elsewhere, in a "Not saved" version, whichever order the answers come in.
   * A save that is still in flight is waited for first, because its answer (a refusal) decides
   * which of the two the newer text needs.
   */
  leave() {
    const done = (async () => {
      if (this.inFlight) await this.inFlight;
      if (!this.snapshot.conflict) await this.send(true);
      // The save just sent (or the one awaited) may have been refused on a colliding field.
      if (this.snapshot.conflict) await this.preserveRefused(true);
    })();
    return done.finally(() => {
      void this.fetchImpl(`/api/pages/${this.pageId}/checkpoint`, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
      }).catch(() => undefined);
    });
  }

  /** The page view is gone; the final flush is the last attempt, with no retries after it. */
  dispose() {
    this.mounted = false;
    return this.leave();
  }
}
