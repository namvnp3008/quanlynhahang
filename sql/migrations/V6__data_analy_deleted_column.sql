USE `lsc_data_analy`;

-- R2: Bổ sung cột deleted cho các bảng order_summary_day, order_summary_time_period, product_summary_day
-- để tương thích với MyBatis-Plus và chuẩn schema chung toàn hệ thống.

SET @col_exist := (SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'lsc_data_analy' AND TABLE_NAME = 'order_summary_day' AND COLUMN_NAME = 'deleted');
SET @sql := IF(@col_exist = 0, 'ALTER TABLE order_summary_day ADD COLUMN deleted tinyint(1) UNSIGNED NOT NULL DEFAULT 0;', 'SELECT 1;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exist := (SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'lsc_data_analy' AND TABLE_NAME = 'order_summary_time_period' AND COLUMN_NAME = 'deleted');
SET @sql := IF(@col_exist = 0, 'ALTER TABLE order_summary_time_period ADD COLUMN deleted tinyint(1) UNSIGNED NOT NULL DEFAULT 0;', 'SELECT 1;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exist := (SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'lsc_data_analy' AND TABLE_NAME = 'product_summary_day' AND COLUMN_NAME = 'deleted');
SET @sql := IF(@col_exist = 0, 'ALTER TABLE product_summary_day ADD COLUMN deleted tinyint(1) UNSIGNED NOT NULL DEFAULT 0;', 'SELECT 1;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
