-- Fix jobs table to match new schema
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS budget_min DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_max DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_type ENUM('fixed','hourly') DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS deadline DATE NULL,
  ADD COLUMN IF NOT EXISTS escrow_amount DECIMAL(15,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS payment_status ENUM('unfunded','funded','released','refunded') DEFAULT 'unfunded',
  ADD COLUMN IF NOT EXISTS no_proposal_notified TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT NOW();

-- Copy existing budget values into new columns
UPDATE jobs SET budget_min = COALESCE(budget, 0), budget_max = COALESCE(budget, 0) WHERE budget_min = 0;

-- Fix status column to include all needed values
ALTER TABLE jobs MODIFY COLUMN status ENUM('open','in_progress','completed','cancelled') DEFAULT 'open';
