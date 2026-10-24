-- V11: Bổ sung các trường bảo mật mật khẩu và xác thực 2 lớp (OTP) cho system_merchant
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
