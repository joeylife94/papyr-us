-- 0009_add_password_reset_tokens.sql
-- Adds password_reset_tokens table for the forgot-password / reset-password flow

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT    NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The UNIQUE constraint above already creates an implicit index on token.
-- Single-column index on user_id for simple user lookups.
CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens (user_id);
-- Partial composite index for the invalidation query (user_id = ? AND used_at IS NULL).
-- Including only unused rows keeps the index small and fast.
CREATE INDEX IF NOT EXISTS idx_prt_user_id_unused ON password_reset_tokens (user_id) WHERE used_at IS NULL;
-- Index on expires_at for two purposes:
--   1. Efficient batch cleanup of expired rows (DELETE WHERE expires_at < now()).
--   2. Supports the expiry filter in findValidPasswordResetToken.
CREATE INDEX IF NOT EXISTS idx_prt_expires_at ON password_reset_tokens (expires_at);
