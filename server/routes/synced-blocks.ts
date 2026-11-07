/**
 * Synced blocks: content stored once (`synced_blocks`) and shown by reference on other pages.
 * A synced block belongs to the page in its `page_id` and is deleted with that page.
 *
 * Authorization is the inline database rule (P2-D4) and reuses its owning-page check
 * (`checkDatabasePage`):
 * - reading a block needs viewer on its page; updating or deleting it needs editor;
 * - a block that does not exist, or whose page is missing, trashed or unreadable, answers 404
 *   `Synced block not found`, so ids of blocks the caller cannot read look like unknown ones;
 * - a caller who can read the page but not edit it gets 403 on writes (401 without a session);
 * - creating a block needs editor on a live page (`pageId`; 404 `Page not found` otherwise).
 *   Ids are unique across the instance, so an id already in use answers 409 whoever owns it;
 * - the picker list holds only blocks on pages the caller may list (the page list rule).
 *
 * Routes (all behind a session when auth is enforced):
 * - POST   /api/synced-blocks                    { pageId, originalBlockId, content } → 201 block
 * - GET    /api/synced-blocks                    → blocks with `referenceCount` (picker)
 * - GET    /api/synced-blocks/:originalBlockId   → block
 * - PATCH  /api/synced-blocks/:originalBlockId   { content } → block
 * - DELETE /api/synced-blocks/:originalBlockId   → 204
 *
 * `content` is a list of block objects (at most 500, 256 KB as JSON). Errors never carry
 * internal details.
 */
import type { Express, Response } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuthIfEnabled, type AuthRequest } from '../middleware.js';
import type { DBStorage } from '../storage.js';
import type { SyncedBlock } from '../../shared/schema.js';
import { postgresErrorOf } from '../db-errors.js';
import { checkDatabasePage } from './database.js';
import logger from '../services/logger.js';

export const SYNCED_BLOCK_LIMITS = {
  idLength: 128,
  blocks: 500,
  contentBytes: 256 * 1024,
} as const;

type Refusal = { status: 400 | 401 | 403 | 404 | 409; message: string };

const SYNCED_BLOCK_NOT_FOUND: Refusal = { status: 404, message: 'Synced block not found' };
const PAGE_NOT_FOUND: Refusal = { status: 404, message: 'Page not found' };
const ID_IN_USE: Refusal = { status: 409, message: 'This synced block ID is already in use' };

const ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${SYNCED_BLOCK_LIMITS.idLength}}$`);

export function isValidSyncedBlockId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function contentBytes(content: unknown[]): number {
  try {
    return Buffer.byteLength(JSON.stringify(content), 'utf8');
  } catch {
    return Infinity;
  }
}

const positiveId = z.number().int().positive().max(2_147_483_647);

const contentSchema = z
  .array(z.record(z.string(), z.unknown()), { error: 'content must be a list of blocks' })
  .max(SYNCED_BLOCK_LIMITS.blocks, `content has at most ${SYNCED_BLOCK_LIMITS.blocks} blocks`)
  .refine((content) => contentBytes(content) <= SYNCED_BLOCK_LIMITS.contentBytes, {
    message: 'content is too large',
  });

const createBody = z
  .object({
    pageId: positiveId,
    originalBlockId: z.string().refine(isValidSyncedBlockId, 'Invalid synced block ID'),
    content: contentSchema,
  })
  .strict();

const updateBody = z.object({ content: contentSchema }).strict();

function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({
    message: error.issues[0]?.message ?? 'Invalid request',
    issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  });
}

function refuse(res: Response, refusal: Refusal) {
  return res.status(refusal.status).json({ message: refusal.message });
}

function fail(res: Response, message: string, error: unknown) {
  logger.error(message, { error: error instanceof Error ? error.message : String(error) });
  return res.status(500).json({ message });
}

function presentBlock(block: SyncedBlock) {
  return {
    id: block.id,
    originalBlockId: block.originalBlockId,
    pageId: block.pageId,
    content: block.content,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
  };
}

/** The synced block `originalBlockId` if `userId` may read (or write) it, else the refusal. */
async function blockFor(
  storage: DBStorage,
  userId: number | undefined,
  originalBlockId: string,
  level: 'viewer' | 'editor'
): Promise<{ block: SyncedBlock } | { refusal: Refusal }> {
  const block = await storage.getSyncedBlock(originalBlockId);
  if (!block) return { refusal: SYNCED_BLOCK_NOT_FOUND };
  const refusal = await checkDatabasePage(
    storage,
    userId,
    block.pageId,
    level,
    SYNCED_BLOCK_NOT_FOUND
  );
  return refusal ? { refusal } : { block };
}

export function registerSyncedBlockRoutes(app: Express, storage: DBStorage) {
  const auth = [optionalAuth, requireAuthIfEnabled];

  app.post('/api/synced-blocks', ...auth, async (req: AuthRequest, res) => {
    const body = createBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const { pageId, originalBlockId, content } = body.data;
    try {
      const refusal = await checkDatabasePage(
        storage,
        req.user?.id,
        pageId,
        'editor',
        PAGE_NOT_FOUND
      );
      if (refusal) return refuse(res, refusal);
      const block = await storage.createSyncedBlock(pageId, originalBlockId, content);
      if (!block) return refuse(res, ID_IN_USE);
      res.status(201).json(presentBlock(block));
    } catch (error) {
      // The page was removed between the check and the insert.
      if (postgresErrorOf(error)?.code === '23503') return refuse(res, PAGE_NOT_FOUND);
      fail(res, 'Failed to create synced block', error);
    }
  });

  app.get('/api/synced-blocks', ...auth, async (req: AuthRequest, res) => {
    try {
      const viewer = await storage.getPageViewer(req.user?.id);
      const blocks = await storage.getReadableSyncedBlocks(viewer);
      res.json(
        blocks.map((block) => ({ ...presentBlock(block), referenceCount: block.referenceCount }))
      );
    } catch (error) {
      fail(res, 'Failed to list synced blocks', error);
    }
  });

  app.get('/api/synced-blocks/:originalBlockId', ...auth, async (req: AuthRequest, res) => {
    const { originalBlockId } = req.params;
    if (!isValidSyncedBlockId(originalBlockId)) {
      return res.status(400).json({ message: 'Invalid synced block ID' });
    }
    try {
      const access = await blockFor(storage, req.user?.id, originalBlockId, 'viewer');
      if ('refusal' in access) return refuse(res, access.refusal);
      res.json(presentBlock(access.block));
    } catch (error) {
      fail(res, 'Failed to load synced block', error);
    }
  });

  app.patch('/api/synced-blocks/:originalBlockId', ...auth, async (req: AuthRequest, res) => {
    const { originalBlockId } = req.params;
    if (!isValidSyncedBlockId(originalBlockId)) {
      return res.status(400).json({ message: 'Invalid synced block ID' });
    }
    const body = updateBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    try {
      const access = await blockFor(storage, req.user?.id, originalBlockId, 'editor');
      if ('refusal' in access) return refuse(res, access.refusal);
      const updated = await storage.updateSyncedBlockContent(originalBlockId, body.data.content);
      if (!updated) return refuse(res, SYNCED_BLOCK_NOT_FOUND);
      res.json(presentBlock(updated));
    } catch (error) {
      fail(res, 'Failed to update synced block', error);
    }
  });

  app.delete('/api/synced-blocks/:originalBlockId', ...auth, async (req: AuthRequest, res) => {
    const { originalBlockId } = req.params;
    if (!isValidSyncedBlockId(originalBlockId)) {
      return res.status(400).json({ message: 'Invalid synced block ID' });
    }
    try {
      const access = await blockFor(storage, req.user?.id, originalBlockId, 'editor');
      if ('refusal' in access) return refuse(res, access.refusal);
      await storage.deleteSyncedBlock(originalBlockId);
      res.status(204).send();
    } catch (error) {
      fail(res, 'Failed to delete synced block', error);
    }
  });
}
