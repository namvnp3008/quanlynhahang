-- V14: Thêm qr_token bảo mật cho bàn ăn (T-1)
USE `lsc_restaurant`;

DROP PROCEDURE IF EXISTS upgrade_table_qr_token;
DELIMITER $$
CREATE PROCEDURE upgrade_table_qr_token()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_restaurant' AND TABLE_NAME = 'restaurant_table' AND COLUMN_NAME = 'qr_token'
    ) THEN
        ALTER TABLE `restaurant_table` ADD COLUMN `qr_token` VARCHAR(32) NULL COMMENT 'Mã token bí mật dán trên bàn';
    END IF;

    -- Backfill tokens cho các hàng chưa có qr_token (sử dụng 16 bytes ngẫu nhiên -> 32 hex chars)
    UPDATE `restaurant_table` SET `qr_token` = LOWER(HEX(RANDOM_BYTES(16))) WHERE `qr_token` IS NULL;

    IF NOT EXISTS (
        SELECT * FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = 'lsc_restaurant' AND TABLE_NAME = 'restaurant_table' AND INDEX_NAME = 'uk_table_qr_token'
    ) THEN
        CREATE UNIQUE INDEX `uk_table_qr_token` ON `restaurant_table`(`qr_token`);
    END IF;
END$$
DELIMITER ;

CALL upgrade_table_qr_token();
DROP PROCEDURE IF EXISTS upgrade_table_qr_token;
