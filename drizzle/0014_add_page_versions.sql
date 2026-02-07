-- Create page_versions table for page history/version management
CREATE TABLE IF NOT EXISTS page_versions (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  blocks JSONB DEFAULT '[]',
  author TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  change_description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_page_versions_page_id ON page_versions(page_id);
CREATE INDEX IF NOT EXISTS idx_page_versions_version ON page_versions(page_id, version_number DESC);
