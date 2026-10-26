/**
 * Pure helpers for the sidebar page tree (#103 E5): the visible rows of the flat
 * GET /api/pages/tree list, and where a drag, a keyboard move or a menu action puts a page.
 *
 * A move target is `{ parentId, index }` exactly as POST /api/pages/:id/move takes it: `index`
 * counts the siblings this viewer sees under the new parent, without the moved page.
 */

/** A page of GET /api/pages/tree (never content). */
export interface TreePage {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  parentId: number | null;
  position: number;
  updatedAt: string;
}

export interface TreeIndex {
  byId: Map<number, TreePage>;
  /** Children in sibling order; `null` holds the root pages. */
  children: Map<number | null, TreePage[]>;
}

export interface TreeRow {
  page: TreePage;
  /** 1-based depth (aria-level). */
  level: number;
  /** Number of siblings, and the 1-based place among them (aria-setsize / aria-posinset). */
  setSize: number;
  posInSet: number;
  hasChildren: boolean;
  expanded: boolean;
}

export interface MoveTarget {
  parentId: number | null;
  index: number;
}

export type KeyboardMove = 'up' | 'down' | 'in' | 'out';

export function indexTree(pages: TreePage[]): TreeIndex {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const children = new Map<number | null, TreePage[]>();
  pages.forEach((page) => {
    // A parent missing from the list (it should not be) makes the page a root page.
    const parentId = page.parentId !== null && byId.has(page.parentId) ? page.parentId : null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(page);
    children.set(parentId, siblings);
  });
  children.forEach((siblings) => siblings.sort((a, b) => a.position - b.position));
  return { byId, children };
}

const childrenOf = (tree: TreeIndex, id: number | null) => tree.children.get(id) ?? [];

const parentOf = (tree: TreeIndex, id: number): number | null => {
  const parentId = tree.byId.get(id)?.parentId ?? null;
  return parentId !== null && tree.byId.has(parentId) ? parentId : null;
};

/** Ids above a page, nearest first. */
export function ancestorIds(tree: TreeIndex, id: number): number[] {
  const result: number[] = [];
  let current = parentOf(tree, id);
  while (current !== null && !result.includes(current)) {
    result.push(current);
    current = parentOf(tree, current);
  }
  return result;
}

/** Ids below a page at any depth. */
export function descendantIds(tree: TreeIndex, id: number): Set<number> {
  const result = new Set<number>();
  const stack = [...childrenOf(tree, id)];
  while (stack.length) {
    const page = stack.pop()!;
    if (result.has(page.id)) continue;
    result.add(page.id);
    stack.push(...childrenOf(tree, page.id));
  }
  return result;
}

/**
 * The rows on screen: expanded pages show their children. `hidden` pages (the sub-pages of the
 * page being dragged) are left out. With a `filter`, only pages whose title contains it are
 * shown, with their ancestors, all expanded.
 */
export function visibleRows(
  tree: TreeIndex,
  expanded: ReadonlySet<number>,
  options: { hidden?: ReadonlySet<number>; filter?: string } = {}
): TreeRow[] {
  const query = options.filter?.trim().toLowerCase() ?? '';
  let shown: Set<number> | null = null;
  if (query) {
    shown = new Set();
    tree.byId.forEach((page) => {
      if (!page.title.toLowerCase().includes(query)) return;
      shown!.add(page.id);
      ancestorIds(tree, page.id).forEach((id) => shown!.add(id));
    });
  }

  const rows: TreeRow[] = [];
  const seen = new Set<number>();
  const walk = (parentId: number | null, level: number) => {
    const siblings = childrenOf(tree, parentId).filter(
      (page) => !options.hidden?.has(page.id) && (!shown || shown.has(page.id))
    );
    siblings.forEach((page, i) => {
      if (seen.has(page.id)) return;
      seen.add(page.id);
      const kids = childrenOf(tree, page.id).filter((child) => !shown || shown.has(child.id));
      const isExpanded = kids.length > 0 && (!!shown || expanded.has(page.id));
      rows.push({
        page,
        level,
        setSize: siblings.length,
        posInSet: i + 1,
        hasChildren: kids.length > 0,
        expanded: isExpanded,
      });
      if (isExpanded) walk(page.id, level + 1);
    });
  };
  walk(null, 1);
  return rows;
}

