/**
 * Layer 4: which workflows an event can fire, against real Postgres (#124 X1b, decision D4).
 *
 * DBStorage.getActiveWorkflowsByTrigger used to filter by team only when it was given a team, so
 * an event with no team (a personal page, a daily note) returned every active workflow of every
 * team of every organization. It now:
 *   - returns nothing for an event with no valid team, however many active workflows exist;
 *   - returns, for a team, only that team's active workflows of the event's type, so another
 *     team's (and another organization's) workflows and team-less legacy rows never fire.
 *
 * The tables live in their own schema so this file can run next to the other Layer 4 files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'workflow_scope_l4';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TEAM_A = 71; // default organization
const TEAM_B = 72; // another organization

let admin: Pool;
let scoped: Pool;
let storage: any;

async function insertWorkflow(
  name: string,
  values: { teamId: number | null; trigger?: string; active?: boolean }
) {
  await scoped.query(
    `INSERT INTO workflows (name, team_id, is_active, trigger, actions, conditions, created_by)
     VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, 'l4')`,
    [
      name,
      values.teamId,
      values.active ?? true,
      JSON.stringify({ type: values.trigger ?? 'page_created', config: {} }),
    ]
  );
}

const names = (rows: Array<{ name: string }>) => rows.map((row) => row.name).sort();

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
      hashed_password TEXT, provider VARCHAR(50), provider_id VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE wiki_pages (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
      author TEXT NOT NULL, team_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await addOrganizations(scoped, undefined, { teams: [TEAM_A, TEAM_B] });
  // Team B belongs to another organization
  const { rows: acme } = await scoped.query(
    `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
  );
  await scoped.query(`UPDATE teams SET organization_id = $1 WHERE id = $2`, [acme[0].id, TEAM_B]);

  await scoped.query(`
    CREATE TABLE workflows (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      trigger JSONB NOT NULL, actions JSONB NOT NULL, conditions JSONB DEFAULT '[]',
      created_by TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await insertWorkflow('a-created', { teamId: TEAM_A });
  await insertWorkflow('a-created-2', { teamId: TEAM_A });
  await insertWorkflow('a-updated', { teamId: TEAM_A, trigger: 'page_updated' });
  await insertWorkflow('a-inactive', { teamId: TEAM_A, active: false });
  await insertWorkflow('b-created', { teamId: TEAM_B });
  await insertWorkflow('b-updated', { teamId: TEAM_B, trigger: 'page_updated' });
  await insertWorkflow('legacy-no-team', { teamId: null });

  process.env.DATABASE_URL = scopedUrl;
  const { DBStorage } = await import('../../server/storage.js');
  storage = new DBStorage();
});

afterAll(async () => {
  await storage?.pool.end();
  await scoped?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
});

describe('getActiveWorkflowsByTrigger', () => {
  it.each([undefined, null, '', 0, -1, NaN, 'team-a', 1.5, {}])(
    'returns nothing for an event with no valid team (%j), although active workflows exist',
    async (teamId) => {
      const { rows } = await scoped.query(
        `SELECT count(*)::int AS n FROM workflows WHERE is_active AND trigger->>'type' = 'page_created'`
      );
      expect(rows[0].n).toBeGreaterThan(2); // both organizations, and a team-less row
      expect(await storage.getActiveWorkflowsByTrigger('page_created', teamId)).toEqual([]);
    }
  );

  it("returns only the team's active workflows of the event type", async () => {
    expect(names(await storage.getActiveWorkflowsByTrigger('page_created', TEAM_A))).toEqual([
      'a-created',
      'a-created-2',
    ]);
    expect(names(await storage.getActiveWorkflowsByTrigger('page_updated', TEAM_A))).toEqual([
      'a-updated',
    ]);
  });

  it("never returns another team's or organization's workflow", async () => {
    expect(names(await storage.getActiveWorkflowsByTrigger('page_created', TEAM_B))).toEqual([
      'b-created',
    ]);
    expect(names(await storage.getActiveWorkflowsByTrigger('page_updated', TEAM_B))).toEqual([
      'b-updated',
    ]);
  });

  it('accepts the team id as a string of digits, as a task event carries it', async () => {
    expect(
      names(await storage.getActiveWorkflowsByTrigger('page_created', String(TEAM_A)))
    ).toEqual(['a-created', 'a-created-2']);
  });

  it('never returns a team-less legacy workflow, for any team', async () => {
    for (const teamId of [TEAM_A, TEAM_B]) {
      for (const type of ['page_created', 'page_updated']) {
        const rows = await storage.getActiveWorkflowsByTrigger(type, teamId);
        expect(names(rows)).not.toContain('legacy-no-team');
      }
    }
  });

  it('returns nothing for a team without workflows', async () => {
    expect(await storage.getActiveWorkflowsByTrigger('page_created', 9999)).toEqual([]);
  });
});
