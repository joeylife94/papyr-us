-- Reverts drizzle/0031_add_team_members_can_edit.sql (WP7).
--
-- Drops teams.members_can_edit. The setting is lost with it: teams that had it on stop giving
-- their plain members edit rights (they are viewers again, which is what the previous release
-- does), and applying 0031 again starts every team off. The number of teams that had it on is
-- reported. Does nothing when the table or the column is not there.

DO $$
DECLARE
  turned_on integer := 0;
BEGIN
  IF to_regclass('teams') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = to_regclass('teams') AND attname = 'members_can_edit' AND NOT attisdropped
  ) THEN
    RETURN;
  END IF;
  SELECT count(*) INTO turned_on FROM teams WHERE members_can_edit;
  ALTER TABLE teams DROP COLUMN members_can_edit;
  RAISE NOTICE '0031 down: members_can_edit dropped; % team(s) had it on and their members are viewers again', turned_on;
END
$$;
