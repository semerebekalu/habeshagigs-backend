CREATE TABLE IF NOT EXISTS skill_endorsements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    freelancer_id INT NOT NULL,
    endorser_id INT NOT NULL,
    skill_id INT NOT NULL,
    contract_id INT NULL,
    created_at DATETIME DEFAULT NOW(),
    UNIQUE KEY unique_endorsement (freelancer_id, endorser_id, skill_id),
    CONSTRAINT fk_se_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id),
    CONSTRAINT fk_se_endorser FOREIGN KEY (endorser_id) REFERENCES users(id),
    CONSTRAINT fk_se_skill FOREIGN KEY (skill_id) REFERENCES skills(id)
);
