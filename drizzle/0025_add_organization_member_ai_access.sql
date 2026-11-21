-- Organization member AI access (issue #124 X1c): a member may use AI only while the
-- organization has AI on and the member has been granted AI.
--
-- Additive and idempotent. Before this migration a member used AI exactly when their
-- organization had AI on, so every membership row that exists when the column is first added is
-- granted, in every organization. When the column is already there (a schema push created it,
-- or this file ran before) nothing is changed, so a later revocation survives a re-run.
--
-- Requires drizzle/0022_add_organizations.sql for deployments that have organizations. A
-- database without organization_members (a fresh install) is left alone: push creates the table
-- with the column, and the places that add members state their value explicitly.
-- Deployments apply this file after 0022, 0023 and 0024 and before `drizzle-kit push`.
-- drizzle/0025_add_organization_member_ai_access.down.sql reverts it while every member has AI
-- access.

DO $$
BEGIN
  IF to_regclass('organization_members') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = 'organization_members'::regclass
                AND attname = 'ai_allowed' AND NOT attisdropped) THEN
    RETURN;
  END IF;

  ALTER TABLE organization_members ADD COLUMN ai_allowed BOOLEAN NOT NULL DEFAULT FALSE;
  UPDATE organization_members SET ai_allowed = TRUE;
END $$;
