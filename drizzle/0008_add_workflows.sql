-- Create workflows table
CREATE TABLE IF NOT EXISTS "workflows" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "team_id" INTEGER REFERENCES "teams"("id") ON DELETE CASCADE,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "trigger" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "conditions" JSONB DEFAULT '[]'::jsonb,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create workflow_runs table
CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" SERIAL PRIMARY KEY,
  "workflow_id" INTEGER NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL,
  "trigger_data" JSONB NOT NULL,
  "results" JSONB DEFAULT '[]'::jsonb,
  "error" TEXT,
  "started_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_workflows_team" ON "workflows"("team_id");
CREATE INDEX IF NOT EXISTS "idx_workflows_active" ON "workflows"("is_active");
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_workflow" ON "workflow_runs"("workflow_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_status" ON "workflow_runs"("status");
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_started" ON "workflow_runs"("started_at");
