CREATE TABLE IF NOT EXISTS conversations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    contract_id INT NULL,
    participant_a INT NOT NULL,
    participant_b INT NOT NULL,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_conv_a FOREIGN KEY (participant_a) REFERENCES users(id),
    CONSTRAINT fk_conv_b FOREIGN KEY (participant_b) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,
    content TEXT,
    content_type ENUM('text','image','document','voice') DEFAULT 'text',
    file_url VARCHAR(500) NULL,
    is_read TINYINT(1) DEFAULT 0,
    is_reported TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id)
);
