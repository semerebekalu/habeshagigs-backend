CREATE TABLE IF NOT EXISTS teams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id INT NOT NULL,
    avatar_url VARCHAR(500) NULL,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_team_owner FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS team_members (
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('owner','member') DEFAULT 'member',
    joined_at DATETIME DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id),
    CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES teams(id),
    CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id)
);
