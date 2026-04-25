CREATE TABLE IF NOT EXISTS proposals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    job_id INT NOT NULL,
    freelancer_id INT NOT NULL,
    cover_letter TEXT,
    bid_amount DECIMAL(10,2) DEFAULT 0,
    delivery_days INT DEFAULT 1,
    status ENUM('pending','shortlisted','accepted','rejected') DEFAULT 'pending',
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_prop_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_prop_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contracts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    job_id INT NULL,
    gig_id INT NULL,
    client_id INT NOT NULL,
    freelancer_id INT NOT NULL,
    total_amount DECIMAL(15,2) DEFAULT 0,
    platform_fee DECIMAL(15,2) DEFAULT 0,
    escrow_balance DECIMAL(15,2) DEFAULT 0,
    escrow_status ENUM('unfunded','funded','frozen','released','refunded') DEFAULT 'unfunded',
    status ENUM('active','completed','cancelled','disputed') DEFAULT 'active',
    created_at DATETIME DEFAULT NOW(),
    completed_at DATETIME NULL,
    CONSTRAINT fk_con_client FOREIGN KEY (client_id) REFERENCES users(id),
    CONSTRAINT fk_con_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS milestones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    contract_id INT NOT NULL,
    title VARCHAR(255),
    amount DECIMAL(15,2) DEFAULT 0,
    due_date DATE NULL,
    status ENUM('pending','submitted','approved','released') DEFAULT 'pending',
    released_at DATETIME NULL,
    CONSTRAINT fk_ms_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
);
