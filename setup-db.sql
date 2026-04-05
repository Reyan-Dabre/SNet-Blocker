-- ============================================================
-- SNet Blocker — Database Setup
-- Run this in MySQL Workbench or CLI:
--   mysql -u root -p < setup-db.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS snet_db;
USE snet_db;

-- User table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Manual block / trust rules
CREATE TABLE IF NOT EXISTS rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    type ENUM('manual', 'trusted') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_rule (user_id, domain),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- New split tables (manual + trusted are now stored separately)
CREATE TABLE IF NOT EXISTS manual_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_manual_rule (user_id, domain),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trusted_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_trusted_rule (user_id, domain),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Auto-detected block rules (from content filter / URL analysis)
CREATE TABLE IF NOT EXISTS auto_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_auto_rule (user_id, domain),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Threat log (new — tracks all block events for stats)
CREATE TABLE IF NOT EXISTS threat_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    reason VARCHAR(255),
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert default credentials (safe to re-run due to IGNORE)
INSERT IGNORE INTO users (email, password) VALUES ('lonerkind@gmail.com', 'Sadaf@1234');

-- Verify
SELECT '✅ SNet database setup complete!' AS status;
SELECT * FROM users;
