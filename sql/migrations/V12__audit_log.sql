-- V12: Bảng lưu nhật ký thao tác kiểm toán hệ thống (audit_log)
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
