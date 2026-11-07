/**
 * The tag pane (#137): its URLs and the tree it shows.
 *
 * `/tags` lists the tags of the caller's personal (team-less) pages, `/teams/<name>/tags` those of
 * a team, and `/tags/<tag>` (the tag URL-encoded, `project%2Falpha`) selects a tag. The server
 * (GET /api/tags/tree) sends every tag as a flat list with its counts; this module nests it.
 */
import { normalizeTag, type TagCount } from '@shared/tags';
import type { WorkspaceScope } from './active-workspace';
// Relative import: unit tests resolve `@shared` but not the client's `@/` alias.
import { tagHref } from './inline-markdown';

export type TagSort = 'name' | 'count';

/** Path prefix of a workspace's tag pane: '' personal, `/teams/<name>` a team. */
export function tagScopePath(scope: WorkspaceScope): string {
  return scope.kind === 'team' ? scope.workspace.basePath : '';
}

/** The tag pane of a workspace, with `tag` selected when given. */
export function tagPanePath(scopePath: string, tag?: string | null): string {
  return tag ? tagHref(tag, scopePath) : `${scopePath}/tags`;
}

const PANE_PATH = /^(?:\/teams\/[^/]+)?\/tags(?:\/(.*))?$/;

/**
 * The tag a tag pane URL selects, normalized like the server does (`normalizeTag`), or null for
 * the pane without a selection (and for anything that is not a tag). Accepts the tag encoded as
 * one segment (`project%2Falpha`) or with plain slashes (`project/alpha`).
 */
export function tagFromPanePath(pathname: string): string | null {
  const raw = PANE_PATH.exec(pathname)?.[1];
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return normalizeTag(decoded);
}

export interface TagTreeNode extends TagCount {
  /** The last segment: `alpha` of `project/alpha`. */
  label: string;
  children: TagTreeNode[];
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

function compareNodes(sort: TagSort) {
  return (a: TagTreeNode, b: TagTreeNode): number => {
    if (sort === 'count' && a.count !== b.count) return b.count - a.count;
    return collator.compare(a.label, b.label) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  };
}

/**
 * The flat tag list as a tree, siblings sorted by name or by count (then name). A tag whose
 * parent is missing from the list (the server never sends one) is shown at the top level.
 */
export function buildTagTree(tags: readonly TagCount[], sort: TagSort): TagTreeNode[] {
  const nodes = new Map<string, TagTreeNode>();
  for (const tag of tags) {
    const slash = tag.name.lastIndexOf('/');
    nodes.set(tag.name, { ...tag, label: tag.name.slice(slash + 1), children: [] });
  }
  const roots: TagTreeNode[] = [];
  for (const node of nodes.values()) {
    const slash = node.name.lastIndexOf('/');
    const parent = slash > 0 ? nodes.get(node.name.slice(0, slash)) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const order = compareNodes(sort);
  const sortAll = (list: TagTreeNode[]) => {
    list.sort(order);
    for (const node of list) sortAll(node.children);
  };
  sortAll(roots);
  return roots;
}

/** The filter box's text as the tag paths it matches: case-insensitive, `#` optional. */
function filterNeedle(query: string): string {
  return query.trim().replace(/^#/, '').toLocaleLowerCase();
}

/** Whether the tag path `name` matches the filter box's text (an empty text matches all). */
export function matchesTagFilter(name: string, query: string): boolean {
  return name.toLocaleLowerCase().includes(filterNeedle(query));
}

/**
 * The tree narrowed to tags whose path contains `query` (case-insensitive), with the parents
 * that lead to them. An empty query keeps everything.
 */
export function filterTagTree(nodes: readonly TagTreeNode[], query: string): TagTreeNode[] {
  if (!filterNeedle(query)) return [...nodes];
  const keep = (list: readonly TagTreeNode[]): TagTreeNode[] =>
    list.flatMap((node) => {
      const children = keep(node.children);
      if (children.length > 0 || matchesTagFilter(node.name, query)) {
        return [{ ...node, children }];
      }
      return [];
    });
  return keep(nodes);
}

/** The tags in display order (depth first), for keyboard choice from the filter box. */
export function flattenTagTree(nodes: readonly TagTreeNode[]): TagTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTagTree(node.children)]);
}