/** A page's place among its siblings. */
export function placeOf(tree: TreeIndex, id: number): MoveTarget {
  const parentId = parentOf(tree, id);
  return { parentId, index: childrenOf(tree, parentId).findIndex((page) => page.id === id) };
}

export const sameTarget = (a: MoveTarget, b: MoveTarget) =>
  a.parentId === b.parentId && a.index === b.index;

/**
 * Where a page dropped between two rows lands. `rows` are the rows during the drag without the
 * dragged page (its sub-pages are hidden while it is dragged); `destination` is the drop index in
 * that list. The page becomes the sibling just before the row below the gap, or, at the end of
 * the list, the sibling just after the last row.
 */
export function dropTarget(
  tree: TreeIndex,
  rows: TreeRow[],
  destination: number,
  draggedId: number
): MoveTarget {
  const siblingIndex = (parentId: number | null, id: number) =>
    childrenOf(tree, parentId)
      .filter((page) => page.id !== draggedId)
      .findIndex((page) => page.id === id);
  const below = rows[destination];
  if (below) {
    const parentId = parentOf(tree, below.page.id);
    return { parentId, index: siblingIndex(parentId, below.page.id) };
  }
  const above = rows[destination - 1];
  if (above) {
    const parentId = parentOf(tree, above.page.id);
    return { parentId, index: siblingIndex(parentId, above.page.id) + 1 };
  }
  return { parentId: null, index: 0 };
}

/** Dropping a page onto another row: it becomes that page's last sub-page. */
export function nestTarget(tree: TreeIndex, parentId: number, draggedId: number): MoveTarget {
  return {
    parentId,
    index: childrenOf(tree, parentId).filter((page) => page.id !== draggedId).length,
  };
}

/**
 * The keyboard and menu moves: one place up or down among the siblings, into the previous
 * sibling (as its last sub-page), or out to just after the parent. Null when not possible.
 */
export function keyboardMoveTarget(
  tree: TreeIndex,
  id: number,
  move: KeyboardMove
): MoveTarget | null {
  const { parentId, index } = placeOf(tree, id);
  const siblings = childrenOf(tree, parentId);
  if (index < 0) return null;
  switch (move) {
    case 'up':
      return index > 0 ? { parentId, index: index - 1 } : null;
    case 'down':
      return index < siblings.length - 1 ? { parentId, index: index + 1 } : null;
    case 'in': {
      const previous = siblings[index - 1];
      return previous ? nestTarget(tree, previous.id, id) : null;
    }
    case 'out': {
      if (parentId === null) return null;
      const outer = placeOf(tree, parentId);
      return { parentId: outer.parentId, index: outer.index + 1 };
    }
  }
}

/** The list after a move, for an optimistic update (positions renumbered per sibling list). */
export function applyMove(pages: TreePage[], id: number, target: MoveTarget): TreePage[] {
  const tree = indexTree(pages);
  const moved = tree.byId.get(id);
  if (!moved) return pages;
  const from = parentOf(tree, id);
  const positions = new Map<number, { parentId: number | null; position: number }>();
  const destination = childrenOf(tree, target.parentId).filter((page) => page.id !== id);
  destination.splice(Math.min(Math.max(target.index, 0), destination.length), 0, moved);
  destination.forEach((page, position) =>
    positions.set(page.id, { parentId: target.parentId, position })
  );
  if (from !== target.parentId) {
    childrenOf(tree, from)
      .filter((page) => page.id !== id)
      .forEach((page, position) => positions.set(page.id, { parentId: from, position }));
  }
  return pages.map((page) => {
    const next = positions.get(page.id);
    return next ? { ...page, ...next } : page;
  });
}

/** Screen reader text for a finished move, in Korean. */
export function describeMove(tree: TreeIndex, id: number, target: MoveTarget): string {
  const title = tree.byId.get(id)?.title || '제목 없음';
  const where =
    target.parentId === null
      ? '최상위'
      : `"${tree.byId.get(target.parentId)?.title || '제목 없음'}" 안`;
  return `"${title}" 문서를 ${where} ${target.index + 1}번째 위치로 옮겼습니다`;
}
