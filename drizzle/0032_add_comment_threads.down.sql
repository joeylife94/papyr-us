-- Reverts drizzle/0032_add_comment_threads.sql (WP15).
--
-- Refuses, and changes nothing, while any comment is anchored to a block or resolved: dropping
-- the columns would lose that for good, and applying 0032 again would not restore it. Otherwise
-- drops the four columns (the foreign key goes with its column). Does nothing when the table or
-- the columns are not there.

DO $$
BEGIN
  IF to_regclass('comments') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = to_regclass('comments') AND attname = 'block_id' AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = to_regclass('comments') AND attname = 'resolved_at' AND NOT attisdropped) THEN
    IF EXISTS (SELECT 1 FROM comments WHERE block_id IS NOT NULL OR resolved_at IS NOT NULL) THEN
      RAISE EXCEPTION 'a comment is anchored to a block or resolved, and the previous application cannot keep that';
    END IF;
  END IF;

  ALTER TABLE comments DROP COLUMN IF EXISTS resolved_by_user_id;
  ALTER TABLE comments DROP COLUMN IF EXISTS resolved_at;
  ALTER TABLE comments DROP COLUMN IF EXISTS block_excerpt;
  ALTER TABLE comments DROP COLUMN IF EXISTS block_id;
END
$$;
