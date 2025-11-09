-- Migration: Remove temporary password_is_hashed column
-- Run this AFTER migrate-directory-passwords.mjs has been executed

-- Drop the temporary tracking column
ALTER TABLE directories DROP COLUMN IF EXISTS password_is_hashed;

-- Update comment to reflect that all passwords are now hashed
COMMENT ON COLUMN directories.password IS 'Hashed password using bcrypt (all passwords are now hashed)';
