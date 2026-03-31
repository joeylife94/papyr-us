-- Page Favorites / Bookmarks
CREATE TABLE IF NOT EXISTS page_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_page_favorites_user_id ON page_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_page_favorites_page_id ON page_favorites(page_id);

-- Page View Analytics
CREATE TABLE IF NOT EXISTS page_views (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_page_id ON page_views(page_id);
CREATE INDEX IF NOT EXISTS idx_page_views_user_id ON page_views(user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at ON page_views(viewed_at);

-- Activity Feed
CREATE TABLE IF NOT EXISTS activity_feed (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  target_title TEXT,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_team_id ON activity_feed(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_actor_id ON activity_feed(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at ON activity_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_action ON activity_feed(action);
