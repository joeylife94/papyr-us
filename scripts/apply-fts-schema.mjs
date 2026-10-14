#!/usr/bin/env node
/**
 * Test-environment helper: apply the wiki_pages full-text-search schema
 * (drizzle/0005_add_wiki_pages_fts.sql) to the database in DATABASE_URL.
 *
 * `npm run db:push` builds the schema from shared/schema.ts, which does not declare
 * `search_vector`, so a pushed test database has no FTS column and secure search
 * (`POST /api/ai/search`) fails. Run this AFTER db:push: a later push treats the
 * column as drift and drops it.
 *
 * The SQL is idempotent. The script refuses non-local hosts so it cannot be
 * pointed at a shared or production database by accident.
 *
 * Run with: DATABASE_URL=postgresql://... npm run test:db:fts
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const ftsSqlPath = fileURLToPath(
  new URL('../drizzle/0005_add_wiki_pages_fts.sql', import.meta.url)
);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[test:db:fts] DATABASE_URL is not set.');
  process.exit(1);
}

let host;
try {
  host = new URL(databaseUrl).hostname;
} catch {
  console.error('[test:db:fts] DATABASE_URL is not a valid URL.');
  process.exit(1);
}

if (!LOCAL_HOSTS.has(host)) {
  console.error(`[test:db:fts] Refusing to modify non-local database host "${host}".`);
  process.exit(1);
}

const sql = await readFile(ftsSqlPath, 'utf8');
const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'wiki_pages' AND column_name = 'search_vector'`
  );
  if (rows.length !== 1) {
    throw new Error('wiki_pages.search_vector is missing after applying the FTS schema');
  }
  console.log('[test:db:fts] wiki_pages FTS schema applied.');
} catch (error) {
  console.error('[test:db:fts] Failed to apply FTS schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
