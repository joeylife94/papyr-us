#!/usr/bin/env node
/**
 * Apply the organization migrations (issue #124 X1) ahead of `drizzle-kit push`.
 *
 * shared/schema.ts declares teams.organization_id, wiki_pages.organization_id and
 * templates.organization_id NOT NULL. Push cannot add a NOT NULL column to a table that already
 * holds rows, so deployments run this first. It applies, in order and in one transaction:
 *
 * - drizzle/0022_add_organizations.sql (X1a): creates the organization tables and moves every
 *   existing account, team and page into the "default" organization;
 * - drizzle/0023_add_template_organizations.sql (X1b): moves every existing template into it.
 *
 * Both add their columns and constraints under the names push expects, so push then has nothing
 * left to change. Both are idempotent, so running this on every deploy is safe.
 *
 * On a database without the base tables yet (a fresh install) there is nothing to migrate: push
 * creates everything, and the default organization is created when the first account signs up.
 *
 *   npm run db:fts:prepare && npm run db:orgs:prepare && npm run db:push && npm run db:fts
 *
 * --down applies the two .down.sql files in reverse order. Each refuses while it would merge
 * tenants (more than one organization, or templates of more than one), and then nothing is
 * changed. Like apply-fts-schema.mjs, the script refuses non-local database hosts unless
 * --allow-remote is given.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const down = args.has('--down');
const allowRemote = args.has('--allow-remote');
const label = down ? '[db:orgs:down]' : '[db:orgs:prepare]';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const MIGRATIONS = ['0022_add_organizations', '0023_add_template_organizations'];
const sqlPaths = (down ? [...MIGRATIONS].reverse() : MIGRATIONS).map((name) =>
  fileURLToPath(new URL(`../drizzle/${name}${down ? '.down' : ''}.sql`, import.meta.url))
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
    for (const sqlPath of sqlPaths) {
      await client.query(await readFile(sqlPath, 'utf8'));
    }
    await client.query('COMMIT');
    if (down) {
      console.log(`${label} Organization tables and columns removed.`);
    } else {
      const { rows: counts } = await client.query(
        `SELECT (SELECT count(*) FROM organizations)::int AS organizations,
                (SELECT count(*) FROM organization_members)::int AS members,
                to_regclass('templates') IS NOT NULL AS has_templates`
      );
      const templates = counts[0].has_templates
        ? (await client.query('SELECT count(*)::int AS n FROM templates')).rows[0].n
        : 0;
      console.log(
        `${label} Organizations ready (${counts[0].organizations} organization(s), ` +
          `${counts[0].members} membership(s), ${templates} template(s) placed).`
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
