/**
 * One save pipeline for page content (issue #103 E1).
 *
 * Every write of a page's title/content/blocks goes through here, whether it comes from the
 * REST editor (manual save), REST autosave, or the Yjs collaboration server:
 *
 * - `content` is derived from `blocks` on the server, in the same format the editor used to
 *   produce in the browser, so the reader, TOC, FTS (`search_vector` trigger) and AI search
 *   always match what was last edited, including Yjs saves.
 * - Manual saves keep their existing behavior: one version snapshot (the pre-save state) per
 *   save, and the caller fires workflows.
 * - Autosaves are grouped into editing sessions. The first autosave of a session snapshots the
 *   pre-session state; later autosaves in the same session record nothing. A session closes
 *   after `idleMs` without saves, on an explicit checkpoint (leaving the page), on a manual
 *   save, or before a restore. Workflows for an autosaved session fire when it closes.
 * - A restore snapshots the current state first, so restoring never loses the latest edit.
 *
 * Session state lives in this process (the app runs as a single instance); after a restart the
 * next autosave simply starts a new session, which can only add a version, never lose one.
 */
import { and, eq, sql } from 'drizzle-orm';
import { pageVersions, type UpdateWikiPage, type WikiPage } from '../../shared/schema.js';
import logger from './logger.js';

/** Idle time after which an autosave session closes (decision D2 on #103). */
export const AUTOSAVE_SESSION_IDLE_MS = 2 * 60 * 1000;

export type SaveMode = 'manual' | 'autosave';

export interface PageSaveStore {
  getPage(id: number): Promise<WikiPage | undefined>;
  updatePage(id: number, data: UpdateWikiPage): Promise<WikiPage | undefined>;
  /** Record `page` as the next version, with a short description of why it was taken. */
  snapshotVersion(page: WikiPage, description: string): Promise<void>;
}

export interface SessionClosedEvent {
  page: WikiPage;
  /** Tags at the start of the session, so callers can report tags added during it. */
  tagsAtStart: string[];
  reason: 'idle' | 'checkpoint' | 'manual-save' | 'restore';
}

interface EditSession {
  tagsAtStart: string[];
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
 * The Markdown-ish `content` for a block list: block contents joined by blank lines, exactly
 * what the editor computed in the browser before E1.
 */
export function derivePageContent(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((block) =>
      block && typeof (block as { content?: unknown }).content === 'string'
        ? (block as { content: string }).content
        : ''
    )
    .join('\n\n');
}

function touchesBody(update: UpdateWikiPage) {
  return update.content !== undefined || update.blocks !== undefined;
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
  update: UpdateWikiPage,
  mode: SaveMode
): Promise<{ before: WikiPage; after: WikiPage } | undefined> {
  const before = await store.getPage(pageId);
  if (!before) return undefined;

  const data: UpdateWikiPage = { ...update };
  // Autosaves (REST or Yjs) always derive content from blocks. A manual save keeps any content
  // the client sent alongside its blocks, as the editor has always sent both.
  if (data.blocks !== undefined && (mode === 'autosave' || data.content === undefined)) {
    data.content = derivePageContent(data.blocks);
  }

  if (mode === 'manual') {
    await closeSession(pageId, 'manual-save');
    if (touchesBody(data)) {
      await snapshotSafely(store, before, `Version`);
    }
  } else {
    const session = sessions.get(pageId);
    if (session) {
      clearTimeout(session.idleTimer);
      session.idleTimer = armIdleTimer(pageId);
    } else {
      if (touchesBody(data)) {
        await snapshotSafely(store, before, 'Before editing session');
      }
      sessions.set(pageId, {
        tagsAtStart: [...before.tags],
        idleTimer: armIdleTimer(pageId),
        store,
      });
    }
  }

  const after = await store.updatePage(pageId, data);
  if (!after) return undefined;
  return { before, after };
}

/** Close the page's autosave session (the editor left the page). */
export async function checkpointPage(pageId: number): Promise<boolean> {
  return closeSession(pageId, 'checkpoint');
}

/** Close any session and snapshot the current state, so a restore never loses the latest edit. */
export async function snapshotBeforeRestore(store: PageSaveStore, pageId: number) {
  await closeSession(pageId, 'restore');
  const current = await store.getPage(pageId);
  if (current) await snapshotSafely(store, current, 'Before restore');
}

async function snapshotSafely(store: PageSaveStore, page: WikiPage, description: string) {
  try {
    await store.snapshotVersion(page, description);
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
  updateWikiPage(id: number, page: UpdateWikiPage): Promise<WikiPage | undefined>;
  db?: DrizzleLike;
}): PageSaveStore {
  return {
    getPage: (id) => storage.getWikiPage(id),
    updatePage: (id, data) => storage.updateWikiPage(id, data),
    async snapshotVersion(page, description) {
      const db = storage.db;
      if (!db) return;
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
