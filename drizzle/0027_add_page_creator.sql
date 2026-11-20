-- Page creator (WP0b): every page records the account that created it, set by the server.
--
-- Provenance only: the column grants no access. Ownership still comes from the owner grant
-- written at creation and from the author rule, both unchanged.
--
-- Additive and idempotent. When the column is already there (a schema push created it, or this
-- file ran before) nothing is touched, so a creator set or cleared afterwards survives a re-run.
-- Otherwise it adds the column, its foreign key and its index under the names push expects, and
-- claims a creator only where one was recorded at creation. Every path that creates a page for
-- an account writes one page_permissions row (a user grant whose granter is the grantee) right
-- after the page row, or in the same transaction. A page gets that account as creator when the
-- page has exactly one such self-granted user row (at any level: a later change of level keeps
-- the row), the row was written no earlier than the page and no later than five seconds after
-- it, and the account exists. Every other page keeps null: a page made by automation or a seed,
-- a page whose grants were changed, a page whose creator cannot be established. A wrong creator
-- would be worse than none. A wrong match could only name an account that held an owner grant
-- on the page when it was written, and it opens the page to no one.
--
-- Both created_at columns are `timestamp without time zone` with default now(), and the
-- application sets neither, so the two values are comparable as they are.
--
-- It prints how many pages got a creator and how many have none (a NOTICE).
--
-- Deployments apply this file after 0022 to 0026 and before `drizzle-kit push` (push alone adds
-- the column and the backfill is lost). A database without wiki_pages or users (a fresh install)
-- is left alone: push creates the table with the column. drizzle/0027_add_page_creator.down.sql
-- reverts it while every recorded creator is one this file would compute again.

DO $$
DECLARE
  claimed integer := 0;
  total integer;
BEGIN
  IF to_regclass('wiki_pages') IS NULL OR to_regclass('users') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = 'wiki_pages'::regclass
                AND attname = 'created_by_user_id' AND NOT attisdropped) THEN
    RETURN;
  END IF;

  ALTER TABLE wiki_pages ADD COLUMN created_by_user_id INTEGER;
  ALTER TABLE wiki_pages
    ADD CONSTRAINT wiki_pages_created_by_user_id_users_id_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL;
  CREATE INDEX idx_wiki_pages_created_by_user_id ON wiki_pages (created_by_user_id);

  IF to_regclass('page_permissions') IS NOT NULL THEN
    UPDATE wiki_pages w
       SET created_by_user_id = c.user_id
      FROM (
        SELECT pp.page_id, min(pp.entity_id) AS user_id
          FROM page_permissions pp
          JOIN wiki_pages p ON p.id = pp.page_id
         WHERE pp.entity_type = 'user'
           AND pp.entity_id IS NOT NULL
           AND pp.granted_by = pp.entity_id
         GROUP BY pp.page_id, p.created_at
        HAVING count(*) = 1
           AND bool_and(pp.created_at >= p.created_at
                    AND pp.created_at <= p.created_at + interval '5 seconds')
      ) c
     WHERE w.id = c.page_id
       AND EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id);
    GET DIAGNOSTICS claimed = ROW_COUNT;
  END IF;

  SELECT count(*) INTO total FROM wiki_pages;
  RAISE NOTICE '0027: % page(s) got a creator, % page(s) have none', claimed, total - claimed;
END $$;
