CREATE TABLE IF NOT EXISTS jobs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    client_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    budget_min DECIMAL(10,2) DEFAULT 0,
    budget_max DECIMAL(10,2) DEFAULT 0,
    project_type ENUM('fixed','hourly') DEFAULT 'fixed',
    deadline DATE NULL,
    status ENUM('open','in_progress','completed','cancelled') DEFAULT 'open',
    escrow_amount DECIMAL(15,2) DEFAULT 0.00,
    payment_status ENUM('unfunded','funded','released','refunded') DEFAULT 'unfunded',
    no_proposal_notified TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_jobs_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_skills (
    job_id INT NOT NULL,
    skill_id INT NOT NULL,
    PRIMARY KEY (job_id, skill_id),
    CONSTRAINT fk_js_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_js_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gigs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    freelancer_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('active','paused','deleted') DEFAULT 'active',
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_gigs_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gig_packages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    gig_id INT NOT NULL,
    package_type ENUM('basic','standard','premium') NOT NULL,
    title VARCHAR(255),
    description TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    delivery_days INT DEFAULT 1,
    deliverables JSON,
    CONSTRAINT fk_gp_gig FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE
);
