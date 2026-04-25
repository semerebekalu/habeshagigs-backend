CREATE TABLE IF NOT EXISTS certifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    skill_id INT NULL,
    price DECIMAL(10,2) DEFAULT 0.00,
    description TEXT,
    CONSTRAINT fk_cert_skill FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS user_certifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    certification_id INT NOT NULL,
    completed_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_uc_cert FOREIGN KEY (certification_id) REFERENCES certifications(id)
);
