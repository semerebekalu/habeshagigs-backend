-- Contract comments/discussion thread per project
CREATE TABLE IF NOT EXISTS contract_comments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    contract_id INT NOT NULL,
    milestone_id INT NULL,
    user_id INT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_cc_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
    CONSTRAINT fk_cc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cc_contract ON contract_comments(contract_id, created_at);
