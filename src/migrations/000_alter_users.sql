-- Alter existing users table to match new schema
-- Safe: uses IF NOT EXISTS / IGNORE patterns

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS active_role ENUM('freelancer','client') DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS language_pref ENUM('en','am') DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until DATETIME NULL,
  ADD COLUMN IF NOT EXISTS is_suspended TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_banned TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT NOW();

-- Copy existing plain-text passwords into password_hash column temporarily
-- (they won't work with bcrypt compare, but won't break the server)
UPDATE users SET password_hash = password WHERE password_hash IS NULL AND password IS NOT NULL;

-- Ensure role column has admin option
ALTER TABLE users MODIFY COLUMN role ENUM('freelancer','client','admin') NOT NULL DEFAULT 'client';
