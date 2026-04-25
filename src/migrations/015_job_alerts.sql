CREATE TABLE IF NOT EXISTS job_alerts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    freelancer_id INT NOT NULL,
    skill_id INT NULL,
    category VARCHAR(100) NULL,
    min_budget DECIMAL(10,2) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_ja_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id)
);
