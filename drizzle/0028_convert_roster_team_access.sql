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
--
-- Every row it creates is recorded in team_roster_conversions (by team_members.id), which
-- drizzle/0028_convert_roster_team_access.down.sql reads to remove exactly those rows.
--
-- Additive and idempotent. It converts once: when team_roster_conversions already exists (this
-- file ran before, or a schema push created the table) nothing is changed, so a directory row
-- written after the first run never turns into access. A database without the tables (a fresh
-- install) is left alone: push creates them, the record table included.
-- Requires drizzle/0022_add_organizations.sql. Deployments apply this file after 0022 to 0025
-- and before `drizzle-kit push`.

DO $$
BEGIN
  IF to_regclass('users') IS NULL OR to_regclass('teams') IS NULL
     OR to_regclass('members') IS NULL OR to_regclass('team_members') IS NULL
     OR to_regclass('organization_members') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('team_roster_conversions') IS NOT NULL THEN
    RETURN;
  END IF;

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
  )
  INSERT INTO team_roster_conversions (team_member_id) SELECT id FROM converted;
END $$;
