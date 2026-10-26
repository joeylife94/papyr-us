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
 * - An icon-only autosave (#103 E4) stays outside sessions: no version, no workflow.
 * - A restore snapshots the current state first, so restoring never loses the latest edit.
 *
 * Session state lives in this process (the app runs as a single instance); after a restart the
 * next autosave simply starts a new session, which can only add a version, never lose one.
 *
 * Page links (#103 E6): after a write that changes the body, the page's rows in `page_links` are
 * replaced with the pages its link tokens point to. Page creation and version restore write the
 * body outside `savePage` and index through `indexNewPageLinks` / `writeRestoredPage`.
 */
import { and, eq, sql } from 'drizzle-orm';
import { pageVersions, type UpdateWikiPage, type WikiPage } from '../../shared/schema.js';
import { extractPageLinkIds, extractPageLinkIdsFromText } from '../../shared/page-links.js';
import { blocksToMarkdown } from '../../shared/block-markdown.js';
import logger from './logger.js';

/** Idle time after which an autosave session closes (decision D2 on #103). */
export const AUTOSAVE_SESSION_IDLE_MS = 2 * 60 * 1000;

export type SaveMode = 'manual' | 'autosave';

export interface PageSaveStore {
  getPage(id: number): Promise<WikiPage | undefined>;
  updatePage(id: number, data: UpdateWikiPage): Promise<WikiPage | undefined>;
  /** Record `page` as the next version, with a short description of why it was taken. */
  snapshotVersion(page: WikiPage, description: string): Promise<void>;
  /**
   * Replace the outgoing links of `pageId` with `targetIds` in one transaction (`page_links`,
   * #103 E6). Ids of pages that do not exist are skipped.
   */
  /**
   * Replace the page's outgoing links. `expectedContent` is the content the write produced; the
   * store may skip the sync when a later write has already changed it (that write syncs itself).
   */
  syncLinks(pageId: number, targetIds: number[], expectedContent?: string): Promise<void>;
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
 * Pages a body links to (#103 E6): the tokens in its blocks, or in `content` when it has no
 * blocks (content-only writes, API- and template-created pages). Distinct, without self-links.
 *
 * The index records every target the author typed, including pages the author cannot read
 * (a token is only an id). That is harmless only because every read of `page_links` (backlinks,
 * graph) filters BOTH ends for the viewer: keep it that way.
 */
export function pageLinkTargets(
  pageId: number,
  body: { blocks?: unknown; content?: unknown }
): number[] {
  const ids =
    Array.isArray(body.blocks) && body.blocks.length > 0
      ? extractPageLinkIds(body.blocks)
      : extractPageLinkIdsFromText(typeof body.content === 'string' ? body.content : '');
  return ids.filter((id) => id !== pageId);
}

function sameBody(before: WikiPage, after: WikiPage) {
  return (
    before.content === after.content &&
    JSON.stringify(before.blocks ?? []) === JSON.stringify(after.blocks ?? [])
  );
}

function touchesBody(update: UpdateWikiPage) {
  return update.content !== undefined || update.blocks !== undefined;
}

/** Fields a version records; an autosave session keeps a version once one of them changes. */
function touchesVersionedFields(update: UpdateWikiPage) {
  return touchesBody(update) || update.title !== undefined;
}

/**
 * An icon-only save (#103 E4). The icon is an editor-level change: it is neither versioned nor
 * part of an editing session, so it records no version and fires no workflow.
 */
function onlyIcon(update: UpdateWikiPage) {
  const fields = Object.keys(update).filter(
    (key) => update[key as keyof UpdateWikiPage] !== undefined
  );
  return fields.length > 0 && fields.every((key) => key === 'icon');
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
): Promise<{ before: WikiPage | undefined; after: WikiPage } | undefined> {
  // Routes only reach here after the page permission check found the page. If it still cannot
  // be read, skip versioning and sessions and let the update decide, as the PUT route did
  // before the pipeline existed.
  const before = await store.getPage(pageId);

  const data: UpdateWikiPage = { ...update };
  // Autosaves (REST or Yjs) always derive content from blocks. A manual save keeps any content
  // the client sent alongside its blocks, as the editor has always sent both.
  if (data.blocks !== undefined && (mode === 'autosave' || data.content === undefined)) {
    data.content = derivePageContent(data.blocks);
  }

  if (!before) {
    // Nothing to snapshot.
  } else if (mode === 'autosave' && onlyIcon(data)) {
    // Saved as is, outside any editing session.
  } else if (mode === 'manual') {
    await closeSession(pageId, 'manual-save');
    if (touchesBody(data)) {
      await snapshotSafely(store, before, `Version`);
    }
  } else {
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
    if (!session.snapshotTaken && touchesVersionedFields(data)) {
      session.snapshotTaken = true;
      await snapshotSafely(store, before, 'Before editing session');
    }
  }

  const after = await store.updatePage(pageId, data);
  if (!after) return undefined;

  // The links follow what this write carried: its blocks, or its content when it sent only that.
  if (touchesBody(data) && (!before || !sameBody(before, after))) {
    const body = data.blocks !== undefined ? data : { content: data.content };
    await syncLinksSafely(store, pageId, pageLinkTargets(pageId, body), after.content);
  }
  return { before, after };
}

/** Index the links of a page that was just created (POST /api/pages, duplicate, import). */
export async function indexNewPageLinks(
  store: PageSaveStore,
  page: Pick<WikiPage, 'id' | 'blocks' | 'content'>
) {
  const targets = pageLinkTargets(page.id, page);
  // A new page has no rows yet, so there is nothing to replace when it links nowhere.
  if (targets.length > 0) await syncLinksSafely(store, page.id, targets, page.content);
}

/**
 * Write a restored version's title and body (after `snapshotBeforeRestore`) and re-index its
 * links, so backlinks match the restored page.
 */
export async function writeRestoredPage(
  store: PageSaveStore,
  pageId: number,
  version: { title: string; content: string; blocks: unknown }
): Promise<WikiPage | undefined> {
  const after = await store.updatePage(pageId, {
    title: version.title,
    content: version.content,
    blocks: version.blocks as UpdateWikiPage['blocks'],
  });
  if (after) await syncLinksSafely(store, pageId, pageLinkTargets(pageId, version), after.content);
  return after;
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

async function syncLinksSafely(
  store: PageSaveStore,
  pageId: number,
  targetIds: number[],
  expectedContent: string
) {
  try {
    await store.syncLinks(pageId, targetIds, expectedContent);
  } catch (error) {
    // The link index is derived data: a failed sync must not fail the save, and the next body
    // change rebuilds the page's rows. Stale rows never reveal anything (reads filter both ends).
    logger.error('Failed to update page links', {
      pageId,
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
  replacePageLinks?(
    sourcePageId: number,
    targetIds: number[],
    options?: { expectedContent?: string }
  ): Promise<void>;
  db?: DrizzleLike;
}): PageSaveStore {
  return {
    getPage: (id) => storage.getWikiPage(id),
    updatePage: (id, data) => storage.updateWikiPage(id, data),
    async syncLinks(pageId, targetIds, expectedContent) {
      if (!storage.replacePageLinks) return;
      await storage.replacePageLinks(pageId, targetIds, { expectedContent });
    },
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
