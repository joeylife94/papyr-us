#!/usr/bin/env node
/**
 * Apply the organizations migration (issue #124 X1a) ahead of `drizzle-kit push`.
 *
 * shared/schema.ts declares teams.organization_id and wiki_pages.organization_id NOT NULL. Push
 * cannot add a NOT NULL column to a table that already holds rows, so deployments run this first:
 * it applies drizzle/0022_add_organizations.sql, which creates the organization tables, moves
 * every existing account, team and page into the "default" organization and adds the columns and
 * constraints under the names push expects. Push then has nothing left to change. The file is
 * idempotent, so running this on every deploy is safe.
 *
 * On a database without the base tables yet (a fresh install) there is nothing to migrate: push
 * creates everything, and the default organization is created when the first account signs up.
 *
 *   npm run db:fts:prepare && npm run db:orgs:prepare && npm run db:push && npm run db:fts
 *
 * --down applies drizzle/0022_add_organizations.down.sql instead, which refuses while more than
 * one organization exists. Like apply-fts-schema.mjs, the script refuses non-local database
 * hosts unless --allow-remote is given.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const down = args.has('--down');
const allowRemote = args.has('--allow-remote');
const label = down ? '[db:orgs:down]' : '[db:orgs:prepare]';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const sqlPath = fileURLToPath(
  new URL(
    down ? '../drizzle/0022_add_organizations.down.sql' : '../drizzle/0022_add_organizations.sql',
    import.meta.url
  )
);

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
  const { rows } = await client.query(
    `SELECT to_regclass('users') IS NOT NULL AND to_regclass('teams') IS NOT NULL
            AND to_regclass('wiki_pages') IS NOT NULL AS ready`
  );
  if (!rows[0].ready) {
    console.log(`${label} No users/teams/wiki_pages tables yet; nothing to migrate.`);
  } else {
    await client.query('BEGIN');
    await client.query(await readFile(sqlPath, 'utf8'));
    await client.query('COMMIT');
    if (down) {
      console.log(`${label} Organization tables and columns removed.`);
    } else {
      const { rows: counts } = await client.query(
        `SELECT (SELECT count(*) FROM organizations)::int AS organizations,
                (SELECT count(*) FROM organization_members)::int AS members`
      );
      console.log(
        `${label} Organizations ready (${counts[0].organizations} organization(s), ` +
          `${counts[0].members} membership(s)).`
      );
    }
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`${label} Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
