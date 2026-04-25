-- Add suspension reason, duration, and auto-unsuspend columns to users
DROP PROCEDURE IF EXISTS add_suspension_cols;
DELIMITER $$
CREATE PROCEDURE add_suspension_cols()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'suspension_reason') THEN
        ALTER TABLE users ADD COLUMN suspension_reason TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'suspended_until') THEN
        ALTER TABLE users ADD COLUMN suspended_until DATETIME NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'suspended_at') THEN
        ALTER TABLE users ADD COLUMN suspended_at DATETIME NULL;
    END IF;
END$$
DELIMITER ;
CALL add_suspension_cols();
DROP PROCEDURE IF EXISTS add_suspension_cols;
