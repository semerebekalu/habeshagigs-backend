-- Add evidence files column to disputes table
DROP PROCEDURE IF EXISTS add_dispute_evidence;
DELIMITER $$
CREATE PROCEDURE add_dispute_evidence()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'disputes' AND COLUMN_NAME = 'evidence_files') THEN
        ALTER TABLE disputes ADD COLUMN evidence_files JSON NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'disputes' AND COLUMN_NAME = 'evidence_note') THEN
        ALTER TABLE disputes ADD COLUMN evidence_note TEXT NULL;
    END IF;
END$$
DELIMITER ;
CALL add_dispute_evidence();
DROP PROCEDURE IF EXISTS add_dispute_evidence;
