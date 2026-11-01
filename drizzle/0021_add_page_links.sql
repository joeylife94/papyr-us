-- Page links (issue #103 E6): which pages link to which, from the id-only `[[page:<id>]]` tokens
-- in page content. Additive and idempotent: a new table, no change to existing rows. It starts
-- empty (no page had link tokens before E6) and is maintained on every content write; rows go
-- when either page is permanently deleted.
CREATE TABLE IF NOT EXISTS page_links (
  source_page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  target_page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  PRIMARY KEY (source_page_id, target_page_id)
);
CREATE INDEX IF NOT EXISTS idx_page_links_target ON page_links (target_page_id);
