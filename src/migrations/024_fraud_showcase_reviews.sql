-- Fraud flags table
CREATE TABLE IF NOT EXISTS fraud_flags (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    flag_type VARCHAR(100) NOT NULL,
    severity ENUM('low','medium','high','critical') DEFAULT 'low',
    description TEXT,
    is_resolved TINYINT(1) DEFAULT 0,
    resolved_by INT NULL,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_ff_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Add fraud_score to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS fraud_score INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_fraud_check DATETIME NULL;

-- Two-way reviews: add reviewer_role to distinguish client vs freelancer review
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_role ENUM('client','freelancer') DEFAULT 'client';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_public TINYINT(1) DEFAULT 1;

-- Project showcase
CREATE TABLE IF NOT EXISTS showcase_projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    freelancer_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    cover_image_url VARCHAR(500) NULL,
    project_url VARCHAR(500) NULL,
    tags VARCHAR(500),
    views INT DEFAULT 0,
    likes INT DEFAULT 0,
    is_public TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_sp_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS showcase_likes (
    user_id INT NOT NULL,
    project_id INT NOT NULL,
    created_at DATETIME DEFAULT NOW(),
    PRIMARY KEY (user_id, project_id)
);
