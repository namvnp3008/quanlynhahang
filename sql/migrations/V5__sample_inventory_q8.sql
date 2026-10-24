-- ==========================================
-- V5: Bổ sung dữ liệu tồn kho mẫu (Q8 / PO note)
-- ==========================================
USE `lsc_product`;

-- 1. Chèn tồn kho mẫu cho shop 1:
-- ID 13: Bò tái nạm (phần), tồn 5 phần, ngưỡng cảnh báo 1
-- ID 14: Gà ta thảo mộc (phần), tồn 10 phần, ngưỡng cảnh báo 2
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

-- 2. Liên kết món 1 (Phở Bò Tái Nạm) và món 2 (Phở Gà Ta Thảo Mộc) vào bảng r_product_inventoty
-- Xoá liên kết cũ nếu có của món 1 và 2 trước khi chèn
DELETE FROM `r_product_inventoty` WHERE `product_id` IN (1, 2);

INSERT INTO `r_product_inventoty` (`id`, `product_id`, `inventory_id`, `num`)
VALUES
  (11, 1, 13, 1),
  (12, 2, 14, 1)
ON DUPLICATE KEY UPDATE
  `product_id` = VALUES(`product_id`),
  `inventory_id` = VALUES(`inventory_id`),
  `num` = VALUES(`num`);
