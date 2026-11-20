-- Team membership is the team_members table and nothing else (WP2).
--
-- Until now a directory row (`members`, matched to an account by exactly its email) also gave
-- team access: `getUserTeamIds` treated an active row on a team of the account's own
-- organization as a membership, but only while the account had no team_members row in that
-- organization. This file turns exactly that access into team_members rows, as plain members, so
-- that nobody loses access when the application stops reading directory rows and nobody gains
-- any.
--
-- Converted: an account that belongs to an organization and has no team_members row in a team of
-- that organization gets one row for every active directory row of its email on a team of that
-- organization. Not converted (it grants nothing today, or nothing beyond today):
--   - an account that already has a team_members row in its organization (the directory rows
--     were ignored for it);
--   - an inactive directory row, a row without a team, a row on another organization's team,
--     an email that no account has, an account without an organization.
-- One difference is a narrowing, not a page access: an account with a membership elsewhere and a
-- directory row on a team used to be answered role `member` on that team by the role lookup
-- (`getUserTeamRole`; no page access came from it). It is not converted, and leaving that team
-- now answers 404.
--
-- Every row it creates is recorded in team_roster_conversions (by team_members.id), which
-- drizzle/0028_convert_roster_team_access.down.sql reads to remove exactly those rows.
--
-- It converts once, and says that it did with a comment on team_roster_conversions (a comment is
-- not something a schema push creates, changes or removes). Three states:
--   (a) the table is absent: convert, record, mark. The normal upgrade. The number of rows
--       converted is raised as a NOTICE.
--   (b) the table is there and marked: nothing (this file ran before, or an operator declined).
--   (c) the table is there and not marked (a schema push made it, or this is a fresh install):
--       nothing is converted, because directory rows written after the new rules took effect
--       never gave access. When no directory row would qualify, the table is marked and the file
--       stays quiet. When some would, nothing changes and a NOTICE starting with `0028:` says how
--       many were left and that an operator must decide: drop the empty table and run this file
--       again to convert them, or set the marker (COMMENT ON TABLE team_roster_conversions IS
--       'declined') to leave them out.
-- NOTICE messages of this file start with four digits and a colon, so a caller can print exactly
-- those.
--
-- Additive and idempotent. A database without the tables (a fresh install) is left alone: push
-- creates them, the record table included.
-- Requires drizzle/0022_add_organizations.sql. Deployments apply this file after 0022 to 0025
-- and before `drizzle-kit push`.

DO $$
DECLARE
  affected integer;
BEGIN
  IF to_regclass('users') IS NULL OR to_regclass('teams') IS NULL
     OR to_regclass('members') IS NULL OR to_regclass('team_members') IS NULL
     OR to_regclass('organization_members') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('team_roster_conversions') IS NOT NULL THEN
    -- (b) marked: nothing
    IF obj_description('team_roster_conversions'::regclass, 'pg_class') IS NOT NULL THEN
      RETURN;
    END IF;
    -- (c) not marked: count what would qualify, change nothing but the marker
    SELECT count(*) INTO affected FROM (
      SELECT DISTINCT t.id, u.id
      FROM users u
      JOIN organization_members om ON om.user_id = u.id
      JOIN members m ON m.email = u.email AND m.is_active = TRUE AND m.team_id IS NOT NULL
      JOIN teams t ON t.id = m.team_id AND t.organization_id = om.organization_id
      WHERE NOT EXISTS (
        SELECT 1 FROM team_members tm
        JOIN teams other ON other.id = tm.team_id
        WHERE tm.user_id = u.id AND other.organization_id = om.organization_id
      )
    ) qualifying;
    IF affected = 0 THEN
      COMMENT ON TABLE team_roster_conversions IS '0028: applied, nothing to convert';
    ELSE
      RAISE NOTICE '0028: % directory row(s) were not converted into team memberships: team_roster_conversions exists but is not marked, so this file did not run here before. An operator must decide: drop the empty table and run this file again to convert them, or set the marker (COMMENT ON TABLE team_roster_conversions IS ''declined'') to leave them out.', affected;
    END IF;
    RETURN;
  END IF;

  -- (a) absent: convert, record, mark
  CREATE TABLE team_roster_conversions (
    team_member_id integer PRIMARY KEY NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL
  );
  ALTER TABLE team_roster_conversions
    ADD CONSTRAINT team_roster_conversions_team_member_id_team_members_id_fk
    FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE ON UPDATE NO ACTION;

  WITH converted AS (
    INSERT INTO team_members (team_id, user_id, role)
    SELECT DISTINCT t.id, u.id, 'member'
    FROM users u
    JOIN organization_members om ON om.user_id = u.id
    JOIN members m ON m.email = u.email AND m.is_active = TRUE AND m.team_id IS NOT NULL
    JOIN teams t ON t.id = m.team_id AND t.organization_id = om.organization_id
    WHERE NOT EXISTS (
      SELECT 1 FROM team_members tm
      JOIN teams other ON other.id = tm.team_id
      WHERE tm.user_id = u.id AND other.organization_id = om.organization_id
    )
    RETURNING id
  ), recorded AS (
    INSERT INTO team_roster_conversions (team_member_id) SELECT id FROM converted RETURNING 1
  )
  SELECT count(*) INTO affected FROM recorded;

  COMMENT ON TABLE team_roster_conversions IS '0028: applied';
  RAISE NOTICE '0028: converted % directory row(s) into team memberships', affected;
END $$;
