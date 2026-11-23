-- Block anchor and resolved state of comment threads (WP15): four nullable columns on comments.
--
--   block_id             the block of the page a thread is about (top-level comments only)
--   block_excerpt        at most 200 characters of that block's text, taken by the server
--   resolved_at          when the thread was resolved; NULL while it is open
--   resolved_by_user_id  the account that resolved it; set to NULL when that account is deleted
--
-- Nothing is rewritten: every comment that exists keeps NULL in all four, so it reads as a
-- page-level comment on an open thread, and nobody's access changes. The columns are the same
-- as shared/schema.ts declares, so whether this file or `drizzle-kit push` adds them first, the
-- other has nothing left to do.
--
-- Idempotent: columns that are there are left alone, and the foreign key is added only when the
-- column was added here. A database without the comments table (a fresh install) is left alone:
-- push creates the table with the columns. The NOTICE starts with four digits, so the prepare
-- script prints it.
-- Requires drizzle/0022_add_organizations.sql. Deployments apply this file after 0022 to 0031
-- and before `drizzle-kit push`.

DO $$
DECLARE
  added text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('comments') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = to_regclass('comments') AND attname = 'block_id' AND NOT attisdropped) THEN
    ALTER TABLE comments ADD COLUMN block_id text;
    added := array_append(added, 'block_id'::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = to_regclass('comments') AND attname = 'block_excerpt' AND NOT attisdropped) THEN
    ALTER TABLE comments ADD COLUMN block_excerpt text;
    added := array_append(added, 'block_excerpt'::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = to_regclass('comments') AND attname = 'resolved_at' AND NOT attisdropped) THEN
    ALTER TABLE comments ADD COLUMN resolved_at timestamptz;
    added := array_append(added, 'resolved_at'::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = to_regclass('comments') AND attname = 'resolved_by_user_id' AND NOT attisdropped) THEN
    ALTER TABLE comments ADD COLUMN resolved_by_user_id integer;
    IF to_regclass('users') IS NOT NULL THEN
      ALTER TABLE comments
        ADD CONSTRAINT comments_resolved_by_user_id_users_id_fk
        FOREIGN KEY (resolved_by_user_id) REFERENCES users (id) ON DELETE SET NULL;
    END IF;
    added := array_append(added, 'resolved_by_user_id'::text);
  END IF;

  IF array_length(added, 1) > 0 THEN
    RAISE NOTICE '0032 comment threads: added % to comments; existing comments stay page-level and open', array_to_string(added, ', ');
  END IF;
END
$$;
