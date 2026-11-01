-- Page icon (issue #103 E4): one emoji per page, shown in the header, sidebar, document table
-- and breadcrumbs. Additive and idempotent: existing rows keep NULL (no icon) and no data moves.
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS icon TEXT;
