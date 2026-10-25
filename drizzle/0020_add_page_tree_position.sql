-- Issue #103 E5: order among siblings in the page tree. Additive and nullable; pages without a
-- position sort after positioned siblings. parent_id already exists (0013_add_nested_pages.sql).
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS position INTEGER;

CREATE INDEX IF NOT EXISTS idx_wiki_pages_parent_position ON wiki_pages(parent_id, position);
