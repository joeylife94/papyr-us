/**
 * The page tree (issue #103 E5): pages nest through `parent_id` and are ordered among their
 * siblings by `position`. This module holds the rules; DBStorage supplies the queries.
 *
 * Server rules (decisions D4/D5 on #103):
 * - a child is in the same team as its parent, or both are personal (team-less);
 * - moving a page needs editor on the page and on the new parent; cycles are refused;
 * - the tree lists only pages the viewer can read, and a readable page whose parent is not
 *   readable is shown at the root with no hint that a parent exists;
 * - trashing a page trashes its whole subtree, only if the caller may delete every page in it;
 *   restoring the page restores the pages that were trashed with it.
 */

export interface PageTreeRow {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  parentId: number | null;
  position: number | null;
  folder: string;
  teamId: number | null;
  updatedAt: Date | string;
  createdAt: Date | string;
}

export interface PageTreeNode {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  /** The parent as the viewer sees it: null at the root, including when the parent is hidden. */
  parentId: number | null;
  position: number | null;
  folder: string;
  updatedAt: Date | string;
  children: PageTreeNode[];
}

const time = (value: Date | string) => new Date(value).getTime();

/** Sibling order: explicit position first (nulls last), then creation time, then id. */
export function compareSiblings(
  a: Pick<PageTreeRow, 'id' | 'position' | 'createdAt'>,
  b: Pick<PageTreeRow, 'id' | 'position' | 'createdAt'>
): number {
  if (a.position !== b.position) {
    if (a.position === null) return 1;
    if (b.position === null) return -1;
    return a.position - b.position;
  }
  return time(a.createdAt) - time(b.createdAt) || a.id - b.id;
}

/**
 * Nest the readable rows into a tree. A row whose parent is not among the rows (unreadable,
 * trashed, or gone) becomes a root and reports `parentId: null`, so nothing about the hidden
 * parent leaks. Rows caught in a parent cycle (possible only in old data) are attached at the
 * root as well, so no readable page is ever dropped.
 */
export function buildPageTree(rows: PageTreeRow[]): PageTreeNode[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const childrenOf = new Map<number, PageTreeRow[]>();
  const roots: PageTreeRow[] = [];
  for (const row of rows) {
    if (row.parentId !== null && row.parentId !== row.id && byId.has(row.parentId)) {
      const list = childrenOf.get(row.parentId) ?? [];
      list.push(row);
      childrenOf.set(row.parentId, list);
    } else {
      roots.push(row);
    }
  }

  const visited = new Set<number>();
  const toNode = (row: PageTreeRow, parentId: number | null): PageTreeNode => {
    visited.add(row.id);
    const children = (childrenOf.get(row.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .sort(compareSiblings)
      .map((child) => toNode(child, row.id));
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      icon: row.icon,
      parentId,
      position: row.position,
      folder: row.folder,
      updatedAt: row.updatedAt,
      children,
    };
  };

  const tree = roots.sort(compareSiblings).map((row) => toNode(row, null));
  // Whatever is still unvisited sits in a cycle: break it at the root, in a stable order.
  for (const row of [...rows].sort(compareSiblings)) {
    if (!visited.has(row.id)) tree.push(toNode(row, null));
  }
  return tree;
}

/**
 * The sibling order after placing `movedId` right after `afterId` (or first when `afterId` is
 * null). `siblings` is the current order and may or may not contain `movedId`.
 */
export function orderWithMove(
  siblings: number[],
  movedId: number,
  afterId: number | null
): number[] {
  const rest = siblings.filter((id) => id !== movedId);
  const index = afterId === null ? 0 : rest.indexOf(afterId) + 1;
  rest.splice(index, 0, movedId);
  return rest;
}

export interface TreeRuleError {
  status: 400 | 403 | 404;
  message: string;
}

/** What the rules need to know about a page. */
export interface TreePage {
  id: number;
  teamId: number | null;
  parentId: number | null;
  deletedAt?: Date | string | null;
}

export interface PageTreeStore {
  getPage(id: number): Promise<TreePage | undefined>;
  canEdit(userId: number | undefined, pageId: number): Promise<boolean>;
  canRead(userId: number | undefined, pageId: number): Promise<boolean>;
  canOwn(userId: number | undefined, pageId: number): Promise<boolean>;
  /** Ids of every live (not trashed) descendant, unreadable ones included. */
  getLiveDescendantIds(pageId: number): Promise<number[]>;
  /**
   * Ids of every descendant, trashed ones included: a trashed page can be restored, so a link
   * through it still counts when checking for cycles.
   */
  getAllDescendantIds(pageId: number): Promise<number[]>;
}

const PARENT_REFUSED: TreeRuleError = {
  status: 403,
  message: '이 문서를 상위 문서로 지정할 수 없습니다',
};

/**
 * Whether `parentId` may become the parent of a page in team `teamId` (the page itself when
 * `pageId` is set). A missing, trashed, or non-editable parent gets the same 403, so the answer
 * does not reveal whether a page id exists.
 */
export async function checkParent(
  store: PageTreeStore,
  userId: number | undefined,
  parentId: number,
  page: { id?: number; teamId: number | null }
): Promise<TreeRuleError | null> {
  if (page.id !== undefined && parentId === page.id) {
    return { status: 400, message: '문서를 자기 자신 아래로 옮길 수 없습니다' };
  }
  const parent = await store.getPage(parentId);
  if (!parent || parent.deletedAt || !(await store.canEdit(userId, parentId))) {
    return PARENT_REFUSED;
  }
  if ((parent.teamId ?? null) !== (page.teamId ?? null)) {
    return { status: 403, message: '다른 워크스페이스의 문서 아래로 옮길 수 없습니다' };
  }
  if (page.id !== undefined) {
    const descendants = await store.getAllDescendantIds(page.id);
    if (descendants.includes(parentId)) {
      return { status: 400, message: '문서를 자신의 하위 문서 아래로 옮길 수 없습니다' };
    }
  }
  return null;
}

/**
 * The pages a delete of `pageId` trashes (the page and its live descendants), or the reason it
 * is refused: every one of them needs owner, as deleting a single page does.
 */
export async function subtreeForTrash(
  store: PageTreeStore,
  userId: number | undefined,
  pageId: number
): Promise<{ ids: number[] } | { error: TreeRuleError }> {
  const ids = [pageId, ...(await store.getLiveDescendantIds(pageId))];
  for (const id of ids.slice(1)) {
    if (!(await store.canOwn(userId, id))) {
      return {
        error: {
          status: 403,
          message:
            '삭제할 권한이 없는 하위 문서가 있어 삭제할 수 없습니다. 하위 문서를 먼저 옮기거나 소유자에게 요청하세요.',
        },
      };
    }
  }
  return { ids };
}
