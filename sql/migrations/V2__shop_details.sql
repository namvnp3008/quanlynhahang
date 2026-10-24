-- V2__shop_details.sql
-- Migration mở rộng thông tin quán cho Q4 (F1: Địa chỉ, SĐT, giờ mở/đóng quán)

USE `lsc_system`;

DROP PROCEDURE IF EXISTS upgrade_system_shop_table;
DELIMITER $$
CREATE PROCEDURE upgrade_system_shop_table()
BEGIN
    -- 1. Thêm cột address varchar(255) nếu chưa tồn tại
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_shop' AND COLUMN_NAME = 'address'
    ) THEN
        ALTER TABLE `system_shop` ADD COLUMN `address` varchar(255) DEFAULT NULL AFTER `position`;
    END IF;

    -- 2. Thêm cột phone varchar(20) nếu chưa tồn tại
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_shop' AND COLUMN_NAME = 'phone'
    ) THEN
        ALTER TABLE `system_shop` ADD COLUMN `phone` varchar(20) DEFAULT NULL AFTER `address`;
    END IF;

    -- 3. Thêm cột open_time time nếu chưa tồn tại
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_shop' AND COLUMN_NAME = 'open_time'
    ) THEN
        ALTER TABLE `system_shop` ADD COLUMN `open_time` time DEFAULT NULL AFTER `business_hours`;
    END IF;

    -- 4. Thêm cột close_time time nếu chưa tồn tại
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_shop' AND COLUMN_NAME = 'close_time'
    ) THEN
        ALTER TABLE `system_shop` ADD COLUMN `close_time` time DEFAULT NULL AFTER `open_time`;
    END IF;
END$$
DELIMITER ;

CALL upgrade_system_shop_table();
DROP PROCEDURE IF EXISTS upgrade_system_shop_table;

-- 5. Chép dữ liệu cũ: address <- position, open_time <- business_hours (giữ nguyên cột cũ)
UPDATE `lsc_system`.`system_shop`
SET
  `address` = CASE WHEN `address` IS NULL OR `address` = '' THEN `position` ELSE `address` END,
  `open_time` = CASE WHEN `open_time` IS NULL THEN `business_hours` ELSE `open_time` END;

-- 6. Seed Shop 1: Cập nhật SĐT và giờ đóng cửa
UPDATE `lsc_system`.`system_shop`
SET
  `phone` = COALESCE(`phone`, '0912345678'),
  `open_time` = COALESCE(`open_time`, '07:00:00'),
  `close_time` = COALESCE(`close_time`, '22:00:00'),
  `address` = COALESCE(`address`, 'Số 128 Đường Xuân Thủy, Cầu Giấy, Hà Nội')
WHERE `id` = 1;
