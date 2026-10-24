-- v0_apply_migrations.sql
-- Tệp tổng hợp các migration schema chạy trước seed vietnam_sample_data.sql khi cài đặt CSDL mới.
-- Thứ tự thực thi trong docker-entrypoint-initdb.d:
-- 1. lsc_data_analy.sql
-- 2. lsc_order.sql
-- 3. lsc_product.sql
-- 4. lsc_restaurant.sql
-- 5. lsc_system.sql
-- 6. v0_apply_migrations.sql (tệp này)
-- 7. vietnam_sample_data.sql

USE `lsc_product`;

DROP PROCEDURE IF EXISTS upgrade_product_tables;
DELIMITER $$
CREATE PROCEDURE upgrade_product_tables()
BEGIN
    -- 1. Thêm cột select_type vào product_spec_sort nếu chưa tồn tại
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_product' AND TABLE_NAME = 'product_spec_sort' AND COLUMN_NAME = 'select_type'
    ) THEN
        ALTER TABLE `product_spec_sort` ADD COLUMN `select_type` varchar(10) NOT NULL DEFAULT 'single';
    END IF;

    -- 2. Thêm cột required vào product_spec_sort nếu chưa tồn tại
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_product' AND TABLE_NAME = 'product_spec_sort' AND COLUMN_NAME = 'required'
    ) THEN
        ALTER TABLE `product_spec_sort` ADD COLUMN `required` tinyint(1) NOT NULL DEFAULT 0;
    END IF;

    -- 3. Thêm cột sort_order vào product_sort nếu chưa tồn tại
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_product' AND TABLE_NAME = 'product_sort' AND COLUMN_NAME = 'sort_order'
    ) THEN
        ALTER TABLE `product_sort` ADD COLUMN `sort_order` int NOT NULL DEFAULT 0;
    END IF;
END$$
DELIMITER ;

CALL upgrade_product_tables();
DROP PROCEDURE IF EXISTS upgrade_product_tables;

-- ==========================================
-- V2: Mở rộng thông tin quán (Q4)
-- ==========================================
USE `lsc_system`;

DROP PROCEDURE IF EXISTS upgrade_system_shop_table;
DELIMITER $$
CREATE PROCEDURE upgrade_system_shop_table()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_shop' AND COLUMN_NAME = 'address'
    ) THEN
        ALTER TABLE `system_shop` ADD COLUMN `address` varchar(255) DEFAULT NULL AFTER `position`;
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_shop' AND COLUMN_NAME = 'phone'
    ) THEN
        ALTER TABLE `system_shop` ADD COLUMN `phone` varchar(20) DEFAULT NULL AFTER `address`;
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_shop' AND COLUMN_NAME = 'open_time'
    ) THEN
        ALTER TABLE `system_shop` ADD COLUMN `open_time` time DEFAULT NULL AFTER `business_hours`;
    END IF;

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

UPDATE `lsc_system`.`system_shop`
SET
  `address` = CASE WHEN `address` IS NULL OR `address` = '' THEN `position` ELSE `address` END,
  `open_time` = CASE WHEN `open_time` IS NULL THEN `business_hours` ELSE `open_time` END;

UPDATE `lsc_system`.`system_shop`
SET
  `phone` = COALESCE(`phone`, '0912345678'),
  `open_time` = COALESCE(`open_time`, '07:00:00'),
  `close_time` = COALESCE(`close_time`, '22:00:00'),
  `address` = COALESCE(`address`, 'Số 128 Đường Xuân Thủy, Cầu Giấy, Hà Nội')
WHERE `id` = 1;

