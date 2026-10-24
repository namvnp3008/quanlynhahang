-- V1__ui_extensions.sql
-- Migration mở rộng schema cho B7 (UI Extensions)

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

-- Cập nhật cấu hình tuỳ chọn seed data cho Shop 1
-- 1) Size tô: single, required = 1
UPDATE `lsc_product`.`product_spec_sort` 
SET `select_type` = 'single', `required` = 1 
WHERE `id` = 1 AND `name` LIKE '%Size%';

-- 2) Thêm / Cập nhật nhóm Topping cho Phở Bò Tái Nạm (product_id = 1) là multi, required = 0
INSERT INTO `lsc_product`.`product_spec_sort` (`id`, `name`, `product_id`, `deleted`, `select_type`, `required`)
VALUES (6, 'Topping', 1, 0, 'multi', 0)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `product_id` = VALUES(`product_id`),
  `select_type` = VALUES(`select_type`),
  `required` = VALUES(`required`),
  `deleted` = 0;

-- Options cho Topping (Trứng chần, Quẩy giòn, Bò thêm)
INSERT INTO `lsc_product`.`product_spec_option` (`id`, `name`, `price`, `spec_sort_id`, `deleted`)
VALUES
  (13, 'Trứng chần', 5000.00, 6, 0),
  (14, 'Quẩy giòn (2 cái)', 5000.00, 6, 0),
  (15, 'Thịt bò thêm', 15000.00, 6, 0)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `price` = VALUES(`price`),
  `spec_sort_id` = VALUES(`spec_sort_id`),
  `deleted` = 0;
