CREATE TABLE IF NOT EXISTS contract_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    default_milestones JSON,
    default_deliverables JSON,
    estimated_days INT DEFAULT 7,
    price_range_min DECIMAL(10,2) DEFAULT 0,
    price_range_max DECIMAL(10,2) DEFAULT 0,
    icon VARCHAR(10) DEFAULT '📄'
);
