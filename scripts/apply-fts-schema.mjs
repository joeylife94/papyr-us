#!/usr/bin/env node
/**
 * Provision the wiki_pages full-text-search schema around `drizzle-kit push`.
 *
 * shared/schema.ts does not declare `search_vector` (declaring it would add the column to
 * every page API response), so `db:push` never creates it and treats an existing one as
 * drift. Non-interactively, push then either drops it (empty table, or --force) while
 * leaving the trigger that writes it behind, so every page INSERT/UPDATE fails; or, when
 * rows exist, hits the data-loss prompt, aborts, exits 0 and applies no schema change at
 * all. Wrap each push in two steps:
 *
 *   --before-push   drop the FTS trigger, index and column (derived data only) so the push
 *                   sees no drift and never prompts
 *   (default)       apply drizzle/0005_add_wiki_pages_fts.sql: column, backfill, GIN index,
 *                   trigger function, trigger — idempotent
 *
 * The script refuses non-local database hosts unless --allow-remote is given, so the
 * test-only entry point (`npm run test:db:fts`) cannot touch a shared database by accident.
 *
 *   npm run db:fts:prepare && npm run db:push && npm run db:fts     (deployments)
 *   npm run db:push -- --force && npm run test:db:fts                 (fresh test databases)
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const beforePush = args.has('--before-push');
const allowRemote = args.has('--allow-remote');
const label = beforePush ? '[db:fts:prepare]' : '[db:fts]';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const ftsSqlPath = fileURLToPath(
  new URL('../drizzle/0005_add_wiki_pages_fts.sql', import.meta.url)
);

// search_vector only ever holds values derived from title/content/tags; the post-push step
// recomputes it for every row.
const DROP_FTS_SQL = `
DO $$
BEGIN
  IF to_regclass('public.wiki_pages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_wiki_pages_search_vector ON wiki_pages;
    DROP INDEX IF EXISTS idx_wiki_pages_search_vector;
    ALTER TABLE wiki_pages DROP COLUMN IF EXISTS search_vector;
  END IF;
END
$$;`;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(`${label} DATABASE_URL is not set.`);
  process.exit(1);
}

let host;
try {
  host = new URL(databaseUrl).hostname;
} catch {
  console.error(`${label} DATABASE_URL is not a valid URL.`);
  process.exit(1);
}

if (!allowRemote && !LOCAL_HOSTS.has(host)) {
  console.error(`${label} Refusing to modify non-local database host "${host}".`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  if (beforePush) {
    await client.query(DROP_FTS_SQL);
    console.log(`${label} FTS trigger, index and column removed ahead of schema push.`);
  } else {
    await client.query(await readFile(ftsSqlPath, 'utf8'));
    const { rows } = await client.query(
      `SELECT
         (SELECT count(*) FROM information_schema.columns
           WHERE table_name = 'wiki_pages' AND column_name = 'search_vector') AS columns,
         (SELECT count(*) FROM pg_trigger
           WHERE tgname = 'trg_wiki_pages_search_vector') AS triggers`
    );
    if (Number(rows[0].columns) !== 1 || Number(rows[0].triggers) !== 1) {
      throw new Error('search_vector column or trigger is missing after applying the FTS schema');
    }
    console.log(`${label} wiki_pages FTS schema applied.`);
  }
} catch (error) {
  console.error(`${label} Failed:`, error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
