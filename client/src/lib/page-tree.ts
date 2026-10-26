/**
 * Client-side page tree helpers (issue #103 E5): the sidebar renders the visible part of the tree
 * as one flat list (ARIA tree with aria-level), so drag and drop and keyboard moves are computed
 * here and sent to POST /api/pages/:id/move as `{ parentId, afterId }`.
 */

export interface PageTreeNode {
  id: number;
  title: string;
  slug: string;
  icon: string | null;
  parentId: number | null;
  position: number | null;
  folder: string;
  updatedAt: string;
  children: PageTreeNode[];
}

export interface VisibleNode {
  node: PageTreeNode;
  depth: number;
  parentId: number | null;
  /** Index among its siblings, and how many siblings there are (aria-posinset/setsize). */
  index: number;
  siblingCount: number;
  hasChildren: boolean;
  expanded: boolean;
}

export interface TreeMove {
  parentId: number | null;
  afterId: number | null;
}

/** The rows the sidebar shows: roots, plus the children of expanded pages, in order. */
export function flattenVisible(
  tree: PageTreeNode[],
  expanded: ReadonlySet<number>,
  /** While dragging a page, its subtree is hidden (it moves with the page). */
  collapsedId: number | null = null
): VisibleNode[] {
  const out: VisibleNode[] = [];
  const walk = (nodes: PageTreeNode[], depth: number, parentId: number | null) => {
    nodes.forEach((node, index) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = hasChildren && expanded.has(node.id) && node.id !== collapsedId;
      out.push({
        node,
        depth,
        parentId,
        index,
        siblingCount: nodes.length,
        hasChildren,
        expanded: isExpanded,
      });
      if (isExpanded) walk(node.children, depth + 1, node.id);
    });
  };
  walk(tree, 0, null);
  return out;
}

interface Located {
  node: PageTreeNode;
  parent: PageTreeNode | null;
  siblings: PageTreeNode[];
  index: number;
}

export function locate(tree: PageTreeNode[], id: number): Located | null {
  const walk = (nodes: PageTreeNode[], parent: PageTreeNode | null): Located | null => {
    for (const [index, node] of nodes.entries()) {
      if (node.id === id) return { node, parent, siblings: nodes, index };
      const found = walk(node.children, node);
      if (found) return found;
    }
    return null;
  };
  return walk(tree, null);
}

/** Ids from the root down to (not including) the page: the pages to expand to reveal it. */
export function ancestorIds(tree: PageTreeNode[], id: number): number[] {
  const path: number[] = [];
  const walk = (nodes: PageTreeNode[]): boolean => {
    for (const node of nodes) {
      if (node.id === id) return true;
      path.push(node.id);
      if (walk(node.children)) return true;
      path.pop();
    }
    return false;
  };
  return walk(tree) ? path : [];
}

function isWithin(tree: PageTreeNode[], ancestorId: number, id: number): boolean {
  const ancestor = locate(tree, ancestorId);
  if (!ancestor) return false;
  const walk = (nodes: PageTreeNode[]): boolean =>
    nodes.some((n) => n.id === id || walk(n.children));
  return ancestorId === id || walk(ancestor.node.children);
}

function childrenOf(tree: PageTreeNode[], parentId: number | null): PageTreeNode[] {
  if (parentId === null) return tree;
  return locate(tree, parentId)?.node.children ?? [];
}

function unchanged(tree: PageTreeNode[], id: number, move: TreeMove): boolean {
  const here = locate(tree, id);
  if (!here) return true;
  const currentParent = here.parent?.id ?? null;
  const currentAfter = here.index > 0 ? here.siblings[here.index - 1].id : null;
  return currentParent === move.parentId && currentAfter === move.afterId;
}

/**
 * Where a drop puts the dragged page. `visible` is the list as rendered during the drag (the
 * dragged page's subtree hidden). Dropping onto a page (`combineId`) makes it that page's last
 * child; dropping into the list places it just before the row that ends up below it, at that
 * row's level, or at the end of the root level when dropped last. Returns null for no change.
 */
export function dropToMove(
  tree: PageTreeNode[],
  visible: VisibleNode[],
  draggedId: number,
  destinationIndex: number | null,
  combineId: number | null
): TreeMove | null {
  let move: TreeMove | null = null;
  if (combineId !== null) {
    if (isWithin(tree, draggedId, combineId)) return null;
    const children = childrenOf(tree, combineId).filter((c) => c.id !== draggedId);
    move = { parentId: combineId, afterId: children.at(-1)?.id ?? null };
  } else if (destinationIndex !== null) {
    const rest = visible.filter((v) => v.node.id !== draggedId);
    const below = rest[destinationIndex];
    if (below) {
      if (isWithin(tree, draggedId, below.node.id)) return null;
      const siblings = childrenOf(tree, below.parentId).filter((c) => c.id !== draggedId);
      const at = siblings.findIndex((c) => c.id === below.node.id);
      move = { parentId: below.parentId, afterId: at > 0 ? siblings[at - 1].id : null };
    } else {
      const roots = tree.filter((c) => c.id !== draggedId);
      move = { parentId: null, afterId: roots.at(-1)?.id ?? null };
    }
  }
  return move && !unchanged(tree, draggedId, move) ? move : null;
}

export type KeyboardMove = 'up' | 'down' | 'indent' | 'outdent';

/**
 * The keyboard path for every drag: Alt+↑/↓ swaps with the previous or next sibling, Alt+→
 * nests the page as the last child of its previous sibling, Alt+← moves it out to just after
 * its parent. Returns null when the move is not possible there.
 */
export function keyboardToMove(
  tree: PageTreeNode[],
  id: number,
  direction: KeyboardMove
): TreeMove | null {
  const here = locate(tree, id);
  if (!here) return null;
  const { siblings, index, parent } = here;
  const parentId = parent?.id ?? null;
  switch (direction) {
    case 'up':
      return index > 0 ? { parentId, afterId: index > 1 ? siblings[index - 2].id : null } : null;
    case 'down':
      return index < siblings.length - 1 ? { parentId, afterId: siblings[index + 1].id } : null;
    case 'indent': {
      if (index === 0) return null;
      const newParent = siblings[index - 1];
      return { parentId: newParent.id, afterId: newParent.children.at(-1)?.id ?? null };
    }
    case 'outdent': {
      if (!parent) return null;
      const grand = locate(tree, parent.id);
      return { parentId: grand?.parent?.id ?? null, afterId: parent.id };
    }
  }
}

/** The tree after a move, for an optimistic update while the server applies it. */
export function applyMove(tree: PageTreeNode[], id: number, move: TreeMove): PageTreeNode[] {
  const clone = (nodes: PageTreeNode[]): PageTreeNode[] =>
    nodes.map((n) => ({ ...n, children: clone(n.children) }));
  const next = clone(tree);
  const here = locate(next, id);
  if (!here) return tree;
  here.siblings.splice(here.index, 1);
  const target = move.parentId === null ? next : locate(next, move.parentId)?.node.children;
  if (!target) return tree;
  const at = move.afterId === null ? 0 : target.findIndex((n) => n.id === move.afterId) + 1;
  target.splice(at, 0, { ...here.node, parentId: move.parentId });
  return next;
}

/** Pages whose title matches a search, in tree order (the sidebar shows them as a flat list). */
export function searchTree(tree: PageTreeNode[], query: string): PageTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: PageTreeNode[] = [];
  const walk = (nodes: PageTreeNode[]) =>
    nodes.forEach((n) => {
      if (n.title.toLowerCase().includes(q)) out.push(n);
      walk(n.children);
    });
  walk(tree);
  return out;
}
