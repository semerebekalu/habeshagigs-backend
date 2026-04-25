CREATE TABLE IF NOT EXISTS freelancer_profiles (
    id INT PRIMARY KEY,
    title VARCHAR(255),
    bio TEXT,
    bio_am TEXT,
    hourly_rate DECIMAL(10,2),
    availability_status ENUM('available','busy','unavailable') DEFAULT 'available',
    avg_rating DECIMAL(3,2) DEFAULT 0.00,
    total_completed INT DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0.00,
    response_rate DECIMAL(5,2) DEFAULT 0.00,
    avg_response_time_hrs DECIMAL(5,2) DEFAULT 0.00,
    reputation_level ENUM('bronze','silver','gold','platinum','diamond') DEFAULT 'bronze',
    reputation_score DECIMAL(10,2) DEFAULT 0.00,
    profile_photo_url VARCHAR(500) NULL,
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    CONSTRAINT fk_fp_user FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
);
