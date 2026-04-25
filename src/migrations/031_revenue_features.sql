-- Subscription tiers for freelancers
DROP PROCEDURE IF EXISTS add_revenue_tables;
DELIMITER $$
CREATE PROCEDURE add_revenue_tables()
BEGIN
    -- Subscriptions table
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions') THEN
        CREATE TABLE subscriptions (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            tier ENUM('free','pro','elite') NOT NULL DEFAULT 'free',
            started_at DATETIME DEFAULT NOW(),
            expires_at DATETIME NULL,
            status ENUM('active','expired','cancelled') DEFAULT 'active',
            amount_paid DECIMAL(10,2) DEFAULT 0.00,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    END IF;

    -- Promoted jobs table
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promoted_jobs') THEN
        CREATE TABLE promoted_jobs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            job_id INT NOT NULL,
            client_id INT NOT NULL,
            promoted_until DATETIME NOT NULL,
            amount_paid DECIMAL(10,2) NOT NULL,
            created_at DATETIME DEFAULT NOW(),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
        );
    END IF;

    -- Referrals table
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referrals') THEN
        CREATE TABLE referrals (
            id INT PRIMARY KEY AUTO_INCREMENT,
            referrer_id INT NOT NULL,
            referred_id INT NOT NULL,
            referral_code VARCHAR(20) NOT NULL,
            reward_amount DECIMAL(10,2) DEFAULT 50.00,
            rewarded TINYINT(1) DEFAULT 0,
            rewarded_at DATETIME NULL,
            created_at DATETIME DEFAULT NOW(),
            UNIQUE KEY unique_referred (referred_id),
            FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
        );
    END IF;

    -- Add referral_code column to users
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'referral_code') THEN
        ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) NULL UNIQUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'referred_by') THEN
        ALTER TABLE users ADD COLUMN referred_by INT NULL;
    END IF;
END$$
DELIMITER ;
CALL add_revenue_tables();
DROP PROCEDURE IF EXISTS add_revenue_tables;
