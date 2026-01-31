/**
 * Page Version History Service
 * 
 * Tracks all changes to wiki pages:
 * - Automatic versioning on each save
 * - Diff generation between versions
 * - Version rollback capability
 * - Storage optimization with delta compression
 */

import type { Pool } from 'pg';
import logger from './logger.js';
import { diff_match_patch } from 'diff-match-patch';

// Version entry type
export interface PageVersion {
  id: number;
  pageId: number;
  version: number;
  title: string;
  content: string;
  contentDelta?: string;  // Compressed delta from previous version
  blocks?: any;
  userId?: number;
  userEmail?: string;
  changeType: 'create' | 'update' | 'restore';
  changeSummary?: string;
  createdAt: Date;
}

// Version comparison result
export interface VersionDiff {
  fromVersion: number;
  toVersion: number;
  titleChanged: boolean;
  contentDiff: Array<{
    type: 'equal' | 'insert' | 'delete';
    text: string;
  }>;
  blocksChanged: boolean;
}

// Initialize diff-match-patch
const dmp = new diff_match_patch();

/**
 * Initialize version history table
 */
export async function initVersionHistoryTable(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS page_versions (
        id SERIAL PRIMARY KEY,
        page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        content_delta TEXT,
        blocks JSONB,
        user_id INTEGER,
        user_email VARCHAR(255),
        change_type VARCHAR(20) NOT NULL DEFAULT 'update',
        change_summary TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(page_id, version)
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_page_versions_page_id ON page_versions(page_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_page_versions_created_at ON page_versions(created_at)`);
    
    logger.info('Page version history table initialized');
  } catch (error) {
    logger.error('Failed to initialize version history table', { error });
    throw error;
  }
}

/**
 * Create a new version entry for a page
 */
export async function createVersion(
  pool: Pool,
  pageId: number,
  data: {
    title: string;
    content: string;
    blocks?: any;
    userId?: number;
    userEmail?: string;
    changeType?: 'create' | 'update' | 'restore';
    changeSummary?: string;
  }
): Promise<PageVersion> {
  // Get the latest version number
  const versionResult = await pool.query(
    'SELECT COALESCE(MAX(version), 0) as max_version FROM page_versions WHERE page_id = $1',
    [pageId]
  );
  const newVersion = versionResult.rows[0].max_version + 1;

  // Get previous version content for delta compression
  let contentDelta: string | null = null;
  if (newVersion > 1) {
    const prevResult = await pool.query(
      'SELECT content FROM page_versions WHERE page_id = $1 AND version = $2',
      [pageId, newVersion - 1]
    );
    
    if (prevResult.rows[0]?.content && data.content) {
      // Create delta patch
      const patches = dmp.patch_make(prevResult.rows[0].content, data.content);
      contentDelta = dmp.patch_toText(patches);
    }
  }

  // Insert new version
  const result = await pool.query(
    `INSERT INTO page_versions 
     (page_id, version, title, content, content_delta, blocks, user_id, user_email, change_type, change_summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      pageId,
      newVersion,
      data.title,
      data.content,
      contentDelta,
      data.blocks ? JSON.stringify(data.blocks) : null,
      data.userId || null,
      data.userEmail || null,
      data.changeType || 'update',
      data.changeSummary || null,
    ]
  );

  const row = result.rows[0];
  
  logger.debug('Page version created', { pageId, version: newVersion });

  return {
    id: row.id,
    pageId: row.page_id,
    version: row.version,
    title: row.title,
    content: row.content,
    contentDelta: row.content_delta,
    blocks: row.blocks,
    userId: row.user_id,
    userEmail: row.user_email,
    changeType: row.change_type,
    changeSummary: row.change_summary,
    createdAt: row.created_at,
  };
}

/**
 * Get version history for a page
 */
export async function getPageVersions(
  pool: Pool,
  pageId: number,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<{ versions: PageVersion[]; total: number }> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  // Get total count
  const countResult = await pool.query(
    'SELECT COUNT(*) as total FROM page_versions WHERE page_id = $1',
    [pageId]
  );

  // Get versions
  const result = await pool.query(
    `SELECT id, page_id, version, title, 
            LEFT(content, 200) as content_preview,
            user_id, user_email, change_type, change_summary, created_at
     FROM page_versions 
     WHERE page_id = $1
     ORDER BY version DESC
     LIMIT $2 OFFSET $3`,
    [pageId, limit, offset]
  );

  const versions: PageVersion[] = result.rows.map(row => ({
    id: row.id,
    pageId: row.page_id,
    version: row.version,
    title: row.title,
    content: row.content_preview,
    userId: row.user_id,
    userEmail: row.user_email,
    changeType: row.change_type,
    changeSummary: row.change_summary,
    createdAt: row.created_at,
  }));

  return {
    versions,
    total: parseInt(countResult.rows[0].total),
  };
}

/**
 * Get a specific version of a page
 */
export async function getVersion(
  pool: Pool,
  pageId: number,
  version: number
): Promise<PageVersion | null> {
  const result = await pool.query(
    `SELECT * FROM page_versions WHERE page_id = $1 AND version = $2`,
    [pageId, version]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    pageId: row.page_id,
    version: row.version,
    title: row.title,
    content: row.content,
    contentDelta: row.content_delta,
    blocks: row.blocks,
    userId: row.user_id,
    userEmail: row.user_email,
    changeType: row.change_type,
    changeSummary: row.change_summary,
    createdAt: row.created_at,
  };
}

/**
 * Compare two versions and generate diff
 */
export async function compareVersions(
  pool: Pool,
  pageId: number,
  fromVersion: number,
  toVersion: number
): Promise<VersionDiff | null> {
  const [fromVer, toVer] = await Promise.all([
    getVersion(pool, pageId, fromVersion),
    getVersion(pool, pageId, toVersion),
  ]);

  if (!fromVer || !toVer) {
    return null;
  }

  // Generate content diff
  const diffs = dmp.diff_main(fromVer.content || '', toVer.content || '');
  dmp.diff_cleanupSemantic(diffs);

  const contentDiff = diffs.map(([type, text]: [number, string]) => ({
    type: type === 0 ? 'equal' as const : type === 1 ? 'insert' as const : 'delete' as const,
    text,
  }));

  return {
    fromVersion,
    toVersion,
    titleChanged: fromVer.title !== toVer.title,
    contentDiff,
    blocksChanged: JSON.stringify(fromVer.blocks) !== JSON.stringify(toVer.blocks),
  };
}

/**
 * Restore a page to a previous version
 */
export async function restoreVersion(
  pool: Pool,
  pageId: number,
  targetVersion: number,
  userId?: number,
  userEmail?: string
): Promise<PageVersion | null> {
  const targetVer = await getVersion(pool, pageId, targetVersion);
  
  if (!targetVer) {
    return null;
  }

  // Create new version with restored content
  const restoredVersion = await createVersion(pool, pageId, {
    title: targetVer.title,
    content: targetVer.content,
    blocks: targetVer.blocks,
    userId,
    userEmail,
    changeType: 'restore',
    changeSummary: `Restored to version ${targetVersion}`,
  });

  // Update the actual page
  await pool.query(
    `UPDATE wiki_pages 
     SET title = $1, content = $2, blocks = $3, updated_at = NOW()
     WHERE id = $4`,
    [targetVer.title, targetVer.content, targetVer.blocks ? JSON.stringify(targetVer.blocks) : null, pageId]
  );

  logger.info('Page restored to previous version', { pageId, targetVersion, newVersion: restoredVersion.version });

  return restoredVersion;
}

/**
 * Prune old versions (keep last N versions)
 */
export async function pruneOldVersions(
  pool: Pool,
  pageId: number,
  keepCount: number = 100
): Promise<number> {
  const result = await pool.query(
    `WITH versions_to_keep AS (
       SELECT id FROM page_versions 
       WHERE page_id = $1 
       ORDER BY version DESC 
       LIMIT $2
     )
     DELETE FROM page_versions 
     WHERE page_id = $1 
       AND id NOT IN (SELECT id FROM versions_to_keep)
     RETURNING id`,
    [pageId, keepCount]
  );

  const deletedCount = result.rowCount || 0;
  
  if (deletedCount > 0) {
    logger.info('Pruned old page versions', { pageId, deletedCount });
  }

  return deletedCount;
}

/**
 * Get version statistics for a page
 */
export async function getVersionStats(pool: Pool, pageId: number): Promise<{
  totalVersions: number;
  firstVersion: Date | null;
  lastVersion: Date | null;
  contributors: Array<{ email: string; count: number }>;
}> {
  const statsResult = await pool.query(
    `SELECT 
       COUNT(*) as total,
       MIN(created_at) as first_version,
       MAX(created_at) as last_version
     FROM page_versions 
     WHERE page_id = $1`,
    [pageId]
  );

  const contributorsResult = await pool.query(
    `SELECT user_email, COUNT(*) as count
     FROM page_versions 
     WHERE page_id = $1 AND user_email IS NOT NULL
     GROUP BY user_email
     ORDER BY count DESC
     LIMIT 10`,
    [pageId]
  );

  return {
    totalVersions: parseInt(statsResult.rows[0].total),
    firstVersion: statsResult.rows[0].first_version,
    lastVersion: statsResult.rows[0].last_version,
    contributors: contributorsResult.rows.map(r => ({
      email: r.user_email,
      count: parseInt(r.count),
    })),
  };
}

export default {
  initVersionHistoryTable,
  createVersion,
  getPageVersions,
  getVersion,
  compareVersions,
  restoreVersion,
  pruneOldVersions,
  getVersionStats,
};
