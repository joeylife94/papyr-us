-- Per-team setting "members can edit team pages" (WP7): teams.members_can_edit.
--
-- On a team page a plain member of the team is a viewer; with this setting on the member is an
-- editor of the team's pages (owners and admins are unchanged). The owner's decision: on for teams
-- created from now on, off for every team that exists when the column is added, so that no
-- existing team's rights widen until its owner or admin turns the setting on.
--
-- The column is added NOT NULL with the default FALSE, and that is also the definition in
-- shared/schema.ts. So the order of the deploy steps does not matter: whether this file or
-- `drizzle-kit push` creates the column first, every team that already exists reads FALSE, and
-- the file has nothing to mark or to decide afterwards. A team is created with the setting ON by
-- the application (DBStorage.createTeam and createTeamWithOwner, the only inserts of a team); a
-- row inserted any other way without the column is OFF, which is the safe side.
--
-- Idempotent: when the column is there the file changes nothing, so a value an owner or admin set
-- since is kept. A database without the teams table (a fresh install) is left alone: push creates
-- the table with the column. NOTICE messages of this file start with four digits, so the prepare
-- script prints them.
-- Requires drizzle/0022_add_organizations.sql. Deployments apply this file after 0022 to 0030
-- and before `drizzle-kit push`.

DO $$
DECLARE
  affected integer;
  turned_on integer;
  column_default text;
BEGIN
  IF to_regclass('teams') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = to_regclass('teams') AND attname = 'members_can_edit' AND NOT attisdropped
  ) THEN
    SELECT count(*) FILTER (WHERE members_can_edit), count(*) FILTER (WHERE NOT members_can_edit)
      INTO turned_on, affected FROM teams;
    RAISE NOTICE '0031 members_can_edit: the column already exists, nothing changed (% team(s) have it on, % off)',
      turned_on, affected;
    -- The default must stay false: a column created with default true (a schema push of a changed
    -- definition) turns every team that existed then on. Nothing is changed here; say so.
    SELECT pg_get_expr(d.adbin, d.adrelid) INTO column_default
      FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     WHERE d.adrelid = to_regclass('teams') AND a.attname = 'members_can_edit';
    IF column_default IS DISTINCT FROM 'false' THEN
      RAISE NOTICE '0031 WARNING: teams.members_can_edit has the default % instead of false; teams created without the column set are on, and teams that existed when the column was added with that default may have been turned on. Check shared/schema.ts and the teams table.',
        COALESCE(column_default, 'none');
    END IF;
    RETURN;
  END IF;

  ALTER TABLE teams ADD COLUMN members_can_edit boolean DEFAULT false NOT NULL;
  SELECT count(*) INTO affected FROM teams;
  RAISE NOTICE '0031 members_can_edit: % existing team(s) set to false; their members stay viewers until an owner or admin turns it on',
    affected;
END
$$;
