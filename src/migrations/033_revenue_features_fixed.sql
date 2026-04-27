-- Subscription tiers for freelancers (fixed version without DELIMITER)

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    tier ENUM('free','pro','elite') NOT NULL DEFAULT 'free',
    started_at DATETIME DEFAULT NOW(),
    expires_at DATETIME NULL,
    status ENUM('active','expired','cancelled') DEFAULT 'active',
    amount_paid DECIMAL(10,2) DEFAULT 0.00,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Promoted jobs table
CREATE TABLE IF NOT EXISTS promoted_jobs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    job_id INT NOT NULL,
    client_id INT NOT NULL,
    promoted_until DATETIME NOT NULL,
    amount_paid DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT NOW(),
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
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

-- Add referral_code column to users (safe to run multiple times)
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) NULL UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INT NULL;
