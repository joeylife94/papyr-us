-- A team cannot be deleted while pages (trashed ones included) still belong to it.
-- Previously ON DELETE SET NULL turned the team's pages into team-less pages, which follow
-- different access rules. DBStorage.deleteTeam refuses first; this constraint backs it up.
ALTER TABLE wiki_pages DROP CONSTRAINT IF EXISTS wiki_pages_team_id_fkey;
ALTER TABLE wiki_pages DROP CONSTRAINT IF EXISTS wiki_pages_team_id_teams_id_fk;
ALTER TABLE wiki_pages
  ADD CONSTRAINT wiki_pages_team_id_teams_id_fk
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT;
