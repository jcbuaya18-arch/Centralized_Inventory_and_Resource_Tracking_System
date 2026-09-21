
-- Database Schema for LGU Tibiao Centralized Inventory System

CREATE DATABASE IF NOT EXISTS lgu_tibiao_inventory;
USE lgu_tibiao_inventory;

-- Offices Table
CREATE TABLE IF NOT EXISTS offices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE
);

-- Inventory Items Table
CREATE TABLE IF NOT EXISTS inventory_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    article VARCHAR(255) NOT NULL,
    description TEXT,
    property_number VARCHAR(100) NOT NULL UNIQUE,
    unit_of_measure VARCHAR(50) DEFAULT 'unit',
    unit_value DECIMAL(15, 2) NOT NULL,
    qty_property_card INT DEFAULT 0,
    qty_physical_count INT DEFAULT 0,
    category VARCHAR(100),
    office_id INT,
    person_accountable VARCHAR(255),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (office_id) REFERENCES offices(id)
);

-- Audit History Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT,
    action VARCHAR(255),
    performed_by VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

-- Initial Data
INSERT INTO offices (name, code) VALUES ("Mayor's Office", "101"), ("Accounting", "1081");
