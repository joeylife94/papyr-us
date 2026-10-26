/**
 * Markdown vault import (#113 P2-D2): an Obsidian-style `.zip` vault or loose `.md` files become
 * pages of one workspace scope. No database access here; the route loads and writes.
 *
 * - Uploads are untrusted. Archive limits are enforced by `readZip`; every entry path is
 *   normalized and a path that tries to leave the vault (`..`, absolute, backslash, control
 *   characters) refuses the whole upload. Hidden entries (`.obsidian/`, `.DS_Store`) and
 *   `__MACOSX/` are ignored; other non-Markdown files and oversized notes are reported as skipped.
 * - Hierarchy follows folders: `A.md` + `A/B.md` makes B a sub-page of A; a folder without a
 *   matching note becomes an empty page named after the folder. Parents come before children.
 * - Frontmatter gives `title` (else the file name), `tags` and `icon` (one emoji, else none).
 * - Wikilinks resolve after every page has an id: within the import first (path, file name or
 *   title; exact, then case-insensitive), then among the readable live pages of the scope. A
 *   resolved link becomes an id token, which renders the target's current title, so an alias
 *   (`[[Title|alias]]`) is dropped. An unresolved link becomes its alias or title as plain text.
 */
import { formatPageLink } from '../../shared/page-links.js';
import { isValidPageIcon } from '../../shared/page-icon.js';
import {
  normalizeTags,
  parseFrontmatter,
  replaceWikiLinks,
  sanitizeFileName,
  wikiLinkText,
} from './vault-format.js';

export const VAULT_IMPORT_LIMITS = {
  /** Most bytes one upload may carry (all files together). */
  maxUploadBytes: 10 * 1024 * 1024,
  /** Most entries in an archive, or files in one upload. */
  maxEntries: 500,
  /** Most bytes an archive's entries may declare uncompressed, together. */
  maxTotalUncompressed: 20 * 1024 * 1024,
  /** Largest Markdown file imported; larger ones are skipped. */
  maxNoteBytes: 1024 * 1024,
  /** Deepest folder nesting imported; deeper notes are skipped. */
  maxDepth: 32,
  /** Most pages (notes plus folder pages) one import creates. */
  maxPages: 1000,
  /** Longest imported title, in characters. */
  maxTitleLength: 200,
} as const;

/** A refused upload: the status and a message safe to return. */
export class VaultInputError extends Error {
  constructor(
    public readonly status: 400 | 413,
    message: string
  ) {
    super(message);
    this.name = 'VaultInputError';
  }
}

/** One uploaded file, or one file entry of an uploaded archive. */
export interface VaultSourceFile {
  /** Normalized path (`segments` joined by `/`). */
  path: string;
  segments: string[];
  size: number;
  read(): Buffer;
}

export type VaultSkipReason = 'not-markdown' | 'too-large' | 'too-deep' | 'duplicate';

export interface PlannedPage {
  /** Path without the `.md` extension (`A/B`); a folder page's is the folder path. */
  key: string;
  /** Where the page came from: the note's path, or the folder path with a trailing `/`. */
  path: string;
  title: string;
  tags: string[];
  icon: string | null;
  /** Markdown body as imported, links still as written. */
  body: string;
  /** Index of the parent page in the plan, or null for a root page. */
  parent: number | null;
}

export interface VaultImportPlan {
  pages: PlannedPage[];
  skipped: Array<{ path: string; reason: VaultSkipReason }>;
}

/**
 * The segments of an entry path inside the vault. Empty and `.` segments are dropped; a path
 * that could point outside the vault throws `VaultInputError` (400).
 */
export function normalizeVaultPath(name: string): string[] {
  const refuse = () => new VaultInputError(400, 'The upload contains an unsafe file path');
  if (typeof name !== 'string' || name.includes('\\') || /[\u0000-\u001f\u007f]/.test(name)) {
    throw refuse();
  }
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw refuse();
  const segments = name.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.some((segment) => segment === '..')) throw refuse();
  return segments.map((segment) => segment.normalize('NFC'));
}

