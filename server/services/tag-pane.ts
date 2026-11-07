/**
 * The tag pane (#137): every tag of one workspace scope with page counts, and the pages of a tag.
 *
 * A page's tags are its `tags` field plus the `#tags` of its Markdown content, read at query time
 * with the grammar the chips use (shared/tags.ts); nothing is stored or indexed. Only live pages
 * of the scope the viewer can list are read (`readablePagesInScope`), so a tag used only on
 * pages the viewer cannot list never appears, and no count includes such a page.
 *
 * The work is bounded (`TAG_PANE_LIMITS`): the most recently updated pages of the scope, the
 * start of each page's content, and a capped tag list. Responses say when a cap was reached.
 */
import type { DBStorage, PageViewer } from '../storage.js';
import { countTags, isInTagTree, pageTags, type TagCount } from '../../shared/tags.js';

export const TAG_PANE_LIMITS = Object.freeze({
  /** Pages read per request: the scope's most recently updated pages. */
  scannedPages: 1000,
  /** Characters of each page's content read for inline `#tags`. */
  contentChars: 50_000,
  /** Pages whose content is loaded at once. */
  contentBatch: 100,
  /** Tags (nested parents included) returned by the tag list. */
  tags: 1000,
  /** Pages returned for one tag. */
  pages: 200,
});

/** A page as the tag pane reads it: no body. */
export interface TagPaneRow {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  teamId: number | null;
  updatedAt: Date;
  tags: string[] | null;
}

type TagPaneStorage = Pick<DBStorage, 'getTagPaneRows' | 'getTagPaneContent'>;

interface ScannedPage extends TagPaneRow {
  /** Normalized tags of the field and the content (see `pageTags`). */
  allTags: string[];
}

/** The scope's pages with their tags, most recently updated first. */
async function scanTaggedPages(
  storage: TagPaneStorage,
  viewer: PageViewer,
  teamId: number | null
): Promise<{ pages: ScannedPage[]; truncated: boolean }> {
  const rows = await storage.getTagPaneRows(viewer, teamId, TAG_PANE_LIMITS.scannedPages + 1);
  const truncated = rows.length > TAG_PANE_LIMITS.scannedPages;
  const scanned = truncated ? rows.slice(0, TAG_PANE_LIMITS.scannedPages) : rows;

  const inline = new Map<number, string>();
  const pages: ScannedPage[] = [];
  for (let at = 0; at < scanned.length; at += TAG_PANE_LIMITS.contentBatch) {
    const batch = scanned.slice(at, at + TAG_PANE_LIMITS.contentBatch);
    inline.clear();
    const contents = await storage.getTagPaneContent(
      viewer,
      teamId,
      batch.map((row) => row.id),
      TAG_PANE_LIMITS.contentChars
    );
    for (const { id, content } of contents) inline.set(id, content);
    for (const row of batch) {
      pages.push({ ...row, allTags: pageTags(row.tags, inline.get(row.id)) });
    }
  }
  return { pages, truncated };
}

export interface TagPaneList {
  tags: TagCount[];
  /** Pages read for the counts. */
  scannedPages: number;
  truncated: { pages: boolean; tags: boolean };
}

/** Every tag of the scope, nested parents included, with distinct page counts. */
export async function getTagPaneList(
  storage: TagPaneStorage,
  viewer: PageViewer,
  teamId: number | null
): Promise<TagPaneList> {
  const { pages, truncated } = await scanTaggedPages(storage, viewer, teamId);
  const counted = countTags(
    pages.map((page) => page.allTags),
    TAG_PANE_LIMITS.tags
  );
  return {
    tags: counted.tags,
    scannedPages: pages.length,
    truncated: { pages: truncated, tags: counted.truncated },
  };
}

export interface TagPanePage {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  teamId: number | null;
  updatedAt: Date;
  /** The page's tags under the selected one (the selected tag itself included). */
  tags: string[];
}

export interface TagPanePages {
  tag: string;
  pages: TagPanePage[];
  /** Pages of the tag among the pages read (`pages` holds at most `TAG_PANE_LIMITS.pages`). */
  total: number;
  truncated: { pages: boolean; results: boolean };
}

/** Pages carrying `tag` or a tag nested under it, most recently updated first. */
export async function getTagPanePages(
  storage: TagPaneStorage,
  viewer: PageViewer,
  teamId: number | null,
  tag: string
): Promise<TagPanePages> {
  const { pages, truncated } = await scanTaggedPages(storage, viewer, teamId);
  const matching: TagPanePage[] = [];
  for (const page of pages) {
    const tags = page.allTags.filter((pageTag) => isInTagTree(pageTag, tag));
    if (tags.length === 0) continue;
    matching.push({
      id: page.id,
      title: page.title,
      slug: page.slug,
      icon: page.icon,
      teamId: page.teamId,
      updatedAt: page.updatedAt,
      tags,
    });
  }
  return {
    tag,
    pages: matching.slice(0, TAG_PANE_LIMITS.pages),
    total: matching.length,
    truncated: { pages: truncated, results: matching.length > TAG_PANE_LIMITS.pages },
  };
}
