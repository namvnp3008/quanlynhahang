-- V13: Bổ sung trường kiểm toán và xác thực kết nối cho cấu hình PayOS
USE `lsc_system`;

DELIMITER $$
CREATE PROCEDURE upgrade_shop_payment_config_audit()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'shop_payment_config' AND COLUMN_NAME = 'updated_by'
    ) THEN
        ALTER TABLE `shop_payment_config` ADD COLUMN `updated_by` BIGINT UNSIGNED NULL COMMENT 'ID người cập nhật cấu hình';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'shop_payment_config' AND COLUMN_NAME = 'updated_by_name'
    ) THEN
        ALTER TABLE `shop_payment_config` ADD COLUMN `updated_by_name` VARCHAR(64) NULL COMMENT 'Tên người cập nhật cấu hình';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'shop_payment_config' AND COLUMN_NAME = 'updated_ip'
    ) THEN
        ALTER TABLE `shop_payment_config` ADD COLUMN `updated_ip` VARCHAR(64) NULL COMMENT 'IP thực hiện cập nhật';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'shop_payment_config' AND COLUMN_NAME = 'validated_at'
    ) THEN
        ALTER TABLE `shop_payment_config` ADD COLUMN `validated_at` DATETIME NULL COMMENT 'Thời điểm kiểm tra kết nối PayOS gần nhất';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'shop_payment_config' AND COLUMN_NAME = 'validation_result'
    ) THEN
        ALTER TABLE `shop_payment_config` ADD COLUMN `validation_result` VARCHAR(32) NULL COMMENT 'Kết quả kiểm tra: SUCCESS, FAILED, MOCK';
    END IF;
END$$
DELIMITER ;

CALL upgrade_shop_payment_config_audit();
DROP PROCEDURE IF EXISTS upgrade_shop_payment_config_audit;
