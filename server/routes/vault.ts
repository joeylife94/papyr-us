/**
 * Markdown vault export and import (#113 P2-D2).
 *
 * - GET /api/vault/export?teamId=<id|name> — the readable live pages of one workspace scope (a
 *   team, or the caller's team-less pages when omitted) as `papyrus-<scope>-<date>.zip`: one
 *   Markdown file per page with YAML frontmatter, folders following the page tree, and page
 *   links as `[[Name]]` (see services/vault-export.ts). 401/403 like every scope read path.
 * - POST /api/vault/import?teamId=<id|name> — multipart field `files`: one `.zip` vault or up to
 *   500 `.md` files, 10 MB together. Creates the pages in that scope (see
 *   services/vault-import.ts) and answers `{ created: [{ id, title, slug, parentId, path }],
 *   skipped: [{ path, reason }], unresolvedLinks: [{ path, target }], unresolvedLinkCount }`,
 *   201 when pages were created, 200 when there was nothing to create. Refusals: 401 (no
 *   session), 403 (not a member of the team), 411 (no Content-Length), 413 (upload, entry count,
 *   uncompressed size or page count over the limits), 400 (not a multipart upload, a damaged,
 *   encrypted, ZIP64 or symlink-bearing archive, an unsafe path, a .zip mixed with other files).
 *
 * The import follows the create rules of POST /api/pages: the caller must be signed in and a
 * current member of the team (team-less pages otherwise), each page gets the caller's owner
 * grant, and a sub-page is only placed under a page of the same scope that the caller just
 * created (so they are its owner). Everything is written in one transaction.
 */
import type { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { buildRateLimiter, optionalAuth, type AuthRequest } from '../middleware.js';
import type { DBStorage } from '../storage.js';
import { resolvePageScope } from '../services/page-scope.js';
import { pageLinkTargets } from '../services/page-save.js';
import { buildVaultEntries, outsideLinkIds, vaultArchiveName } from '../services/vault-export.js';
import {
  VAULT_IMPORT_LIMITS,
  VaultInputError,
  importSlugs,
  normalizeVaultPath,
  planVaultImport,
  renderImportedBodies,
  type VaultSourceFile,
} from '../services/vault-import.js';
import { createZip, readZip, ZipFormatError } from '../services/zip.js';
import logger from '../services/logger.js';

/** Multipart headers and boundaries on top of the files themselves. */
const MULTIPART_OVERHEAD_BYTES = 512 * 1024;
/** Ids per link lookup when the export resolves links to pages outside it. */
const LINK_LOOKUP_BATCH = 1000;
/**
 * The largest export built in one request. The archive is assembled in memory and the ZIP format
 * used (no ZIP64) stops at 65,535 entries and 4 GB, so a bigger scope is refused with 413.
 */
const MAX_EXPORT_PAGES = 20_000;
const MAX_EXPORT_CONTENT_BYTES = 256 * 1024 * 1024;
/** Unresolved links listed in an import summary (the count covers all of them). */
const MAX_UNRESOLVED_LISTED = 100;
const IMPORT_FOLDER = 'docs';

// `defParamCharset` is a multer 2 option its type definitions do not list yet.
const uploadOptions: multer.Options & { defParamCharset: string } = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: VAULT_IMPORT_LIMITS.maxUploadBytes,
    files: VAULT_IMPORT_LIMITS.maxEntries,
    fields: 5,
    fieldSize: 1024,
    parts: VAULT_IMPORT_LIMITS.maxEntries + 5,
  },
  // Browsers send UTF-8 file names; multer would read them as Latin-1.
  defParamCharset: 'utf8',
};
const uploadFiles = multer(uploadOptions).array('files', VAULT_IMPORT_LIMITS.maxEntries);

function receiveFiles(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    uploadFiles(req, res, ((error?: unknown) =>
      error ? reject(error) : resolve()) as NextFunction);
  });
}

function uploadRefusal(error: unknown): { status: 400 | 413; message: string } {
  if (error instanceof multer.MulterError) {
    if (
      error.code === 'LIMIT_FILE_SIZE' ||
      error.code === 'LIMIT_FILE_COUNT' ||
      error.code === 'LIMIT_PART_COUNT'
    ) {
      return { status: 413, message: 'The upload is too large' };
    }
    return { status: 400, message: 'Invalid upload' };
  }
  if (error instanceof VaultInputError) return { status: error.status, message: error.message };
  if (error instanceof ZipFormatError) {
    const tooLarge = error.code === 'too-many-entries' || error.code === 'too-large';
    return { status: tooLarge ? 413 : 400, message: error.message };
  }
  return { status: 400, message: 'Invalid upload' };
}

/** The files of an upload: the entries of one archive, or the uploaded Markdown files. */
function collectSources(files: Express.Multer.File[]): VaultSourceFile[] {
  const archives = files.filter((file) => /\.zip$/i.test(file.originalname));
  if (archives.length > 0) {
    if (files.length > 1) {
      throw new VaultInputError(400, 'Upload one .zip archive or Markdown files, not both');
    }
    const entries = readZip(archives[0].buffer, {
      maxEntries: VAULT_IMPORT_LIMITS.maxEntries,
      maxTotalUncompressed: VAULT_IMPORT_LIMITS.maxTotalUncompressed,
    });
    // Every name is checked, directories included, before anything is read.
    const sources = entries.map((entry) => ({ entry, segments: normalizeVaultPath(entry.name) }));
    return sources
      .filter(({ entry }) => !entry.isDirectory)
      .map(({ entry, segments }) => ({
        path: segments.join('/'),
        segments,
        size: entry.size,
        read: entry.read,
      }));
  }
  return files.map((file) => {
    const segments = normalizeVaultPath(file.originalname);
    return { path: segments.join('/'), segments, size: file.size, read: () => file.buffer };
  });
}

