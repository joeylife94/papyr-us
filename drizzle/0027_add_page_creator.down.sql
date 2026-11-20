-- Reverts drizzle/0027_add_page_creator.sql (WP0b).
--
-- Refuses, and changes nothing, while any page records a creator that applying 0027 again would
-- not compute (its creation grant was changed or deleted, or the creator was set another way):
-- dropping the column would lose it for good. Otherwise drops the index and the column. Does
-- nothing when the column (or the table) is not there. A page made normally after 0027 has its
-- creation grant, so this stays usable unless grants were revoked.

DO $$
BEGIN
  IF to_regclass('wiki_pages') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'wiki_pages'::regclass
                    AND attname = 'created_by_user_id' AND NOT attisdropped) THEN
    RETURN;
  END IF;

  IF to_regclass('page_permissions') IS NULL THEN
    IF EXISTS (SELECT 1 FROM wiki_pages WHERE created_by_user_id IS NOT NULL) THEN
      RAISE EXCEPTION 'a page records a creator the previous application cannot keep, and applying 0027 again would not restore it';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM wiki_pages w
     WHERE w.created_by_user_id IS NOT NULL
       AND w.created_by_user_id IS DISTINCT FROM (
         SELECT min(pp.entity_id)
           FROM page_permissions pp
          WHERE pp.page_id = w.id
            AND pp.entity_type = 'user'
            AND pp.entity_id IS NOT NULL
            AND pp.granted_by = pp.entity_id
         HAVING count(*) = 1
            AND bool_and(pp.created_at >= w.created_at
                     AND pp.created_at <= w.created_at + interval '5 seconds')
       )
  ) THEN
    RAISE EXCEPTION 'a page records a creator the previous application cannot keep, and applying 0027 again would not restore it';
  END IF;

  DROP INDEX IF EXISTS idx_wiki_pages_created_by_user_id;
  ALTER TABLE wiki_pages DROP COLUMN created_by_user_id;
END $$;
