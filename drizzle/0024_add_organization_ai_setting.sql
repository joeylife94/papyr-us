-- Organization AI setting (issue #124 X1c): each organization decides whether its content may be
-- sent to the external AI provider.
--
-- Additive and idempotent. Before this migration AI was an instance-wide behaviour, so every
-- organization that exists when the column is first added keeps AI on; organizations created
-- afterwards through the admin API start with it off (the column default). When the column is
-- already there (a schema push created it, or this file ran before) the existing rows are left
-- alone, so an owner's later choice of FALSE survives a re-run, with one exception: the
-- `default` organization is set to TRUE while it has no members. Nobody can have chosen "off"
-- for an organization without members, and this covers the row that 0022 inserts on a fresh
-- install after a push created the column with its FALSE default.
--
-- Requires drizzle/0022_add_organizations.sql for deployments that have organizations. A
-- database without an organizations table (a fresh install) is left alone: push creates the
-- table with the column, and the default organization is created with AI on by the application.
-- Deployments apply this file after 0022 and 0023 and before `drizzle-kit push`: push alone
-- would add the column with FALSE everywhere. drizzle/0024_add_organization_ai_setting.down.sql
-- reverts it while every organization has AI on.

DO $$
BEGIN
  IF to_regclass('organizations') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = 'organizations'::regclass
                AND attname = 'ai_enabled' AND NOT attisdropped) THEN
    IF to_regclass('organization_members') IS NOT NULL THEN
      UPDATE organizations o
         SET ai_enabled = TRUE
       WHERE o.slug = 'default'
         AND o.ai_enabled = FALSE
         AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = o.id);
    END IF;
    RETURN;
  END IF;

  ALTER TABLE organizations ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  UPDATE organizations SET ai_enabled = TRUE;
END $$;
