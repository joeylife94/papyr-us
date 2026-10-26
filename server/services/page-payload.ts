/**
 * Page rows as one viewer may see them (#103 E5, D4). The stored tree fields describe the whole
 * workspace, so a page payload never carries them as stored:
 * - `parentId` is kept only when the parent is live, readable by the viewer and in the page's own
 *   scope; otherwise the page is a root page for this viewer (null), exactly as in the tree, so a
 *   payload never hints that a hidden parent exists;
 * - `position` is always null: it counts siblings the viewer may not see. Order comes from
 *   GET /api/pages/tree.
 * Rows without these fields are returned unchanged. One query per response looks up every parent.
 */
import type { DBStorage } from '../storage.js';

type PayloadStorage = Pick<DBStorage, 'getPageViewer' | 'getReadableLiveParents'>;

interface TreeFields {
  parentId?: number | null;
  position?: number | null;
  teamId?: number | null;
}

export async function presentPages<T extends TreeFields>(
  storage: PayloadStorage,
  userId: number | undefined,
  pages: T[]
): Promise<T[]> {
  const parentIds = Array.from(
    new Set(
      pages.map((page) => page?.parentId).filter((id): id is number => typeof id === 'number')
    )
  );
  let parents = new Map<number, number | null>();
  if (parentIds.length > 0) {
    const viewer = await storage.getPageViewer(userId);
    parents = (await storage.getReadableLiveParents(viewer, parentIds)) ?? parents;
  }
  return pages.map((page) => {
    if (!page || typeof page !== 'object') return page;
    const shown: T = { ...page };
    if ('parentId' in page) {
      const parentId = page.parentId ?? null;
      const visible =
        parentId !== null &&
        parents.has(parentId) &&
        parents.get(parentId) === (page.teamId ?? null);
      shown.parentId = visible ? parentId : null;
    }
    if ('position' in page) shown.position = null;
    return shown;
  });
}

export async function presentPage<T extends TreeFields>(
  storage: PayloadStorage,
  userId: number | undefined,
  page: T
): Promise<T> {
  return (await presentPages(storage, userId, [page]))[0];
}
