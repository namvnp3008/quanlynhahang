-- V9: Bảng lưu trữ giao dịch thanh toán PayOS cho linmour-order
USE lsc_order;

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
