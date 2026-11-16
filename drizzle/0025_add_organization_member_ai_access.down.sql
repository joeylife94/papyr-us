-- Reverts drizzle/0025_add_organization_member_ai_access.sql (issue #124 X1c).
--
-- Refuses, and changes nothing, while any member does not have AI access: the previous
-- application has no per-member grant and would give that member AI wherever its organization
-- has AI on, and applying 0025 again would grant every member. Otherwise drops the column. Does
-- nothing when the column (or the table) is not there.

DO $$
BEGIN
  IF to_regclass('organization_members') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'organization_members'::regclass
                    AND attname = 'ai_allowed' AND NOT attisdropped) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM organization_members WHERE ai_allowed = FALSE) THEN
    RAISE EXCEPTION 'a member does not have AI access: the previous application would give it AI wherever its organization has AI on';
  END IF;

  ALTER TABLE organization_members DROP COLUMN ai_allowed;
END $$;
