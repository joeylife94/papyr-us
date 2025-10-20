-- 0001_add_wiki_pages_fts.sql
-- Adds FTS (tsvector) support and GIN index for wiki_pages (duplicate for migrations/ path)

-- 1) Add tsvector column
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2) Backfill existing rows
UPDATE wiki_pages
SET search_vector =
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(content, '')), 'B');

-- 3) Index
CREATE INDEX IF NOT EXISTS idx_wiki_pages_search_vector ON wiki_pages USING GIN (search_vector);

-- 4) Trigger function to auto-update on insert/update
CREATE OR REPLACE FUNCTION wiki_pages_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- 5) Trigger
DROP TRIGGER IF EXISTS trg_wiki_pages_search_vector ON wiki_pages;
CREATE TRIGGER trg_wiki_pages_search_vector
BEFORE INSERT OR UPDATE OF title, content ON wiki_pages
FOR EACH ROW EXECUTE FUNCTION wiki_pages_search_vector_update();
