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
-- Composite index on (user_id, used_at) to optimise the invalidation query
-- which filters on both columns simultaneously.
CREATE INDEX IF NOT EXISTS idx_prt_user_id_used_at ON password_reset_tokens (user_id, used_at);
