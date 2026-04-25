CREATE TABLE IF NOT EXISTS notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    event_type VARCHAR(100),
    title VARCHAR(255),
    title_am VARCHAR(255),
    message TEXT,
    message_am TEXT,
    is_read TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id INT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    in_app_enabled TINYINT(1) DEFAULT 1,
    email_enabled TINYINT(1) DEFAULT 1,
    PRIMARY KEY (user_id, event_type),
    CONSTRAINT fk_np_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
