CREATE TABLE IF NOT EXISTS kyc_submissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    id_document_url VARCHAR(500),
    selfie_url VARCHAR(500),
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    rejection_reason TEXT NULL,
    reviewed_by INT NULL,
    submitted_at DATETIME DEFAULT NOW(),
    reviewed_at DATETIME NULL,
    CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skill_badges (
    id INT PRIMARY KEY AUTO_INCREMENT,
    skill_id INT NOT NULL,
    user_id INT NOT NULL,
    awarded_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_sb_skill FOREIGN KEY (skill_id) REFERENCES skills(id),
    CONSTRAINT fk_sb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS disputes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    contract_id INT NOT NULL,
    raised_by INT NOT NULL,
    reason TEXT,
    status ENUM('open','under_review','resolved') DEFAULT 'open',
    resolution TEXT NULL,
    resolved_by INT NULL,
    created_at DATETIME DEFAULT NOW(),
    resolved_at DATETIME NULL,
    CONSTRAINT fk_disp_contract FOREIGN KEY (contract_id) REFERENCES contracts(id),
    CONSTRAINT fk_disp_raised FOREIGN KEY (raised_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    contract_id INT NOT NULL,
    reviewer_id INT NOT NULL,
    reviewee_id INT NOT NULL,
    rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_rev_contract FOREIGN KEY (contract_id) REFERENCES contracts(id),
    CONSTRAINT fk_rev_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id),
    CONSTRAINT fk_rev_reviewee FOREIGN KEY (reviewee_id) REFERENCES users(id)
);
