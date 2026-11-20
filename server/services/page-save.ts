/**
 * One save pipeline for page content (issue #103 E1).
 *
 * Every write of a page's title/content/blocks goes through here, whether it comes from the
 * REST editor (manual save), REST autosave, or the Yjs collaboration server:
 *
 * - `content` is derived from `blocks` on the server as Markdown (#113 §1), the same string the
 *   editor derives in the browser, so the reader, TOC, FTS (`search_vector` trigger) and AI
 *   search always match what was last edited, including Yjs saves.
 * - Manual saves keep their existing behavior: one version snapshot (the pre-save state) per
 *   save, and the caller fires workflows.
 * - Autosaves are grouped into editing sessions. The first autosave of a session snapshots the
 *   pre-session state; later autosaves in the same session record nothing. A session closes
 *   after `idleMs` without saves, on an explicit checkpoint (leaving the page), on a manual
 *   save, or before a restore. Workflows for an autosaved session fire when it closes.
 * - A restore snapshots the current state first, so restoring never loses the latest edit.
 * - A synced block reference stores only its `originalBlockId` (#135): a copy of the original's
 *   content in its `syncedContent` is dropped (`withoutSyncedCopies`), whoever sent it.
 * - A version is only kept when the save changes the title or body (content derived from blocks,
 *   or blocks) compared with the stored page. A save that changes nothing at all, such as the
 *   editor echoing blocks it has just synced, records no version, opens or extends no session,
 *   and skips the write.
 *
 * - A save may name the revision it was based on (`baseRevision`, see page-revision.ts). When the
 *   stored page has moved on, the save is refused with a `PageRevisionConflictError` before
 *   anything is written: no page write, no session, no workflows. The refused text and the page
 *   as it is then are kept as versions, so whichever side the editor gives up on can be
 *   recovered. A save without a base behaves as before (it records the session and version
 *   effects first, then writes); the realtime server does not pass one. A save with a base
 *   records them only after its write went through, so one that loses at the row lock leaves
 *   nothing behind but the versions kept for the refusal. A save that would change nothing is
 *   never refused.
 *
 * Session state lives in this process (the app runs as a single instance); after a restart the
 * next autosave simply starts a new session, which can only add a version, never lose one.
 */
import { and, eq, sql } from 'drizzle-orm';
import { jsonEqual } from '../../shared/json-equal.js';
import {
  pageVersions,
  withPageCover,
  type PageCover,
  type UpdateWikiPage,
  type WikiPage,
} from '../../shared/schema.js';
import { blocksToMarkdown } from '../../shared/block-markdown.js';
import logger from './logger.js';
import { PageRevisionConflictError, pageRevision } from './page-revision.js';

/** Idle time after which an autosave session closes (decision D2 on #103). */
export const AUTOSAVE_SESSION_IDLE_MS = 2 * 60 * 1000;

export type SaveMode = 'manual' | 'autosave';

/**
 * What a save may change: page fields, plus `cover` (issue #134), which is written into
 * `metadata.cover` with the page's other metadata kept (null removes the key). The caller has
 * validated it (`pageCoverSchema`).
 */
export type PageSaveUpdate = UpdateWikiPage & { cover?: PageCover | null };

export interface PageSaveStore {
  getPage(id: number): Promise<WikiPage | undefined>;
  /**
   * Write the update. With `ifRevision`, the stored page must still have that revision at the
   * moment of the write (checked under the row lock, so concurrent saves cannot both pass);
   * otherwise it throws a `PageRevisionConflictError` and writes nothing.
   */
  updatePage(
    id: number,
    data: UpdateWikiPage,
    options?: { ifRevision?: string }
  ): Promise<WikiPage | undefined>;
  /**
   * Record `page` as the next version, with a short description of why it was taken. With
   * `unlessKept`, nothing is recorded when a version already holds this title and body.
   */
  snapshotVersion(
    page: WikiPage,
    description: string,
    options?: { unlessKept?: boolean }
  ): Promise<void>;
}

