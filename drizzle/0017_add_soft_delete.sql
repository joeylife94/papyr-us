-- Add soft delete support to wiki_pages
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_wiki_pages_deleted_at ON wiki_pages (deleted_at) WHERE deleted_at IS NOT NULL;
