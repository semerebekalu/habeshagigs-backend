CREATE TABLE IF NOT EXISTS deliveries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    milestone_id INT NOT NULL,
    contract_id INT NOT NULL,
    freelancer_id INT NOT NULL,
    message TEXT,
    files JSON,
    feedback TEXT NULL,
    status ENUM('pending','approved','revision_requested') DEFAULT 'pending',
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_del_milestone FOREIGN KEY (milestone_id) REFERENCES milestones(id),
    CONSTRAINT fk_del_contract FOREIGN KEY (contract_id) REFERENCES contracts(id),
    CONSTRAINT fk_del_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id)
);
