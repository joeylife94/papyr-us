-- Issue #103 E6: page-to-page links, maintained by the save pipeline from the [[page:<id>]]
-- tokens in a page's blocks. Additive; deleting a page (hard delete) removes its rows.
CREATE TABLE IF NOT EXISTS page_links (
  source_page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  target_page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (source_page_id, target_page_id)
);

CREATE INDEX IF NOT EXISTS idx_page_links_target ON page_links(target_page_id);