export interface SaveOptions {
  /** The revision of the page the change was based on; a stale one refuses the save. */
  baseRevision?: string;
}

export interface SessionClosedEvent {
  page: WikiPage;
  /** Tags at the start of the session, so callers can report tags added during it. */
  tagsAtStart: string[];
  reason: 'idle' | 'checkpoint' | 'manual-save' | 'restore';
}

interface EditSession {
  tagsAtStart: string[];
  /** Whether the pre-session version was taken (only once a versioned field changes). */
  snapshotTaken: boolean;
  idleTimer: ReturnType<typeof setTimeout>;
  store: PageSaveStore;
}

const sessions = new Map<number, EditSession>();
let idleMs = AUTOSAVE_SESSION_IDLE_MS;
let onSessionClosed: ((event: SessionClosedEvent) => void) | null = null;

/** Called once at startup so closed autosave sessions can fire workflows. */
export function setSessionClosedHandler(handler: ((event: SessionClosedEvent) => void) | null) {
  onSessionClosed = handler;
}

/** Test hook: shorten the idle window. */
export function setAutosaveIdleMs(ms: number) {
  idleMs = ms;
}

/** Test hook: drop all open sessions without firing handlers. */
export function resetEditSessions() {
  for (const session of sessions.values()) clearTimeout(session.idleTimer);
  sessions.clear();
}

export function hasOpenEditSession(pageId: number): boolean {
  return sessions.has(pageId);
}

/**
 * The Markdown `content` for a block list (#113 §1): headings, lists, to-dos, quotes, code and
 * dividers as Markdown, other blocks as their text, joined by blank lines. The browser derives
 * the same string with the same function (shared/block-markdown.ts), and a page made only of
 * paragraphs derives exactly what the editor produced before (texts joined by blank lines).
 */
export function derivePageContent(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  return blocksToMarkdown(blocks);
}

/**
 * `blocks` without the copies synced block references used to keep of their original (#135).
 * A reference shows the original live, fetched with each viewer's own access, so a copy saved
 * here would show readers of this page content they may not be allowed to read at the source.
 * Originals (`properties.isOriginal`) keep their own content. Returns `blocks` itself when no
 * block carries a copy.
 */
export function withoutSyncedCopies<T>(blocks: T): T {
  if (!Array.isArray(blocks)) return blocks;
  let changed = false;
  const result = blocks.map((block) => {
    const properties = block?.properties;
    if (
      block?.type !== 'synced_block' ||
      !properties ||
      typeof properties !== 'object' ||
      properties.isOriginal === true ||
      !('syncedContent' in properties)
    ) {
      return block;
    }
    changed = true;
    const { syncedContent: _copy, ...rest } = properties as Record<string, unknown>;
    return { ...block, properties: rest };
  });
  return (changed ? result : blocks) as T;
}

function touchesBody(update: UpdateWikiPage) {
  return update.content !== undefined || update.blocks !== undefined;
}

/** Fields a version records; a version is kept once one of them changes. */
const VERSIONED_FIELDS = ['title', 'content', 'blocks'];

/** The fields of `update` whose value differs from what `page` stores. */
function changedFields(page: WikiPage, update: UpdateWikiPage): string[] {
  const stored = page as Record<string, unknown>;
  return Object.entries(update)
    .filter(([key, value]) => value !== undefined && !jsonEqual(value, stored[key]))
    .map(([key]) => key);
}

