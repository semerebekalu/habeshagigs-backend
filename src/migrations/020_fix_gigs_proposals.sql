-- Fix gigs table
ALTER TABLE gigs
  ADD COLUMN IF NOT EXISTS freelancer_id INT NULL,
  ADD COLUMN IF NOT EXISTS status ENUM('active','paused','deleted') DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT NOW();

-- Fix proposals table
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS cover_letter TEXT NULL,
  ADD COLUMN IF NOT EXISTS delivery_days INT DEFAULT 1;

-- Copy proposal_text into cover_letter for existing rows
UPDATE proposals SET cover_letter = proposal_text WHERE cover_letter IS NULL AND proposal_text IS NOT NULL;

-- Fix gig_packages table if it exists with wrong structure
ALTER TABLE gig_packages
  ADD COLUMN IF NOT EXISTS deliverables JSON NULL;
