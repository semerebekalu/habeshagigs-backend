-- Add team hiring option to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS looking_for_team TINYINT(1) DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS team_size INT DEFAULT 1;

-- Add auto-created group chat reference to contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS group_chat_id INT NULL;
