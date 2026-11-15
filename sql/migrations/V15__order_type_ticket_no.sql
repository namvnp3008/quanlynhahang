-- V15: Loại đơn (0 tại bàn, 1 mang về) và số phiếu mang về trong ngày (AO-2)
USE lsc_order;

SET @col_exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'lsc_order' AND TABLE_NAME = 'order_info' AND COLUMN_NAME = 'order_type');
SET @sql := IF(@col_exist = 0, 'ALTER TABLE order_info ADD COLUMN order_type TINYINT NOT NULL DEFAULT 0 COMMENT ''0 tại bàn, 1 mang về'';', 'SELECT 1;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'lsc_order' AND TABLE_NAME = 'order_info' AND COLUMN_NAME = 'ticket_no');
SET @sql := IF(@col_exist = 0, 'ALTER TABLE order_info ADD COLUMN ticket_no INT NULL COMMENT ''Số phiếu mang về trong ngày'';', 'SELECT 1;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
