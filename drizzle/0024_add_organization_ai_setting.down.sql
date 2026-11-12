-- Reverts drizzle/0024_add_organization_ai_setting.sql (issue #124 X1c).
--
-- Refuses, and changes nothing, while any organization has AI turned off: the previous
-- application has no per-organization switch and would send that organization's content to the
-- AI provider. Otherwise drops the column. Does nothing when the column (or the table) is not
-- there.

DO $$
BEGIN
  IF to_regclass('organizations') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'organizations'::regclass
                    AND attname = 'ai_enabled' AND NOT attisdropped) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM organizations WHERE ai_enabled = FALSE) THEN
    RAISE EXCEPTION 'an organization has AI turned off: the previous application would send its content to the AI provider';
  END IF;

  ALTER TABLE organizations DROP COLUMN ai_enabled;
END $$;
