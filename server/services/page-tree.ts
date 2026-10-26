/**
 * Page tree rules (#103 E5, decisions D4/D5) that do not need the database: how the rows a viewer
 * can read become their tree, and where a moved page lands among its siblings.
 *
 * The tree a viewer sees is built only from pages they can read. A page whose parent is not among
 * them (unreadable, trashed, another workspace, or gone) is shown at the root, with no sign that
 * it has a parent: its `parentId` is null and its `position` is its place among the root pages
 * (D4). Positions in a response are always 0..n-1 per sibling list, so gaps left by pages the
 * viewer cannot read never show.
 */

/** A readable page as the tree query loads it (never content). */
export interface PageTreeRow {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  parentId: number | null;
  position: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A page in the tree response: `parentId`/`position` as this viewer sees them. */
export interface PageTreeNode {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  parentId: number | null;
  position: number;
  updatedAt: Date;
}

/** A breadcrumb entry above a page (GET /api/pages/:id/ancestors). */
export interface PageAncestor {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
}

/** What DBStorage.movePage did; the route maps it to a status code. */
export type PageMoveResult =
  | { status: 'moved'; page: { id: number; parentId: number | null } }
  | { status: 'not-found' | 'parent-not-found' | 'cross-team' | 'cycle' };

/** A page in the trash listing (GET /api/trash): never content. */
export interface TrashedPage {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  folder: string;
  author: string;
  teamId: number | null;
  deletedAt: Date | null;
  updatedAt: Date;
}

/** Name of the advisory lock that serializes page tree writes within one workspace scope. */
export const PAGE_TREE_LOCK_NAME = 'papyrus.page_tree';

/** Highest sibling index the move route accepts (larger values are a client bug). */
export const MAX_TREE_INDEX = 100_000;

/** How far up the breadcrumb walks; deeper chains are cut (they only exist in broken data). */
export const MAX_ANCESTOR_DEPTH = 64;

interface Orderable {
  id: number;
  position: number | null;
  createdAt: Date;
}

/** Sibling order: stored position (unpositioned pages last), then creation, then id. */
export function compareSiblingOrder(a: Orderable, b: Orderable): number {
  if (a.position !== b.position) {
    if (a.position === null) return 1;
    if (b.position === null) return -1;
    return a.position - b.position;
  }
  const created = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return created !== 0 ? created : a.id - b.id;
}

/**
 * The tree of `rows` (the pages one viewer can read in one scope), depth first: each page is
 * followed by its sub-pages, siblings in order.
 *
 * - A parent outside `rows` makes the page a root page; its stored position is relative to
 *   siblings the viewer may not see, so it sorts like an unpositioned page.
 * - Parent links that loop (only possible in data written before the tree rules) are cut at
 *   the first page of the loop in sibling order, so every readable page is shown once.
 */
export function buildPageTree(rows: PageTreeRow[]): PageTreeNode[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const parentOf = new Map<number, number | null>();
  const sortKey = new Map<number, Orderable>();
  for (const row of rows) {
    const parentId =
      row.parentId !== null && row.parentId !== row.id && byId.has(row.parentId)
        ? row.parentId
        : null;
    parentOf.set(row.id, parentId);
    sortKey.set(row.id, {
      id: row.id,
      position: parentId === null && row.parentId !== null ? null : row.position,
      createdAt: row.createdAt,
    });
  }

  // Ordered children lists, rebuilt when a loop is cut.
  let children = new Map<number | null, number[]>();
  const rebuild = () => {
    const groups = new Map<number | null, Orderable[]>();
    for (const row of rows) {
      const parentId = parentOf.get(row.id)!;
      const group = groups.get(parentId) ?? [];
      group.push(sortKey.get(row.id)!);
      groups.set(parentId, group);
    }
    children = new Map();
    for (const [parentId, group] of groups) {
      children.set(
        parentId,
        group.sort(compareSiblingOrder).map((key) => key.id)
      );
    }
  };
  rebuild();

  const visited = new Set<number>();
  const mark = (id: number) => {
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(children.get(current) ?? []));
    }
  };
  for (const id of children.get(null) ?? []) mark(id);

  // Whatever is still unvisited hangs off a loop: lift the first such page to the root.
  while (visited.size < rows.length) {
    const first = rows
      .filter((row) => !visited.has(row.id))
      .map((row) => sortKey.get(row.id)!)
      .sort(compareSiblingOrder)[0];
    parentOf.set(first.id, null);
    sortKey.set(first.id, { ...first, position: null });
    rebuild();
    mark(first.id);
  }

  const result: PageTreeNode[] = [];
  const emit = (parentId: number | null) => {
    (children.get(parentId) ?? []).forEach((id, index) => {
      const row = byId.get(id)!;
      result.push({
        id: row.id,
        title: row.title,
        slug: row.slug,
        icon: row.icon,
        parentId,
        position: index,
        updatedAt: row.updatedAt,
      });
      emit(id);
    });
  };
  emit(null);
  return result;
}

/**
 * The new order of a sibling list after `pageId` moves into it at `index`.
 *
 * `index` counts the siblings the viewer sees (`visibleIds`, in their tree order, without the
 * moved page); `siblingIds` is the stored list (every live sibling, readable or not, in sibling
 * order). The page goes right before the sibling the viewer saw at `index`; when that one is not
 * a stored sibling (a page shown at the root because its own parent is hidden), before the next
 * one that is; at the end when there is none. Siblings the viewer cannot see keep their order.
 */
export function planSiblingOrder(
  siblingIds: number[],
  visibleIds: number[],
  index: number,
  pageId: number
): number[] {
  const stored = siblingIds.filter((id) => id !== pageId);
  const visible = visibleIds.filter((id) => id !== pageId);
  let insertAt = stored.length;
  for (let i = Math.max(0, index); i < visible.length; i += 1) {
    const at = stored.indexOf(visible[i]);
    if (at !== -1) {
      insertAt = at;
      break;
    }
  }
  return [...stored.slice(0, insertAt), pageId, ...stored.slice(insertAt)];
}
