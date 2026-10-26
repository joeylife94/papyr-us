/**
 * Markdown vault export (#113 P2-D2): the readable live pages of one workspace scope as an
 * Obsidian-style folder of Markdown files. No database access here; the route loads the rows.
 *
 * - Paths follow the page tree as the viewer sees it (`buildPageTree`, D4): a root page is
 *   `Title.md`; a page with sub-pages is `Title.md` plus a folder `Title/` holding them.
 * - Each file has YAML frontmatter (`title`, `tags`, `icon`, `created`, `updated`,
 *   `papyrus_id`), then the page's `content` with every link token rewritten for the vault:
 *   a page in the export becomes `[[Name]]` (`[[folder/Name]]` when names repeat), a readable
 *   page outside it its plain title, anything else `INACCESSIBLE_PAGE_LABEL`. Titles of pages
 *   the viewer cannot read never reach the archive.
 */
import { buildPageTree, type PageTreeNode, type PageTreeRow } from './page-tree.js';
import {
  FolderNames,
  INACCESSIBLE_PAGE_LABEL,
  pageLinkTokenIds,
  renderPageLinkTokens,
  sanitizeFileName,
  serializeFrontmatter,
  wikiLinkTarget,
  type FrontmatterValue,
} from './vault-format.js';
import type { ZipInputEntry } from './zip.js';

/** A readable live page of the exported scope, as `DBStorage.getVaultExportPages` loads it. */
export interface VaultExportRow extends PageTreeRow {
  content: string;
  tags: string[];
}

/** Ids that `rows` link to (outside code) but that are not part of the export. */
export function outsideLinkIds(rows: VaultExportRow[]): number[] {
  const exported = new Set(rows.map((row) => row.id));
  const ids = new Set<number>();
  for (const row of rows) {
    for (const id of pageLinkTokenIds(row.content ?? '')) if (!exported.has(id)) ids.add(id);
  }
  return Array.from(ids);
}

function isoDate(value: Date | string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

/** The frontmatter fields of an exported page. */
export function pageFrontmatter(page: {
  id: number;
  title: string;
  tags?: string[] | null;
  icon?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Array<[string, FrontmatterValue]> {
  const fields: Array<[string, FrontmatterValue]> = [
    ['title', page.title],
    ['tags', Array.isArray(page.tags) ? page.tags : []],
  ];
  if (page.icon) fields.push(['icon', page.icon]);
  fields.push(
    ['created', isoDate(page.createdAt)],
    ['updated', isoDate(page.updatedAt)],
    ['papyrus_id', String(page.id)]
  );
  return fields;
}

/** The nodes of `tree` depth first, so every parent comes before its sub-pages. */
function depthFirst(tree: PageTreeNode[]): PageTreeNode[] {
  const nodes: PageTreeNode[] = [];
  const stack = [...tree].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    nodes.push(node);
    for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push(node.children[i]);
  }
  return nodes;
}

/**
 * The archive entries for `rows` (the viewer's readable live pages of one scope). `outsideTitles`
 * holds the titles of linked pages outside the export that the viewer can read; any other
 * linked id is written as `INACCESSIBLE_PAGE_LABEL`.
 */
export function buildVaultEntries(
  rows: VaultExportRow[],
  outsideTitles: Map<number, string>
): ZipInputEntry[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const nodes = depthFirst(buildPageTree(rows));

  // Depth first, so a parent's folder is known before its sub-pages are named.
  const folderOf = new Map<number, string>();
  const nameOf = new Map<number, string>();
  const names = new FolderNames();
  for (const node of nodes) {
    const folder =
      node.parentId === null ? '' : `${folderOf.get(node.parentId)}${nameOf.get(node.parentId)}/`;
    nameOf.set(node.id, names.claim(folder, sanitizeFileName(node.title)));
    folderOf.set(node.id, folder);
  }

  // A link names the file; the path is added only when another file has the same name.
  const nameCounts = new Map<string, number>();
  for (const name of nameOf.values()) {
    nameCounts.set(name.toLowerCase(), (nameCounts.get(name.toLowerCase()) ?? 0) + 1);
  }
  const linkName = (id: number) => {
    const name = nameOf.get(id)!;
    return nameCounts.get(name.toLowerCase())! > 1 ? `${folderOf.get(id)}${name}` : name;
  };
  const renderLink = (id: number) => {
    if (nameOf.has(id)) return `[[${wikiLinkTarget(linkName(id))}]]`;
    return outsideTitles.get(id) ?? INACCESSIBLE_PAGE_LABEL;
  };

  return nodes.map((node) => {
    const row = byId.get(node.id)!;
    const body = renderPageLinkTokens(row.content ?? '', renderLink);
    return {
      name: `${folderOf.get(node.id)}${nameOf.get(node.id)}.md`,
      data: serializeFrontmatter(pageFrontmatter(row)) + body + (body.endsWith('\n') ? '' : '\n'),
      modifiedAt: new Date(row.updatedAt),
    };
  });
}

/** `papyrus-<scope>-<date>.zip`: the team's name, or `personal` for team-less pages. */
export function vaultArchiveName(scopeName: string | null, now = new Date()): string {
  const scope = scopeName ? sanitizeFileName(scopeName).replace(/\s+/g, '-') : 'personal';
  return `papyrus-${scope}-${now.toISOString().slice(0, 10)}.zip`;
}

/**
 * A single page as one Markdown file (GET /api/pages/:id/export). With no vault around it, a
 * link to a page the viewer can read becomes `[[Name]]`, named like the file that page would
 * get in a vault (`linkedTitles` holds those pages' titles), so the file can join a vault or be
 * imported back; any other link becomes `INACCESSIBLE_PAGE_LABEL`.
 */
export function singlePageMarkdown(
  page: VaultExportRow & { author: string; folder: string },
  linkedTitles: Map<number, string>
): string {
  const fields = pageFrontmatter(page);
  // The single-page export has always carried these fields; keep them after `title`.
  fields.splice(1, 0, ['slug', page.slug], ['author', page.author], ['folder', page.folder]);
  const body = renderPageLinkTokens(page.content ?? '', (id) => {
    const title = linkedTitles.get(id);
    return title === undefined
      ? INACCESSIBLE_PAGE_LABEL
      : `[[${wikiLinkTarget(sanitizeFileName(title))}]]`;
  });
  return serializeFrontmatter(fields) + body;
}

/** `content` with link tokens replaced by readable titles, for plain-text exports (HTML). */
export function contentWithLinkTitles(content: string, linkedTitles: Map<number, string>): string {
  return renderPageLinkTokens(content, (id) => linkedTitles.get(id) ?? INACCESSIBLE_PAGE_LABEL);
}
