-- V4__shop_certificate_default.sql
-- Thêm giá trị mặc định rỗng cho certificate và intro trong system_shop

USE `lsc_system`;

ALTER TABLE `system_shop` MODIFY COLUMN `certificate` varchar(300) NOT NULL DEFAULT '' COMMENT '经营许可证等证书';
