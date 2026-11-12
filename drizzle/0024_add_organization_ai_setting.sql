-- Organization AI setting (issue #124 X1c): each organization decides whether its content may be
-- sent to the external AI provider.
--
-- Additive and idempotent. Before this migration AI was an instance-wide behaviour, so every
-- organization that exists when the column is first added keeps AI on; organizations created
-- afterwards through the admin API start with it off (the column default). When the column is
-- already there nothing is changed, so an owner's later choice of FALSE survives a re-run.
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
    RETURN;
  END IF;

  ALTER TABLE organizations ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  UPDATE organizations SET ai_enabled = TRUE;
END $$;
