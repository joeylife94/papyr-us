-- Reverts drizzle/0028_convert_roster_team_access.sql (WP2).
--
-- Removes exactly the team_members rows the migration created (those recorded in
-- team_roster_conversions) and drops the record. A membership an owner added later, or one that
-- was removed and added again, is a different row and stays.
--
-- Refuses, and changes nothing, while a recorded membership holds a role above member: an owner
-- raised it, and the previous application would drop that decision together with the row. Does
-- nothing when the record table is not there.

DO $$
BEGIN
  IF to_regclass('team_roster_conversions') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('team_members') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM team_members tm
                JOIN team_roster_conversions c ON c.team_member_id = tm.id
               WHERE tm.role <> 'member') THEN
      RAISE EXCEPTION 'a converted team membership was given a higher role: removing it would drop an owner''s decision';
    END IF;
    DELETE FROM team_members tm USING team_roster_conversions c
     WHERE tm.id = c.team_member_id AND tm.role = 'member';
  END IF;
  DROP TABLE team_roster_conversions;
END $$;
