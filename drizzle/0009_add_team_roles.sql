-- Add team_members table for role-based access control
CREATE TABLE IF NOT EXISTS "team_members" (
  "id" SERIAL PRIMARY KEY,
  "team_id" INTEGER NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  "invited_by" INTEGER REFERENCES "users"("id"),
  "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS "idx_team_members_team_id" ON "team_members"("team_id");
CREATE INDEX IF NOT EXISTS "idx_team_members_user_id" ON "team_members"("user_id");
CREATE INDEX IF NOT EXISTS "idx_team_members_role" ON "team_members"("role");
