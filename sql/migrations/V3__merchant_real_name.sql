-- V3__merchant_real_name.sql
-- Mở rộng độ dài real_name cho system_merchant (hỗ trợ họ tên tiếng Việt đầy đủ)

USE `lsc_system`;

ALTER TABLE `system_merchant` MODIFY COLUMN `real_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '店主真实姓名';