async function closeSession(pageId: number, reason: SessionClosedEvent['reason']) {
  const session = sessions.get(pageId);
  if (!session) return false;
  clearTimeout(session.idleTimer);
  sessions.delete(pageId);
  if (onSessionClosed) {
    try {
      const page = await session.store.getPage(pageId);
      if (page) onSessionClosed({ page, tagsAtStart: session.tagsAtStart, reason });
    } catch (error) {
      logger.error('Failed to report a closed edit session', {
        pageId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  return true;
}

function armIdleTimer(pageId: number) {
  return setTimeout(() => {
    void closeSession(pageId, 'idle');
  }, idleMs);
}

/**
 * Save a page. Returns the page before and after the write, or undefined when it does not
 * exist. Authorization is the caller's job (route middleware / socket join checks).
 */
export async function savePage(
  store: PageSaveStore,
  pageId: number,
  update: PageSaveUpdate,
  mode: SaveMode,
  options: SaveOptions = {}
): Promise<{ before: WikiPage | undefined; after: WikiPage } | undefined> {
  // Routes only reach here after the page permission check found the page. If it still cannot
  // be read, skip versioning and sessions and let the update decide, as the PUT route did
  // before the pipeline existed.
  const before = await store.getPage(pageId);

  const { cover, ...fields } = update;
  const data: UpdateWikiPage = { ...fields };
  if (data.blocks !== undefined) data.blocks = withoutSyncedCopies(data.blocks);
  // A cover change rewrites the stored metadata with only that key changed. Like an icon, it is
  // not part of a version (versions keep the title and body).
  if (cover !== undefined) {
    data.metadata = withPageCover(
      data.metadata ?? before?.metadata,
      cover
    ) as UpdateWikiPage['metadata'];
  }
  // Autosaves (REST or Yjs) always derive content from blocks. A manual save keeps any content
  // the client sent alongside its blocks, as the editor has always sent both.
  if (data.blocks !== undefined && (mode === 'autosave' || data.content === undefined)) {
    data.content = derivePageContent(data.blocks);
  }

  const { baseRevision } = options;
  const changed = before ? changedFields(before, data) : [];
  const changesVersionedFields = changed.some((field) => VERSIONED_FIELDS.includes(field));

  // A save that would change nothing is not a conflict, whatever its base: nothing is lost by it.
  // It answers with the stored page, whose revision is what the editor bases its next save on.
  // (A manual save still closes the autosave session, as before.)
  if (before && changed.length === 0) {
    if (mode === 'manual') await closeSession(pageId, 'manual-save');
    return { before, after: before };
  }

  if (before && baseRevision !== undefined && baseRevision !== pageRevision(before)) {
    await keepRefusedWrite(store, before, data);
    throw new PageRevisionConflictError(before);
  }

  // What a written save does around the write: close or extend the autosave session and keep the
  // state before it as a version.
  const recordSessionEffects = async () => {
    if (!before) return;
    if (mode === 'manual') {
      // A manual save closes the autosave session.
      await closeSession(pageId, 'manual-save');
      if (touchesBody(data) && changesVersionedFields) {
        await snapshotSafely(store, before, `Version`);
      }
      return;
    }
    let session = sessions.get(pageId);
    if (session) {
      clearTimeout(session.idleTimer);
      session.idleTimer = armIdleTimer(pageId);
    } else {
      session = {
        tagsAtStart: [...before.tags],
        snapshotTaken: false,
        idleTimer: armIdleTimer(pageId),
        store,
      };
      sessions.set(pageId, session);
    }
    // The first change to the title or body in a session keeps the state before it as a version,
    // even when the session started with a tags/folder-only save.
    if (!session.snapshotTaken && changesVersionedFields) {
      session.snapshotTaken = true;
      await snapshotSafely(store, before, 'Before editing session');
    }
  };

  // A save without a base (and the realtime server) records before it writes, as always. A save
  // with a base can still lose at the row lock to a save that landed after the check above; it
  // records only once its write has gone through, so a refused save leaves no session and no
  // version behind but the ones kept for the refusal itself.
  if (baseRevision === undefined) await recordSessionEffects();

  let after: WikiPage | undefined;
  try {
    after = await store.updatePage(
      pageId,
      data,
      baseRevision !== undefined ? { ifRevision: baseRevision } : undefined
    );
  } catch (error) {
    // Someone saved between the check above and the write: same answer as a stale base.
    if (error instanceof PageRevisionConflictError)
      await keepRefusedWrite(store, error.current, data);
    throw error;
  }
  if (after && baseRevision !== undefined) await recordSessionEffects();
  if (!after) return undefined;
  return { before, after };
}

/**
 * A save was refused because the page changed under it. Keep both sides in the version history,
 * so that neither choice the editor offers (load the latest, keep mine) can lose text: the page as
 * it is now (unless a version already holds it) and, when the refused save changes the
 * title or body, the text it carried. The page itself is not written.
 */
async function keepRefusedWrite(store: PageSaveStore, current: WikiPage, data: UpdateWikiPage) {
  await snapshotSafely(store, current, 'Latest when a save was refused', {
    unlessKept: true,
  });
  if (!changedFields(current, data).some((field) => VERSIONED_FIELDS.includes(field))) return;
  const refused = {
    ...current,
    title: data.title ?? current.title,
    content: data.content ?? current.content,
    blocks: data.blocks ?? current.blocks,
  } as WikiPage;
  await snapshotSafely(store, refused, 'Not saved: based on an older revision', {
    unlessKept: true,
  });
}

/** Close the page's autosave session (the editor left the page). */
export async function checkpointPage(pageId: number): Promise<boolean> {
  return closeSession(pageId, 'checkpoint');
}

/**
 * Close the page's autosave session before a restore, so its closing report (workflows) sees the
 * page as the editor left it. The state the restore replaces is kept as a version by the restore
 * itself, in the transaction that locks the page (`DBStorage.restorePageVersion`).
 */
export async function closeSessionForRestore(pageId: number): Promise<boolean> {
  return closeSession(pageId, 'restore');
}

async function snapshotSafely(
  store: PageSaveStore,
  page: WikiPage,
  description: string,
  options?: { unlessKept?: boolean }
) {
  try {
    await store.snapshotVersion(page, description, options);
  } catch (error) {
    // A failed snapshot must not block the save itself (same policy as before E1).
    logger.error('Failed to create page version', {
      pageId: page.id,
      description,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

type DrizzleLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

/** The production store: DBStorage for pages, `page_versions` for snapshots. */
export function storagePageSaveStore(storage: {
  getWikiPage(id: number): Promise<WikiPage | undefined>;
  updateWikiPage(
    id: number,
    page: UpdateWikiPage,
    options?: { ifRevision?: string }
  ): Promise<WikiPage | undefined>;
  db?: DrizzleLike;
}): PageSaveStore {
  return {
    getPage: (id) => storage.getWikiPage(id),
    updatePage: (id, data, options) =>
      options ? storage.updateWikiPage(id, data, options) : storage.updateWikiPage(id, data),
    async snapshotVersion(page, description, options) {
      const db = storage.db;
      if (!db) return;
      if (options?.unlessKept) {
        const sameText = await db
          .select({ blocks: pageVersions.blocks })
          .from(pageVersions)
          .where(
            and(
              eq(pageVersions.pageId, page.id),
              eq(pageVersions.title, page.title),
              eq(pageVersions.content, page.content)
            )
          );
        if (
          sameText.some((row: { blocks: unknown }) =>
            jsonEqual(row.blocks ?? [], page.blocks ?? [])
          )
        ) {
          return;
        }
      }
      const [latest] = await db
        .select({ maxVersion: sql<number>`COALESCE(MAX(${pageVersions.versionNumber}), 0)` })
        .from(pageVersions)
        .where(and(eq(pageVersions.pageId, page.id)));
      const next = Number(latest?.maxVersion || 0) + 1;
      await db.insert(pageVersions).values({
        pageId: page.id,
        title: page.title,
        content: page.content,
        blocks: page.blocks || [],
        author: page.author,
        versionNumber: next,
        changeDescription: description === 'Version' ? `Version ${next}` : description,
      });
    },
  };
}
