-- Reverts drizzle/0022_add_organizations.sql (issue #124 X1a).
--
-- Only while at most one organization exists: with more, dropping the organization columns would
-- merge separate tenants into one shared space, so this refuses and changes nothing. Teams, pages
-- and accounts themselves are kept; only the organization tables and columns go.

DO $$
BEGIN
  IF to_regclass('organizations') IS NOT NULL
     AND (SELECT count(*) FROM organizations) > 1 THEN
    RAISE EXCEPTION 'more than one organization exists: refusing to merge tenants';
  END IF;
END $$;

ALTER TABLE wiki_pages DROP CONSTRAINT IF EXISTS wiki_pages_team_org_fk;
ALTER TABLE wiki_pages DROP CONSTRAINT IF EXISTS wiki_pages_organization_id_organizations_id_fk;
DROP INDEX IF EXISTS idx_wiki_pages_organization_id;
ALTER TABLE wiki_pages DROP COLUMN IF EXISTS organization_id;

ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_id_organization_id_unique;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_organization_id_organizations_id_fk;
ALTER TABLE teams DROP COLUMN IF EXISTS organization_id;

DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organizations;