-- ==========================================
-- V3: Mở rộng độ dài real_name (Q5)
-- ==========================================
ALTER TABLE `system_merchant` MODIFY COLUMN `real_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '店主真实姓名';

-- ==========================================
-- V4: Giá trị mặc định cho certificate (Q6)
-- ==========================================
ALTER TABLE `system_shop` MODIFY COLUMN `certificate` varchar(300) NOT NULL DEFAULT '' COMMENT '经营许可证等证书';

-- ==========================================
-- V5: Bổ sung dữ liệu tồn kho mẫu (Q8 / PO note)
-- ==========================================
USE `lsc_product`;

INSERT INTO `product_inventory` (`id`, `name`, `threshold`, `num`, `unit`, `shop_id`, `create_time`, `update_time`, `create_by`, `update_by`, `deleted`)
VALUES
  (13, 'Bò tái nạm (phần)', 1, 5, 'phần', 1, NOW(), NOW(), 1, 1, 0),
  (14, 'Gà ta thảo mộc (phần)', 2, 10, 'phần', 1, NOW(), NOW(), 1, 1, 0)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `threshold` = VALUES(`threshold`),
  `num` = VALUES(`num`),
  `unit` = VALUES(`unit`),
  `shop_id` = VALUES(`shop_id`),
  `deleted` = 0;

DELETE FROM `r_product_inventoty` WHERE `product_id` IN (1, 2);

INSERT INTO `r_product_inventoty` (`id`, `product_id`, `inventory_id`, `num`)
VALUES
  (11, 1, 13, 1),
  (12, 2, 14, 1)
ON DUPLICATE KEY UPDATE
  `product_id` = VALUES(`product_id`),
  `inventory_id` = VALUES(`inventory_id`),
  `num` = VALUES(`num`);

-- ==========================================
-- V6: Bổ sung cột deleted cho lsc_data_analy (R2)
-- ==========================================
USE `lsc_data_analy`;

DELIMITER $$
CREATE PROCEDURE upgrade_data_analy_tables()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_data_analy' AND TABLE_NAME = 'order_summary_day' AND COLUMN_NAME = 'deleted'
    ) THEN
        ALTER TABLE `order_summary_day` ADD COLUMN `deleted` tinyint(1) UNSIGNED NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_data_analy' AND TABLE_NAME = 'order_summary_time_period' AND COLUMN_NAME = 'deleted'
    ) THEN
        ALTER TABLE `order_summary_time_period` ADD COLUMN `deleted` tinyint(1) UNSIGNED NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_data_analy' AND TABLE_NAME = 'product_summary_day' AND COLUMN_NAME = 'deleted'
    ) THEN
        ALTER TABLE `product_summary_day` ADD COLUMN `deleted` tinyint(1) UNSIGNED NOT NULL DEFAULT 0;
    END IF;
END$$
DELIMITER ;

CALL upgrade_data_analy_tables();
DROP PROCEDURE IF EXISTS upgrade_data_analy_tables;

-- ==========================================
-- V7: Thêm UNIQUE KEY cho order_summary_day (date, shop_id) (B-1/B-2)
-- ==========================================
USE `lsc_data_analy`;

DELIMITER $$
CREATE PROCEDURE upgrade_data_analy_unique_key()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = 'lsc_data_analy' AND TABLE_NAME = 'order_summary_day' AND INDEX_NAME = 'uk_date_shop'
    ) THEN
        ALTER TABLE `order_summary_day` ADD UNIQUE KEY `uk_date_shop` (`date`, `shop_id`);
    END IF;
END$$
DELIMITER ;

CALL upgrade_data_analy_unique_key();
DROP PROCEDURE IF EXISTS upgrade_data_analy_unique_key;

-- ==========================================
-- V8: Cấu hình cổng thanh toán PayOS theo quán
-- ==========================================
USE `lsc_system`;

CREATE TABLE IF NOT EXISTS `lsc_system`.`shop_payment_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shop_id` BIGINT UNSIGNED NOT NULL,
  `client_id_enc` TEXT NULL COMMENT 'Mã client_id đã mã hoá AES-GCM',
  `api_key_enc` TEXT NULL COMMENT 'Mã api_key đã mã hoá AES-GCM',
  `checksum_key_enc` TEXT NULL COMMENT 'Mã checksum_key đã mã hoá AES-GCM',
  `enabled` TINYINT NOT NULL DEFAULT 0 COMMENT '0: tắt, 1: bật',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop_id` (`shop_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- V9: Bảng lưu trữ giao dịch thanh toán PayOS cho linmour-order
-- ==========================================
USE `lsc_order`;

CREATE TABLE IF NOT EXISTS `payos_transaction` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_code` BIGINT NOT NULL COMMENT 'Mã đơn hàng duy nhất PayOS sinh ra (dương, độc nhất toàn hệ thống)',
    `shop_id` BIGINT UNSIGNED NOT NULL COMMENT 'ID nhà hàng',
    `table_id` BIGINT UNSIGNED NOT NULL COMMENT 'ID bàn',
    `order_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'ID đơn hàng trong order_info (nếu đã tạo)',
    `amount` DECIMAL(12,2) NOT NULL COMMENT 'Số tiền thanh toán',
    `description` VARCHAR(255) DEFAULT NULL COMMENT 'Nội dung thanh toán gửi sang PayOS',
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'Trạng thái: PENDING, PAID, CANCELLED, EXPIRED',
    `payment_link_id` VARCHAR(100) DEFAULT NULL COMMENT 'ID link thanh toán PayOS trả về',
    `checkout_url` TEXT DEFAULT NULL COMMENT 'URL thanh toán PayOS cho khách',
    `qr_code` TEXT DEFAULT NULL COMMENT 'Mã VietQR hoặc link QR thanh toán',
    `reference` VARCHAR(100) DEFAULT NULL COMMENT 'Mã tham chiếu ngân hàng',
    `paid_at` DATETIME DEFAULT NULL COMMENT 'Thời điểm thanh toán thành công',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted` TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_code` (`order_code`),
    KEY `idx_shop_status` (`shop_id`, `status`),
    KEY `idx_shop_table` (`shop_id`, `table_id`),
    KEY `idx_shop_create_time` (`shop_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Lịch sử giao dịch thanh toán PayOS';

-- ==========================================
-- V10: Bổ sung loại thanh toán PayOS (pay_type = 5) vào từ điển hệ thống
-- ==========================================
USE `lsc_system`;

INSERT INTO `system_dict_data` (`label`, `value`, `dict_type`, `status`, `creator`, `updater`)
SELECT 'PayOS', '5', 'pay_type', 1, 1, 1
WHERE NOT EXISTS (
    SELECT 1 FROM `system_dict_data` WHERE `dict_type` = 'pay_type' AND `value` = '5'
);

-- ==========================================
-- V11: Bổ sung các trường bảo mật mật khẩu và xác thực 2 lớp (OTP) cho system_merchant
-- ==========================================
USE `lsc_system`;

DELIMITER $$
CREATE PROCEDURE upgrade_system_merchant_security()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_merchant' AND COLUMN_NAME = 'must_change_password'
    ) THEN
        ALTER TABLE `system_merchant` ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1: bắt buộc đổi mật khẩu';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_merchant' AND COLUMN_NAME = 'password_changed_at'
    ) THEN
        ALTER TABLE `system_merchant` ADD COLUMN `password_changed_at` DATETIME NULL COMMENT 'Thời điểm đổi mật khẩu lần cuối';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_merchant' AND COLUMN_NAME = 'otp_enabled'
    ) THEN
        ALTER TABLE `system_merchant` ADD COLUMN `otp_enabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0: tắt OTP, 1: bật OTP 2 lớp';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_merchant' AND COLUMN_NAME = 'otp_secret_enc'
    ) THEN
        ALTER TABLE `system_merchant` ADD COLUMN `otp_secret_enc` TEXT NULL COMMENT 'Bí mật TOTP mã hoá AES-GCM';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_merchant' AND COLUMN_NAME = 'otp_recovery_hashes'
    ) THEN
        ALTER TABLE `system_merchant` ADD COLUMN `otp_recovery_hashes` TEXT NULL COMMENT 'JSON mảng hash BCrypt 8 mã khôi phục';
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'lsc_system' AND TABLE_NAME = 'system_merchant' AND COLUMN_NAME = 'otp_enabled_at'
    ) THEN
        ALTER TABLE `system_merchant` ADD COLUMN `otp_enabled_at` DATETIME NULL COMMENT 'Thời điểm kích hoạt OTP 2 lớp';
    END IF;
END$$
DELIMITER ;

CALL upgrade_system_merchant_security();
DROP PROCEDURE IF EXISTS upgrade_system_merchant_security;

-- Seed: Tài khoản mẫu 1 (merchant) và 2 (admin) bắt buộc đổi mật khẩu yếu lần đầu
UPDATE `system_merchant` SET `must_change_password` = 1 WHERE `id` IN (1, 2);

-- ==========================================
-- V12: Bảng lưu nhật ký thao tác kiểm toán hệ thống (audit_log)
-- ==========================================
USE `lsc_system`;

CREATE TABLE IF NOT EXISTS `audit_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shop_id` BIGINT UNSIGNED NULL COMMENT 'ID quán liên quan nếu có',
    `merchant_id` BIGINT UNSIGNED NULL COMMENT 'ID tài khoản thực hiện',
    `actor_name` VARCHAR(64) NOT NULL COMMENT 'Tên người dùng thực hiện',
    `actor_type` TINYINT NOT NULL COMMENT '1: platform admin, 2: merchant',
    `action` VARCHAR(48) NOT NULL COMMENT 'Mã hành động kiểm toán',
    `target_type` VARCHAR(32) NULL COMMENT 'Loại đối tượng (PRODUCT, TABLE, SHOP, PAYOS_CONFIG...)',
    `target_id` VARCHAR(64) NULL COMMENT 'ID đối tượng bị tác động',
    `detail` JSON NULL COMMENT 'Chi tiết thay đổi dạng JSON an toàn (không chứa mật khẩu, secret)',
    `ip` VARCHAR(64) NOT NULL COMMENT 'Địa chỉ IP nguồn',
    `user_agent` VARCHAR(255) NULL COMMENT 'Trình duyệt/Client User-Agent',
    `result` VARCHAR(16) NOT NULL DEFAULT 'SUCCESS' COMMENT 'Kết quả: SUCCESS hoặc FAIL',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm ghi nhận',
    `deleted` TINYINT DEFAULT 0 COMMENT 'Xóa logic (0: bình thường, 1: đã xóa)',
    PRIMARY KEY (`id`),
    KEY `idx_shop_create_time` (`shop_id`, `create_time`),
    KEY `idx_merchant_create_time` (`merchant_id`, `create_time`),
    KEY `idx_action_create_time` (`action`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Nhật ký thao tác và bảo mật kiểm toán';

-- ==========================================
-- V13: Bổ sung trường kiểm toán và xác thực kết nối cho cấu hình PayOS
-- ==========================================
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

-- ==========================================
-- V14: Mã QR Token bảo mật cho bàn ăn (T-1)
-- ==========================================
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

    -- Backfill tokens cho các hàng chưa có qr_token
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







