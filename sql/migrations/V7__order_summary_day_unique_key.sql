USE `lsc_data_analy`;

-- B-1 / B-2: Thêm UNIQUE KEY cho order_summary_day (date, shop_id) để hỗ trợ ON DUPLICATE KEY UPDATE và tránh trùng lặp
SET @idx_exist := (SELECT COUNT(*) FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = 'lsc_data_analy' AND TABLE_NAME = 'order_summary_day' AND INDEX_NAME = 'uk_date_shop');
SET @sql := IF(@idx_exist = 0, 'ALTER TABLE order_summary_day ADD UNIQUE KEY uk_date_shop (date, shop_id);', 'SELECT 1;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
