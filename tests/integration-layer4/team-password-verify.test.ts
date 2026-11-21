/**
 * Layer 4: a team's password is verified inside one organization, against real Postgres.
 *
 * Rule: `verifyTeamPassword(name, password, organizationId)` finds the team by name in that
 * organization only. The right password of a team of another organization, a team that does not
 * exist and a team without a password all answer false, so the answers cannot be told apart; a
 * wrong password answers false; the right password of a team in the named organization answers true.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { addOrganizations } from './organizations-fixture';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('SKIP: DATABASE_URL not set — Layer 4 integration tests require Postgres');
  process.exit(0);
}

const SCHEMA = 'l4_sec2_team_password';
const scopedUrl = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return url.toString();
})();

const TABLES = `
  CREATE TABLE users (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password TEXT, provider VARCHAR(50), provider_id VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE teams (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    description TEXT, password TEXT, icon TEXT, color TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, "order" INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE members (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL, avatar_url TEXT, bio TEXT,
    github_username TEXT, skills TEXT[] NOT NULL DEFAULT '{}',
    joined_date TIMESTAMP NOT NULL DEFAULT NOW(), is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', invited_by INTEGER REFERENCES users(id),
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id)
  );
  CREATE TABLE wiki_pages (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
    blocks JSONB DEFAULT '[]', folder TEXT NOT NULL DEFAULT 'docs', tags TEXT[] NOT NULL DEFAULT '{}',
    author TEXT NOT NULL, parent_id INTEGER, position INTEGER,
    team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_published BOOLEAN NOT NULL DEFAULT TRUE, deleted_at TIMESTAMP,
    metadata JSONB DEFAULT '{}', icon TEXT
  );
  CREATE TABLE page_permissions (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, entity_id INTEGER, permission TEXT NOT NULL,
    granted_by INTEGER, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

let admin: Pool;
let scoped: Pool;
let storage: any;
let defaultOrg = 0;
let acmeOrg = 0;

async function insertTeam(name: string, organization: number, password: string | null) {
  const hash = password === null ? null : await bcrypt.hash(password, 4);
  await scoped.query(
    `INSERT INTO teams (name, display_name, organization_id, password) VALUES ($1, $1, $2, $3)`,
    [name, organization, hash]
  );
}

beforeAll(async () => {
  admin = new Pool({ connectionString: DATABASE_URL });
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  scoped = new Pool({ connectionString: scopedUrl });
  await scoped.query(TABLES);
  defaultOrg = await addOrganizations(scoped);
  acmeOrg = Number(
    (
      await scoped.query(
        `INSERT INTO organizations (slug, name) VALUES ('acme', 'Acme') RETURNING id`
      )
    ).rows[0].id
  );
  await insertTeam('home-locked', defaultOrg, 'home-secret');
  await insertTeam('acme-locked', acmeOrg, 'acme-secret');
  await insertTeam('home-open', defaultOrg, null);
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

describe('verifyTeamPassword is scoped to one organization', () => {
  it('accepts the right password of a team in the named organization', async () => {
    expect(await storage.verifyTeamPassword('home-locked', 'home-secret', defaultOrg)).toBe(true);
    expect(await storage.verifyTeamPassword('acme-locked', 'acme-secret', acmeOrg)).toBe(true);
  });

  it('refuses a wrong password', async () => {
    expect(await storage.verifyTeamPassword('home-locked', 'nope', defaultOrg)).toBe(false);
  });

  it('answers false for a team of another organization, as for a team that does not exist', async () => {
    const otherOrganization = await storage.verifyTeamPassword(
      'acme-locked',
      'acme-secret',
      defaultOrg
    );
    const missing = await storage.verifyTeamPassword('no-such-team', 'acme-secret', defaultOrg);
    expect(otherOrganization).toBe(false);
    expect(missing).toBe(false);
    expect(await storage.verifyTeamPassword('home-locked', 'home-secret', acmeOrg)).toBe(false);
  });

  it('answers false for a team without a password', async () => {
    expect(await storage.verifyTeamPassword('home-open', '', defaultOrg)).toBe(false);
    expect(await storage.verifyTeamPassword('home-open', 'anything', defaultOrg)).toBe(false);
  });
});
