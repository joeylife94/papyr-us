-- Page creator (WP0b): every page records the account that created it, set by the server.
--
-- Provenance only: the column grants no access. Ownership comes from the owner grant written at
-- creation and team roles; on a page with no recorded creator, from the older rule that an author
-- text equal to an account's email names its owner.
--
-- Additive and idempotent. The column carries the comment '0027: backfilled' once the backfill
-- has run, and the file has three states:
--   - column absent: create the column, its foreign key and its index (under the names push
--     expects), run the backfill, set the comment (a normal upgrade);
--   - column present and not commented (a schema push ran first, or a fresh install created it):
--     run the backfill on the pages whose creator is NULL, then set the comment;
--   - column present and commented: nothing. A creator set or cleared afterwards, by the
--     application or by hand, is never touched, and an account renamed later is never named.
-- The comment is set in the same transaction as the backfill (the prepare script applies every
-- migration in one), and push leaves a column comment alone.
--
-- The backfill touches only pages whose creator is NULL. It claims a creator only where one was
-- recorded at creation and the page's own author text agrees. Every path that creates a page for
-- an account writes one page_permissions row (a user grant whose granter is the grantee) right
-- after the page row, or in the same transaction, and wrote the account's email or name as the
-- author. A page gets that account when
--   - it has exactly one such self-granted user row (at any level: a later change of level keeps
--     the row), no matter when, and that row was written no earlier than the page and no later
--     than five seconds after it;
--   - the account exists, and the page's author text equals that account's email or name;
--   - the author text is not the automation label 'Automation', whatever an account is called.
-- Every other page keeps null: a page made by automation or a seed, a page whose grants were
-- changed, an account that was renamed, a page whose creator cannot be established. A wrong
-- creator would be worse than none. A wrong match could only name an account that held an owner
-- grant on the page when it was written, and it opens the page to no one.
--
-- Both created_at columns are `timestamp without time zone` with default now(), and the
-- application sets neither, so the two values are comparable as they are.
--
-- It prints how many pages got a creator and how many have none (a NOTICE), only when at least
-- one page got a creator.
--
-- Deployments apply this file after 0022 to 0026 and before `drizzle-kit push` (a push that ran
-- first is filled by the next run of this file, once). A database
-- without wiki_pages or users (a fresh install) is left alone: push creates the table with the
-- column. drizzle/0027_add_page_creator.down.sql reverts it while every recorded creator is one
-- this file would compute again.

DO $$
DECLARE
  claimed integer := 0;
  without_creator integer;
BEGIN
  IF to_regclass('wiki_pages') IS NULL OR to_regclass('users') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'wiki_pages'::regclass
                    AND attname = 'created_by_user_id' AND NOT attisdropped) THEN
    ALTER TABLE wiki_pages ADD COLUMN created_by_user_id INTEGER;
    ALTER TABLE wiki_pages
      ADD CONSTRAINT wiki_pages_created_by_user_id_users_id_fk
      FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL;
    CREATE INDEX idx_wiki_pages_created_by_user_id ON wiki_pages (created_by_user_id);
  ELSIF (SELECT col_description('wiki_pages'::regclass, a.attnum)
           FROM pg_attribute a
          WHERE a.attrelid = 'wiki_pages'::regclass
            AND a.attname = 'created_by_user_id' AND NOT a.attisdropped) = '0027: backfilled' THEN
    RETURN;
  END IF;

  IF to_regclass('page_permissions') IS NOT NULL THEN
    UPDATE wiki_pages w
       SET created_by_user_id = c.user_id
      FROM (
        SELECT pp.page_id, min(pp.entity_id) AS user_id
          FROM page_permissions pp
          JOIN wiki_pages p ON p.id = pp.page_id
          LEFT JOIN users u ON u.id = pp.entity_id
         WHERE pp.entity_type = 'user'
           AND pp.entity_id IS NOT NULL
           AND pp.granted_by = pp.entity_id
         GROUP BY pp.page_id, p.created_at, p.author
        HAVING count(*) = 1
           AND bool_and(pp.created_at >= p.created_at
                    AND pp.created_at <= p.created_at + interval '5 seconds')
           AND bool_and(u.id IS NOT NULL
                    AND p.author <> 'Automation'
                    AND (p.author = u.email OR p.author = u.name))
      ) c
     WHERE w.id = c.page_id
       AND w.created_by_user_id IS NULL;
    GET DIAGNOSTICS claimed = ROW_COUNT;
  END IF;

  COMMENT ON COLUMN wiki_pages.created_by_user_id IS '0027: backfilled';

  IF claimed > 0 THEN
    SELECT count(*) INTO without_creator FROM wiki_pages WHERE created_by_user_id IS NULL;
    RAISE NOTICE '0027: % page(s) got a creator, % page(s) have none', claimed, without_creator;
  END IF;
END $$;
