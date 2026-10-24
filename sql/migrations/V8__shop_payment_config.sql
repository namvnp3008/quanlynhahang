-- Migration V8: Cấu hình cổng thanh toán PayOS theo quán
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
