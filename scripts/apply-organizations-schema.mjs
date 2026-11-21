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
 * - drizzle/0023_add_template_organizations.sql (X1b): moves every existing template into it;
 * - drizzle/0024_add_organization_ai_setting.sql (X1c): adds the per-organization AI setting,
 *   on for every organization that exists when it is added;
 * - drizzle/0025_add_organization_member_ai_access.sql (X1c): adds the per-member AI access,
 *   granted to every membership that exists when it is added;
 * - drizzle/0026_notifications_to_accounts.sql (WP0a): addresses every notification to the
 *   account whose email equals the roster row's, in that account's organization; notifications
 *   that cannot be assigned are kept in notification_roster_archive with a reason, and the
 *   counts are printed;
 * - drizzle/0027_add_page_creator.sql (WP0b): adds wiki_pages.created_by_user_id and, once per
 *   database, records a creator only for pages whose creation grant and author text prove one (it
 *   prints how many pages got one). A push that ran first leaves the column empty and unmarked;
 *   the next prepare fills it and marks it;
 * - drizzle/0028_convert_roster_team_access.sql (WP2): turns the team access that directory
 *   (`members`) rows gave into team_members rows, once, and records them.
 * - drizzle/0029_add_organization_invitations.sql (#124 X1d): adds organization_invitations
 *   (token hashes only); its down file refuses while an invitation is pending.
 *
 * All add their columns and constraints under the names push expects, so push then has nothing
 * left to change. All are idempotent, so running this on every deploy is safe.
 *
 * On a database without the base tables yet (a fresh install) there is nothing to migrate: push
 * creates everything, and the default organization is created when the first account signs up.
 *
 *   npm run db:fts:prepare && npm run db:orgs:prepare && npm run db:push && npm run db:fts
 *
 * --down applies the .down.sql files in reverse order. Each refuses while it would lose a
 * boundary (an organization with AI turned off, a member without AI access, more than one
 * organization, templates of more than one, a page that records a creator the up file would not
 * compute again, a converted team membership with a raised role, or an invitation that is still
 * pending) or would misdeliver or lose a notification (a recipient or sender account with no
 * roster row, a notification of an organization its recipient has left, an archived notification
 * whose records are gone), and then nothing is changed. Like apply-fts-schema.mjs, the script
 * refuses non-local database hosts unless --allow-remote is given.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const down = args.has('--down');
const allowRemote = args.has('--allow-remote');
const label = down ? '[db:orgs:down]' : '[db:orgs:prepare]';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const MIGRATIONS = [
  '0022_add_organizations',
  '0023_add_template_organizations',
  '0024_add_organization_ai_setting',
  '0025_add_organization_member_ai_access',
  '0026_notifications_to_accounts',
  '0027_add_page_creator',
  '0028_convert_roster_team_access',
  '0029_add_organization_invitations',
];
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
// Migrations tell the operator what they did or left undone with NOTICE messages that start with
// their four-digit number (for example "0026 notifications: 4 assigned ...", "0027: 6 page(s) got
// a creator ..." or "0028: converted 3 directory row(s) ..."). Those are printed; every other
// notice (the "already exists, skipping" of the idempotent files) stays quiet.
client.on('notice', (notice) => {
  if (/^\d{4}[ :]/.test(notice.message)) console.log(`${label} ${notice.message}`);
});

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
      const held = (await client.query(`SELECT to_regclass('notification_roster_archive') AS t`))
        .rows[0].t
        ? (
            await client.query(
              `SELECT count(*)::int AS n FROM notification_roster_archive WHERE reason <> 'sender_unmapped'`
            )
          ).rows[0].n
        : 0;
      console.log(
        `${label} Organizations ready (${counts[0].organizations} organization(s), ` +
          `${counts[0].members} membership(s), ${templates} template(s) placed, ` +
          `${held} notification(s) held in notification_roster_archive).`
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
