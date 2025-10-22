-- Database performance optimization indexes
-- Add indexes for common query patterns

-- Tasks table indexes
CREATE INDEX IF NOT EXISTS "idx_tasks_team_id" ON "tasks"("team_id");
CREATE INDEX IF NOT EXISTS "idx_tasks_assigned_to" ON "tasks"("assigned_to");
CREATE INDEX IF NOT EXISTS "idx_tasks_status" ON "tasks"("status");
CREATE INDEX IF NOT EXISTS "idx_tasks_priority" ON "tasks"("priority");
CREATE INDEX IF NOT EXISTS "idx_tasks_created_at" ON "tasks"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_tasks_due_date" ON "tasks"("due_date");

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_tasks_team_status" ON "tasks"("team_id", "status");
CREATE INDEX IF NOT EXISTS "idx_tasks_team_assignee" ON "tasks"("team_id", "assigned_to");
CREATE INDEX IF NOT EXISTS "idx_tasks_status_priority" ON "tasks"("status", "priority");

-- Wiki pages indexes
CREATE INDEX IF NOT EXISTS "idx_wiki_pages_team_id" ON "wiki_pages"("team_id");
CREATE INDEX IF NOT EXISTS "idx_wiki_pages_author" ON "wiki_pages"("author");
CREATE INDEX IF NOT EXISTS "idx_wiki_pages_created_at" ON "wiki_pages"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_wiki_pages_updated_at" ON "wiki_pages"("updated_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_wiki_pages_folder" ON "wiki_pages"("folder");

-- Composite index for team + updated_at (common in feed queries)
CREATE INDEX IF NOT EXISTS "idx_wiki_pages_team_updated" ON "wiki_pages"("team_id", "updated_at" DESC);

-- Comments indexes
CREATE INDEX IF NOT EXISTS "idx_comments_page_id" ON "comments"("page_id");
CREATE INDEX IF NOT EXISTS "idx_comments_author" ON "comments"("author");
CREATE INDEX IF NOT EXISTS "idx_comments_created_at" ON "comments"("created_at" DESC);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS "idx_notifications_recipient_id" ON "notifications"("recipient_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_read" ON "notifications"("read");
CREATE INDEX IF NOT EXISTS "idx_notifications_created_at" ON "notifications"("created_at" DESC);

-- Composite index for unread notifications query
CREATE INDEX IF NOT EXISTS "idx_notifications_recipient_read" ON "notifications"("recipient_id", "read", "created_at" DESC);

-- Workflows indexes
CREATE INDEX IF NOT EXISTS "idx_workflows_team_id" ON "workflows"("team_id");
CREATE INDEX IF NOT EXISTS "idx_workflows_active" ON "workflows"("active");
CREATE INDEX IF NOT EXISTS "idx_workflows_created_at" ON "workflows"("created_at" DESC);

-- Workflow runs indexes
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_workflow_id" ON "workflow_runs"("workflow_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_status" ON "workflow_runs"("status");
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_started_at" ON "workflow_runs"("started_at" DESC);

-- Graph edges indexes for knowledge graph
CREATE INDEX IF NOT EXISTS "idx_graph_edges_source" ON "graph_edges"("source_id");
CREATE INDEX IF NOT EXISTS "idx_graph_edges_target" ON "graph_edges"("target_id");
CREATE INDEX IF NOT EXISTS "idx_graph_edges_type" ON "graph_edges"("edge_type");

-- Composite index for bidirectional graph queries
CREATE INDEX IF NOT EXISTS "idx_graph_edges_source_type" ON "graph_edges"("source_id", "edge_type");
CREATE INDEX IF NOT EXISTS "idx_graph_edges_target_type" ON "graph_edges"("target_id", "edge_type");

-- Analyze tables to update statistics for query planner
ANALYZE "tasks";
ANALYZE "wiki_pages";
ANALYZE "comments";
ANALYZE "notifications";
ANALYZE "workflows";
ANALYZE "workflow_runs";
ANALYZE "graph_edges";
