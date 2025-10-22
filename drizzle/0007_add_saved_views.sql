-- Migration: Add saved_views table for customizable data views
-- Supports table, kanban, calendar, and list views with filters, sorts, and grouping

CREATE TABLE IF NOT EXISTS saved_views (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  view_type TEXT NOT NULL CHECK (view_type IN ('table', 'kanban', 'calendar', 'list')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('tasks', 'pages', 'events')),
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_saved_views_team_id ON saved_views(team_id);
CREATE INDEX IF NOT EXISTS idx_saved_views_created_by ON saved_views(created_by);
CREATE INDEX IF NOT EXISTS idx_saved_views_entity_type ON saved_views(entity_type);
CREATE INDEX IF NOT EXISTS idx_saved_views_is_public ON saved_views(is_public);

-- Comment on table
COMMENT ON TABLE saved_views IS 'Stores user-defined views for tasks, pages, and events with customizable filters, sorts, and display options';
COMMENT ON COLUMN saved_views.config IS 'JSON configuration for filters, sorts, columns, grouping, and display options';
COMMENT ON COLUMN saved_views.is_default IS 'Whether this view is the default for the user/team';
COMMENT ON COLUMN saved_views.is_public IS 'Whether this view is shared with the entire team';
