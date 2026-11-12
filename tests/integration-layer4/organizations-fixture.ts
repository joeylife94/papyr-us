/**
 * Layer 4 fixture: bring a test schema built in the pre-organization shape to the shape of
 * drizzle/0022_add_organizations.sql (issue #124 X1a) and 0024 (X1c), so DBStorage runs against it.
 *
 * Most Layer 4 files hand-write their tables as they were before organizations and insert rows
 * by hand. `addOrganizations` applies the real 0022 migration to those tables, which puts every
 * existing account, team and page into the default organization, exactly as a deployment's
 * migration does. Test-only differences, so those files keep describing a single-organization
 * deployment without spelling out organizations in every insert:
 * - wiki_pages_team_org_fk is left out: these fixtures write team ids without teams rows;
 * - pages and teams inserted later default to the default organization;
 * - accounts inserted later join it (a trigger, as sign-up does through DBStorage);
 * - `teams` and `users` rows can be added for ids a file uses without creating them, because a
 *   new page takes its team's organization, or its creator's.
 *
 * Organization rules themselves are proven by organizations.test.ts, which uses the migration
 * without these conveniences.
 */
import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';

const COMPOSITE_KEY =
  /  IF NOT EXISTS \(SELECT 1 FROM pg_constraint\s+WHERE conname = 'wiki_pages_team_org_fk'[\s\S]*?END IF;\n/;
const FULL_MIGRATION = readFileSync(
  new URL('../../drizzle/0022_add_organizations.sql', import.meta.url),
  'utf8'
);
if (!COMPOSITE_KEY.test(FULL_MIGRATION)) throw new Error('0022 changed: update the fixture');
const MIGRATION = FULL_MIGRATION.replace(COMPOSITE_KEY, '');
// 0024 (#124 X1c) adds the organization AI setting and turns it on for the organizations that
// exist, so every file describes an upgraded deployment: the default organization has AI on.
const AI_SETTING_MIGRATION = readFileSync(
  new URL('../../drizzle/0024_add_organization_ai_setting.sql', import.meta.url),
  'utf8'
);

/**
 * Applies 0022 to a pre-organization test schema and returns the default organization's id.
 * `schema` names the test schema when `pool` does not already use it as its search path.
 * `teams` and `users` add rows (in the default organization) for ids the file refers to.
 */
export async function addOrganizations(
  pool: Pool,
  schema?: string,
  extra: { teams?: number[]; users?: Array<{ id: number; email: string }> } = {}
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (schema) await client.query(`SET LOCAL search_path TO ${schema}`);
    const { rows: current } = await client.query('SELECT current_schema() AS name');
    const target = String(current[0].name);
    // 0022 needs the base tables. Some files never create users or teams; add them in their
    // pre-organization shape (shared/schema.ts before #124 X1).
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
        hashed_password TEXT, provider VARCHAR(50), provider_id VARCHAR(255),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
        description TEXT, password TEXT, icon TEXT, color TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE, "order" INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(MIGRATION);
    await client.query(AI_SETTING_MIGRATION);
    const { rows } = await client.query(`SELECT id FROM organizations WHERE slug = 'default'`);
    const organizationId = Number(rows[0].id);
    // The trigger names its schema, so inserts through a pool without the search path work too.
    await client.query(`
      ALTER TABLE wiki_pages ALTER COLUMN organization_id SET DEFAULT ${organizationId};
      ALTER TABLE teams ALTER COLUMN organization_id SET DEFAULT ${organizationId};
      CREATE OR REPLACE FUNCTION l4_join_default_organization() RETURNS trigger AS $$
      BEGIN
        INSERT INTO "${target}".organization_members (organization_id, user_id, role)
        VALUES (${organizationId}, NEW.id, 'member')
        ON CONFLICT (user_id) DO NOTHING;
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS l4_join_default_organization ON users;
      CREATE TRIGGER l4_join_default_organization AFTER INSERT ON users
        FOR EACH ROW EXECUTE FUNCTION l4_join_default_organization();
    `);
    for (const teamId of extra.teams ?? []) {
      await client.query(
        `INSERT INTO teams (id, name, display_name) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING`,
        [teamId, `l4-team-${teamId}`]
      );
    }
    for (const user of extra.users ?? []) {
      await client.query(
        `INSERT INTO users (id, name, email) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING`,
        [user.id, user.email]
      );
    }
    await client.query(
      `SELECT setval(pg_get_serial_sequence('teams', 'id'), GREATEST((SELECT max(id) FROM teams), 1))`
    );
    await client.query(
      `SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT max(id) FROM users), 1))`
    );
    await client.query('COMMIT');
    return organizationId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