export function registerVaultRoutes(app: Express, storage: DBStorage) {
  const limiter = buildRateLimiter({ windowMs: 60_000, max: 20 });

  app.get('/api/vault/export', limiter, optionalAuth, async (req: AuthRequest, res) => {
    try {
      const scope = await resolvePageScope(storage, req.user?.id, req.query.teamId);
      if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

      const rows = await storage.getVaultExportPages(scope.viewer, scope.teamId);
      const contentBytes = rows.reduce(
        (total, row) => total + Buffer.byteLength(row.content ?? ''),
        0
      );
      if (rows.length > MAX_EXPORT_PAGES || contentBytes > MAX_EXPORT_CONTENT_BYTES) {
        return res.status(413).json({ message: 'This workspace is too large to export at once' });
      }
      // Titles of linked pages outside the export, readable ones only (one batched lookup).
      const outside = outsideLinkIds(rows);
      const outsideTitles = new Map<number, string>();
      for (let i = 0; i < outside.length; i += LINK_LOOKUP_BATCH) {
        const pages = await storage.resolveReadablePageLinks(
          scope.viewer,
          outside.slice(i, i + LINK_LOOKUP_BATCH)
        );
        for (const page of pages) outsideTitles.set(page.id, page.title);
      }
      const archive = createZip(buildVaultEntries(rows, outsideTitles));

      const team = scope.teamId === null ? null : await storage.getTeam(scope.teamId);
      const scopeName = scope.teamId === null ? null : (team?.name ?? `team-${scope.teamId}`);
      res.attachment(vaultArchiveName(scopeName));
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Cache-Control', 'no-store');
      res.send(archive);
    } catch (error) {
      logger.error('Vault export failed', { error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to export pages' });
    }
  });

  app.post('/api/vault/import', limiter, optionalAuth, async (req: AuthRequest, res) => {
    // Imported pages are owned by their creator, so an import always needs a session.
    if (!req.user?.id) return res.status(401).json({ message: 'Authentication required' });
    const userId = Number(req.user.id);
    try {
      // The scope is checked before the upload is read.
      const scope = await resolvePageScope(storage, userId, req.query.teamId);
      if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

      const declared = req.headers['content-length'];
      if (declared === undefined) {
        return res.status(411).json({ message: 'Content-Length is required' });
      }
      if (
        !/^\d+$/.test(declared) ||
        Number(declared) > VAULT_IMPORT_LIMITS.maxUploadBytes + MULTIPART_OVERHEAD_BYTES
      ) {
        return res.status(413).json({ message: 'The upload is too large' });
      }
      if (!req.is('multipart/form-data')) {
        return res.status(400).json({ message: 'Send the files as multipart/form-data' });
      }

      let plan: ReturnType<typeof planVaultImport>;
      try {
        await receiveFiles(req, res);
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        if (files.length === 0) return res.status(400).json({ message: 'No files uploaded' });
        const total = files.reduce((sum, file) => sum + file.size, 0);
        if (total > VAULT_IMPORT_LIMITS.maxUploadBytes) {
          return res.status(413).json({ message: 'The upload is too large' });
        }
        plan = planVaultImport(collectSources(files));
      } catch (error) {
        const refusal = uploadRefusal(error);
        return res.status(refusal.status).json({ message: refusal.message });
      }

      if (plan.pages.length === 0) {
        return res.status(200).json({
          created: [],
          skipped: plan.skipped,
          unresolvedLinks: [],
          unresolvedLinkCount: 0,
        });
      }

      const scopePages = await storage.getReadablePageTitlesInScope(scope.viewer, scope.teamId);
      const ids = await storage.reservePageIds(plan.pages.length);
      const { contents, unresolved } = renderImportedBodies(plan, scopePages, ids);
      const slugs = importSlugs(
        plan.pages.map((page) => page.title),
        Date.now().toString(36)
      );
      const pages = plan.pages.map((page, index) => ({
        id: ids[index],
        title: page.title,
        slug: slugs[index],
        content: contents[index],
        tags: page.tags,
        icon: page.icon,
        parentId: page.parent === null ? null : ids[page.parent],
        linkTargets: pageLinkTargets(ids[index], { content: contents[index] }),
      }));
      const created = await storage.insertImportedPages({
        teamId: scope.teamId,
        userId,
        author: String(req.user.email || req.user.name || 'imported'),
        folder: IMPORT_FOLDER,
        pages,
      });

      res.status(201).json({
        created: created.map((row, index) => ({
          id: row.id,
          title: pages[index].title,
          slug: row.slug,
          parentId: pages[index].parentId,
          path: plan.pages[index].path,
        })),
        skipped: plan.skipped,
        unresolvedLinks: unresolved.slice(0, MAX_UNRESOLVED_LISTED),
        unresolvedLinkCount: unresolved.length,
      });
    } catch (error) {
      logger.error('Vault import failed', { error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to import pages' });
    }
  });
}
