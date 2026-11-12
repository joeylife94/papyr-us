-- Template organizations (issue #124 X1b): templates become organization data.
--
-- Additive and idempotent. Every existing template moves into the default organization, so a
-- deployment behaves as before. After this migration templates.organization_id is NOT NULL and
-- the template routes read and write only the caller's organization. Template categories stay
-- an instance-wide taxonomy and are not touched.
--
-- Requires drizzle/0022_add_organizations.sql. Deployments apply this file after it and before
-- `drizzle-kit push`: push alone cannot add a NOT NULL column to a table that holds rows.
-- Constraint and index names match the ones drizzle-kit derives from shared/schema.ts, so push
-- finds nothing left to change. A database without a templates table (a fresh install) is left
-- alone: push creates the table with the column. drizzle/0023_add_template_organizations.down.sql
-- reverts it while at most one organization owns templates.

DO $$
BEGIN
  IF to_regclass('templates') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('organizations') IS NULL THEN
    RAISE EXCEPTION 'organizations does not exist: apply drizzle/0022_add_organizations.sql first';
  END IF;

  ALTER TABLE templates ADD COLUMN IF NOT EXISTS organization_id INTEGER;

  -- The default organization is created only when there are templates to place in it.
  IF EXISTS (SELECT 1 FROM templates WHERE organization_id IS NULL) THEN
    INSERT INTO organizations (slug, name) VALUES ('default', 'Default')
      ON CONFLICT (slug) DO NOTHING;
    UPDATE templates
       SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
     WHERE organization_id IS NULL;
  END IF;

  ALTER TABLE templates ALTER COLUMN organization_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_templates_organization_id ON templates (organization_id);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'templates_organization_id_organizations_id_fk'
                    AND conrelid = 'templates'::regclass) THEN
    ALTER TABLE templates
      ADD CONSTRAINT templates_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
END $$;
