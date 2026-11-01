-- Page tree order (issue #103 E5): a page's place among its siblings. Additive and idempotent:
-- existing rows keep NULL, which sorts after positioned siblings by creation time, so the current
-- order is kept until someone reorders. The index serves sibling lookups by parent.
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS position INTEGER;
CREATE INDEX IF NOT EXISTS idx_wiki_pages_parent_position ON wiki_pages (parent_id, position);
