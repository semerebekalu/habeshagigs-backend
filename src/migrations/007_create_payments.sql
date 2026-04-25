CREATE TABLE IF NOT EXISTS transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    contract_id INT NULL,
    user_id INT NOT NULL,
    type ENUM('escrow_fund','milestone_release','full_release','withdrawal','refund','fee') NOT NULL,
    amount DECIMAL(15,2) DEFAULT 0,
    method ENUM('telebirr','cbe_birr','bank_transfer','visa','mastercard','wallet') DEFAULT 'wallet',
    status ENUM('pending','completed','failed') DEFAULT 'pending',
    gateway_ref VARCHAR(255) NULL,
    created_at DATETIME DEFAULT NOW(),
    CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id)
);
