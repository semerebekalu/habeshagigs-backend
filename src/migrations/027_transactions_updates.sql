-- Add topup to transaction types, add notes and reviewed_by columns
ALTER TABLE transactions
  MODIFY COLUMN type ENUM('escrow_fund','milestone_release','full_release','withdrawal','refund','fee','topup') NOT NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by INT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at DATETIME NULL;