const MARKDOWN_FILE = /\.(md|markdown)$/i;

function isIgnored(segments: string[]): boolean {
  return segments[0] === '__MACOSX' || segments.some((segment) => segment.startsWith('.'));
}

function compareSegments(a: string[], b: string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const order = a[i].localeCompare(b[i], undefined, { numeric: true, sensitivity: 'base' });
    if (order !== 0) return order;
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

const utf8 = new TextDecoder('utf-8');

function frontmatterTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return title ? title.slice(0, VAULT_IMPORT_LIMITS.maxTitleLength) : null;
}

/**
 * The pages an upload creates, parents before children (siblings by name), and the files it
 * skips. Throws `VaultInputError` (413) when the import would create too many pages.
 */
export function planVaultImport(files: VaultSourceFile[]): VaultImportPlan {
  const skipped: VaultImportPlan['skipped'] = [];
  const pages = new Map<string, Omit<PlannedPage, 'parent'> & { segments: string[] }>();

  for (const file of files) {
    if (file.segments.length === 0 || isIgnored(file.segments)) continue;
    if (!MARKDOWN_FILE.test(file.path)) {
      skipped.push({ path: file.path, reason: 'not-markdown' });
      continue;
    }
    if (file.size > VAULT_IMPORT_LIMITS.maxNoteBytes) {
      skipped.push({ path: file.path, reason: 'too-large' });
      continue;
    }
    if (file.segments.length > VAULT_IMPORT_LIMITS.maxDepth) {
      skipped.push({ path: file.path, reason: 'too-deep' });
      continue;
    }
    const segments = [...file.segments];
    segments[segments.length - 1] = segments[segments.length - 1].replace(MARKDOWN_FILE, '');
    const key = segments.join('/');
    if (!segments[segments.length - 1] || pages.has(key.toLowerCase())) {
      skipped.push({ path: file.path, reason: 'duplicate' });
      continue;
    }
    const { data, body } = parseFrontmatter(utf8.decode(file.read()));
    pages.set(key.toLowerCase(), {
      key,
      path: file.path,
      segments,
      title:
        frontmatterTitle(data.title) ??
        segments[segments.length - 1].slice(0, VAULT_IMPORT_LIMITS.maxTitleLength),
      tags: normalizeTags(data.tags ?? data.tag),
      icon: isValidPageIcon(data.icon) ? data.icon : null,
      body,
    });
  }

  // A folder without a note of its own becomes an empty page named after it.
  for (const note of Array.from(pages.values())) {
    for (let depth = 1; depth < note.segments.length; depth += 1) {
      const segments = note.segments.slice(0, depth);
      const key = segments.join('/');
      if (pages.has(key.toLowerCase())) continue;
      pages.set(key.toLowerCase(), {
        key,
        path: `${key}/`,
        segments,
        title: segments[segments.length - 1].slice(0, VAULT_IMPORT_LIMITS.maxTitleLength),
        tags: [],
        icon: null,
        body: '',
      });
    }
  }
  if (pages.size > VAULT_IMPORT_LIMITS.maxPages) {
    throw new VaultInputError(413, 'The upload would create too many pages');
  }

  const ordered = Array.from(pages.values()).sort((a, b) =>
    compareSegments(a.segments, b.segments)
  );
  const indexOf = new Map(ordered.map((page, index) => [page.key.toLowerCase(), index]));
  return {
    pages: ordered.map(({ segments, ...page }) => ({
      ...page,
      parent:
        segments.length > 1
          ? (indexOf.get(segments.slice(0, -1).join('/').toLowerCase()) ?? null)
          : null,
    })),
    skipped,
  };
}

/** A readable live page of the target scope, as a link target for the import. */
export interface ScopePageTitle {
  id: number;
  title: string;
}

function setFirst<K, V>(map: Map<K, V>, key: K, value: V) {
  if (!map.has(key)) map.set(key, value);
}

