CREATE TABLE IF NOT EXISTS group_chats (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    contract_id INT NULL,
    created_by INT NOT NULL,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_gc_creator FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_chat_members (
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at DATETIME DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id),
    CONSTRAINT fk_gcm_group FOREIGN KEY (group_id) REFERENCES group_chats(id) ON DELETE CASCADE,
    CONSTRAINT fk_gcm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_id INT NOT NULL,
    sender_id INT NOT NULL,
    content TEXT NOT NULL,
    content_type ENUM('text','image','document') DEFAULT 'text',
    file_url VARCHAR(500) NULL,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_gm_group FOREIGN KEY (group_id) REFERENCES group_chats(id) ON DELETE CASCADE,
    CONSTRAINT fk_gm_sender FOREIGN KEY (sender_id) REFERENCES users(id)
);
