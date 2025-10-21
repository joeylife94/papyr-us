-- Migration: Hash existing plaintext directory passwords
-- This migration adds a flag to track which passwords have been hashed
-- and prepares for the data migration script

-- Add a column to track if password is hashed (temporary, for migration tracking)
ALTER TABLE directories ADD COLUMN IF NOT EXISTS password_is_hashed BOOLEAN DEFAULT false;

-- Update the column comment
COMMENT ON COLUMN directories.password IS 'Hashed password using bcrypt (or plaintext for legacy rows during migration)';
COMMENT ON COLUMN directories.password_is_hashed IS 'Temporary flag indicating if password has been migrated to bcrypt hash';
