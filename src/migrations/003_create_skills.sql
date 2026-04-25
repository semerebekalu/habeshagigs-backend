CREATE TABLE IF NOT EXISTS skills (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    name_am VARCHAR(100),
    category VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS freelancer_skills (
    freelancer_id INT NOT NULL,
    skill_id INT NOT NULL,
    proficiency ENUM('beginner','intermediate','expert') DEFAULT 'beginner',
    PRIMARY KEY (freelancer_id, skill_id),
    CONSTRAINT fk_fs_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_fs_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
