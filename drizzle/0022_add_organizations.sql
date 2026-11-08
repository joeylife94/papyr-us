-- Organizations (issue #124 X1a): the tenant boundary.
--
-- Additive and idempotent. Every existing account, team and page moves into one organization,
-- "default", so a deployment behaves as before. After this migration:
-- - organizations / organization_members exist, with at most one organization per account;
-- - teams.organization_id and wiki_pages.organization_id are NOT NULL;
-- - a team page's organization is its team's (wiki_pages_team_org_fk).
--
-- Deployments apply this file before `drizzle-kit push` (scripts/apply-organizations-schema.mjs,
-- `npm run db:orgs:prepare`): push alone cannot add a NOT NULL column to tables that hold rows.
-- Constraint names match the ones drizzle-kit derives from shared/schema.ts, so push finds
-- nothing left to change. drizzle/0022_add_organizations.down.sql reverts it while only one
-- organization exists.

CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT organizations_slug_unique UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS organization_members (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_user_id_unique
  ON organization_members (user_id);

INSERT INTO organizations (slug, name) VALUES ('default', 'Default')
  ON CONFLICT (slug) DO NOTHING;

-- Every existing account joins the default organization as a member.
INSERT INTO organization_members (organization_id, user_id, role)
SELECT o.id, u.id, 'member'
  FROM users u
 CROSS JOIN organizations o
 WHERE o.slug = 'default'
ON CONFLICT (user_id) DO NOTHING;

-- Teams: all existing teams belong to the default organization.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS organization_id INTEGER;
UPDATE teams
   SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
 WHERE organization_id IS NULL;
ALTER TABLE teams ALTER COLUMN organization_id SET NOT NULL;

-- Pages: a team page takes its team's organization; a team-less page the default one.
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS organization_id INTEGER;
UPDATE wiki_pages p
   SET organization_id = COALESCE(
         (SELECT t.organization_id FROM teams t WHERE t.id = p.team_id),
         (SELECT id FROM organizations WHERE slug = 'default'))
 WHERE p.organization_id IS NULL;
ALTER TABLE wiki_pages ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wiki_pages_organization_id ON wiki_pages (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'organization_members_organization_id_organizations_id_fk'
                    AND conrelid = 'organization_members'::regclass) THEN
    ALTER TABLE organization_members
      ADD CONSTRAINT organization_members_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'organization_members_user_id_users_id_fk'
                    AND conrelid = 'organization_members'::regclass) THEN
    ALTER TABLE organization_members
      ADD CONSTRAINT organization_members_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'teams_organization_id_organizations_id_fk'
                    AND conrelid = 'teams'::regclass) THEN
    ALTER TABLE teams
      ADD CONSTRAINT teams_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'teams_id_organization_id_unique'
                    AND conrelid = 'teams'::regclass) THEN
    ALTER TABLE teams
      ADD CONSTRAINT teams_id_organization_id_unique UNIQUE (id, organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'wiki_pages_organization_id_organizations_id_fk'
                    AND conrelid = 'wiki_pages'::regclass) THEN
    ALTER TABLE wiki_pages
      ADD CONSTRAINT wiki_pages_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'wiki_pages_team_org_fk'
                    AND conrelid = 'wiki_pages'::regclass) THEN
    ALTER TABLE wiki_pages
      ADD CONSTRAINT wiki_pages_team_org_fk
      FOREIGN KEY (team_id, organization_id) REFERENCES teams(id, organization_id);
  END IF;
END $$;
