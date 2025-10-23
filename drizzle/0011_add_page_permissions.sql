-- Add page permissions and public links for granular access control

-- Page permissions table
-- Supports user-level, team-level, and public access control
CREATE TABLE IF NOT EXISTS page_permissions (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'team', 'public')),
  entity_id INTEGER, -- user_id from users table or team_id from teams table (NULL for public)
  permission TEXT NOT NULL CHECK (permission IN ('owner', 'editor', 'viewer', 'commenter')),
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Who granted this permission
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Public/shared links table
-- Allows password-protected and expiring links for external sharing
CREATE TABLE IF NOT EXISTS public_links (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE, -- Random token for URL (e.g., /share/abc123xyz)
  password TEXT, -- Optional bcrypt hash for password protection
  permission TEXT NOT NULL DEFAULT 'viewer' CHECK (permission IN ('viewer', 'commenter', 'editor')),
  expires_at TIMESTAMP, -- Optional expiration date
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMP, -- Track when link was last used
  access_count INTEGER NOT NULL DEFAULT 0 -- How many times the link was accessed
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_page_permissions_page ON page_permissions(page_id);
CREATE INDEX IF NOT EXISTS idx_page_permissions_entity ON page_permissions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_public_links_token ON public_links(token);
CREATE INDEX IF NOT EXISTS idx_public_links_page ON public_links(page_id);
CREATE INDEX IF NOT EXISTS idx_public_links_expires ON public_links(expires_at) WHERE expires_at IS NOT NULL;

-- Comments
COMMENT ON TABLE page_permissions IS 'Granular access control for wiki pages at user, team, and public levels';
COMMENT ON TABLE public_links IS 'Shareable links with optional password protection and expiration';
COMMENT ON COLUMN page_permissions.permission IS 'owner: full control, editor: edit content, viewer: read-only, commenter: view + comment';
COMMENT ON COLUMN public_links.token IS 'Random token used in public share URLs (e.g., /share/TOKEN)';
COMMENT ON COLUMN public_links.password IS 'Optional bcrypt hash for password-protected links';
