-- Reverts drizzle/0023_add_template_organizations.sql (issue #124 X1b).
--
-- Only while at most one organization owns templates: with more, dropping the column would put
-- the templates of separate tenants into one shared space, so this refuses and changes nothing.
-- Templates keep all their other data; only the organization column, its index and its foreign
-- key go. Does nothing when the column (or the table) is not there.

DO $$
BEGIN
  IF to_regclass('templates') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = 'templates'::regclass
                AND attname = 'organization_id' AND NOT attisdropped) THEN
    IF (SELECT count(DISTINCT organization_id) FROM templates) > 1 THEN
      RAISE EXCEPTION 'templates of more than one organization exist: refusing to merge tenants';
    END IF;
  END IF;

  ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_organization_id_organizations_id_fk;
  DROP INDEX IF EXISTS idx_templates_organization_id;
  ALTER TABLE templates DROP COLUMN IF EXISTS organization_id;
END $$;
