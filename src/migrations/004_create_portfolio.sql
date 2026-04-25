CREATE TABLE IF NOT EXISTS portfolio_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    freelancer_id INT NOT NULL,
    title VARCHAR(255),
    description TEXT,
    item_type ENUM('image','document','link') DEFAULT 'image',
    url VARCHAR(500),
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_pi_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS availability_calendar (
    id INT PRIMARY KEY AUTO_INCREMENT,
    freelancer_id INT NOT NULL,
    date DATE NOT NULL,
    is_available TINYINT(1) DEFAULT 1,
    CONSTRAINT fk_ac_freelancer FOREIGN KEY (freelancer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_favorites (
    user_id INT NOT NULL,
    target_id INT NOT NULL,
    created_at DATETIME DEFAULT NOW(),
    PRIMARY KEY (user_id, target_id),
    CONSTRAINT fk_uf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_uf_target FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
);
