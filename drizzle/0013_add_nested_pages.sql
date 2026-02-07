-- Add parent_id and version columns to wiki_pages for nested pages and page history
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES wiki_pages(id) ON DELETE SET NULL;

-- Create index for efficient sub-page queries
CREATE INDEX IF NOT EXISTS idx_wiki_pages_parent_id ON wiki_pages(parent_id);