/**
 * The stored `content` of each planned page, with wikilinks resolved to id tokens (`ids[i]` is
 * the id of `plan.pages[i]`; `scopePages` lists the scope's readable pages, preferred first),
 * plus the links that resolved nowhere.
 */
export function renderImportedBodies(
  plan: VaultImportPlan,
  scopePages: ScopePageTitle[],
  ids: number[]
): { contents: string[]; unresolved: Array<{ path: string; target: string }> } {
  const byPath = new Map<string, number>();
  const byPathLower = new Map<string, number>();
  const byName = new Map<string, number>();
  const byNameLower = new Map<string, number>();
  plan.pages.forEach((page, index) => {
    setFirst(byPath, page.key, index);
    setFirst(byPathLower, page.key.toLowerCase(), index);
    for (const label of [page.key.split('/').pop() ?? '', page.title]) {
      setFirst(byName, label, index);
      setFirst(byNameLower, label.toLowerCase(), index);
    }
  });
  const scopeExact = new Map<string, number>();
  const scopeLower = new Map<string, number>();
  const scopeFile = new Map<string, number>();
  const scopeFileLower = new Map<string, number>();
  for (const page of scopePages) {
    setFirst(scopeExact, page.title, page.id);
    setFirst(scopeLower, page.title.toLowerCase(), page.id);
    // Single-page exports name links after the file a title would get.
    const file = sanitizeFileName(page.title);
    setFirst(scopeFile, file, page.id);
    setFirst(scopeFileLower, file.toLowerCase(), page.id);
  }

  const resolveName = (name: string): number | null => {
    const lower = name.toLowerCase();
    const index = byName.get(name) ?? byNameLower.get(lower);
    if (index !== undefined) return ids[index];
    return (
      scopeExact.get(name) ??
      scopeLower.get(lower) ??
      scopeFile.get(name) ??
      scopeFileLower.get(lower) ??
      null
    );
  };
  // Every `/`-boundary suffix of each path, built once, so a `[[folder/Name]]` lookup is one map
  // read instead of a scan of all pages per link.
  const bySuffixLower = new Map<string, number>();
  plan.pages.forEach((page, index) => {
    const key = page.key.toLowerCase();
    for (let at = key.indexOf('/'); at >= 0; at = key.indexOf('/', at + 1)) {
      setFirst(bySuffixLower, key.slice(at + 1), index);
    }
  });
  // A path from the vault root wins (so `[[Name]]` means the root-level `Name.md` when several
  // files share the name), then a path suffix, then names and titles.
  const resolved = new Map<string, number | null>();
  const resolve = (target: string): number | null => {
    if (!target) return null;
    const cached = resolved.get(target);
    if (cached !== undefined) return cached;
    const lower = target.toLowerCase();
    let index = byPath.get(target) ?? byPathLower.get(lower);
    if (index === undefined && target.includes('/')) index = bySuffixLower.get(lower);
    const id = index !== undefined ? ids[index] : resolveName(target.split('/').pop() ?? '');
    resolved.set(target, id);
    return id;
  };

  const unresolved: Array<{ path: string; target: string }> = [];
  const contents = plan.pages.map((page) => {
    const missing = new Set<string>();
    const content = replaceWikiLinks(page.body, (link) => {
      const id = resolve(link.target);
      if (id !== null) return formatPageLink(id);
      if (link.target && !missing.has(link.target)) {
        missing.add(link.target);
        unresolved.push({ path: page.path, target: link.target });
      }
      return wikiLinkText(link);
    });
    return content;
  });
  return { contents, unresolved };
}

/**
 * Slugs for the imported titles, unique within the import (the database adds a suffix when one
 * is taken by an existing page). `stamp` keeps separate imports of the same titles apart.
 */
export function importSlugs(titles: string[], stamp: string): string[] {
  const used = new Set<string>();
  return titles.map((title) => {
    const base =
      title
        .toLowerCase()
        .normalize('NFC')
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/, '') || 'page';
    let slug = `${base}-${stamp}`;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${stamp}-${n}`;
    used.add(slug);
    return slug;
  });
}
