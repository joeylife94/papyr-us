-- Issue #103 E4: an optional emoji icon per page. Additive and nullable; existing pages keep no icon.
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS icon TEXT;
