-- ==============================================================================
-- Dữ liệu mẫu tiếng Việt cho hệ thống QR Code Orders - SaaS
-- Sprint 0 / Story S0-5
-- Bám sát đặc tả mục 5 (docs/specs/2026-10-21-vietnamese-mobile-web-and-admin-design.md)
-- Tính chất: IDEMPOTENT (chạy nhiều lần không lỗi, không sinh bản ghi trùng lặp)
-- Lưu ý: Các lệnh DELETE được giới hạn an toàn trong phạm vi shop_id = 1 và các ID mẫu
-- (Không xóa toàn bảng để tránh mất dữ liệu của các quán khác trong hệ thống)
-- ==============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 1. CSDL lsc_system: Cập nhật thông tin Quán mẫu và Từ điển nhãn tiếng Việt
-- ------------------------------------------------------------------------------
USE `lsc_system`;

-- Quán mẫu (Shop id = 1): Nhà Hàng Bếp Việt
INSERT INTO `lsc_system`.`system_shop` (
  `id`, `name`, `certificate`, `intro`, `shop_status`, `audit_status`,
  `parent_id`, `fee_rate`, `merchant_id`, `business_status`, `business_hours`,
  `position`, `create_time`, `update_time`, `deleted`
) VALUES (
  1,
  'Nhà Hàng Bếp Việt',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500',
  'Món Việt truyền thống',
  1,
  1,
  0,
  5,
  1,
  1,
  '07:00:00',
  'Số 128 Đường Xuân Thủy, Cầu Giấy, Hà Nội',
  '2024-01-01 07:00:00',
  NOW(),
  0
) ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `certificate` = VALUES(`certificate`),
  `intro` = VALUES(`intro`),
  `shop_status` = VALUES(`shop_status`),
  `audit_status` = VALUES(`audit_status`),
  `parent_id` = VALUES(`parent_id`),
  `fee_rate` = VALUES(`fee_rate`),
  `merchant_id` = VALUES(`merchant_id`),
  `business_status` = VALUES(`business_status`),
  `business_hours` = VALUES(`business_hours`),
  `position` = VALUES(`position`),
  `update_time` = NOW(),
  `deleted` = 0;

-- D-1: Quán 4 là chi nhánh (parent_id = 1) của Quán 1, đảm bảo merchant_id = 1 nhất quán theo quy tắc P4
UPDATE `lsc_system`.`system_shop`
SET `merchant_id` = 1, `update_time` = NOW()
WHERE `id` = 4 AND `parent_id` = 1;

-- Từ điển dữ liệu (system_dict_data): Việt hóa pay_type, pay_status, order_status, table_status
INSERT INTO `lsc_system`.`system_dict_data` (`id`, `label`, `value`, `dict_type`, `status`, `color_type`, `creator`, `creator_time`, `updater`, `updater_time`, `deleted`)
VALUES
  (1, 'Chuyển khoản VietQR', '1', 'pay_type', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (2, 'Ví MoMo', '2', 'pay_type', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (3, 'Điểm thưởng', '3', 'pay_type', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (20, 'Tiền mặt', '4', 'pay_type', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (4, 'Đã thanh toán', '1', 'pay_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (5, 'Chưa thanh toán', '2', 'pay_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (6, 'Đã huỷ', '3', 'pay_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (7, 'Đã hoàn thành', '1', 'order_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (8, 'Đang thực hiện', '2', 'order_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (9, 'Chờ xử lý', '3', 'order_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (10, 'Hoạt động', '1', 'common_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (11, 'Tạm khoá', '0', 'common_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (12, 'Đang bán', '1', 'product_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (13, 'Ngừng bán', '0', 'product_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (14, 'Hết hàng', '2', 'product_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (15, 'Bàn trống', '0', 'table_status', 1, 'success', 1, NOW(), 1, NOW(), b'0'),
  (16, 'Có khách', '1', 'table_status', 1, 'primary', 1, NOW(), 1, NOW(), b'0'),
  (17, 'Đã đặt trước', '2', 'table_status', 1, 'warning', 1, NOW(), 1, NOW(), b'0'),
  (21, 'Tạm dừng', '0', 'shop_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (22, 'Bình thường', '1', 'shop_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (23, 'Từ chối', '0', 'audit_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (24, 'Đã duyệt', '1', 'audit_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (25, 'Chờ duyệt', '2', 'audit_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (26, 'Đang mở cửa', '1', 'business_status', 1, NULL, 1, NOW(), 1, NOW(), b'0'),
  (27, 'Đang đóng cửa', '0', 'business_status', 1, NULL, 1, NOW(), 1, NOW(), b'0')
ON DUPLICATE KEY UPDATE
  `label` = VALUES(`label`),
  `value` = VALUES(`value`),
  `dict_type` = VALUES(`dict_type`),
  `status` = VALUES(`status`),
  `color_type` = VALUES(`color_type`),
  `updater_time` = NOW(),
  `deleted` = b'0';


-- ------------------------------------------------------------------------------
-- 2. CSDL lsc_product: 5 Danh mục, 8 Món ăn chuẩn và Các nhóm tuỳ chọn (Topping/Option)
-- ------------------------------------------------------------------------------
USE `lsc_product`;

-- 5 Danh mục chuẩn của Shop 1 (Chỉ xóa danh mục thừa trong phạm vi shop_id = 1)
DELETE FROM `lsc_product`.`product_sort` WHERE `shop_id` = 1 AND `id` NOT IN (1, 2, 3, 4, 5);

INSERT INTO `lsc_product`.`product_sort` (`id`, `sort`, `shop_id`, `create_time`, `update_time`, `create_by`, `update_by`, `deleted`)
VALUES
  (1, 'Phở & Bún Truyền Thống', 1, '2024-01-01 08:00:00', NOW(), 1, 1, 0),
  (2, 'Cơm Đĩa & Món Nóng', 1, '2024-01-01 08:00:00', NOW(), 1, 1, 0),
  (3, 'Món Khai Vị & Ăn Vặt', 1, '2024-01-01 08:00:00', NOW(), 1, 1, 0),
  (4, 'Cà Phê & Đồ Uống', 1, '2024-01-01 08:00:00', NOW(), 1, 1, 0),
  (5, 'Tráng Miệng', 1, '2024-01-01 08:00:00', NOW(), 1, 1, 0)
ON DUPLICATE KEY UPDATE
  `sort` = VALUES(`sort`),
  `shop_id` = VALUES(`shop_id`),
  `update_time` = NOW(),
  `deleted` = 0;

-- 8 Món ăn chuẩn (Shop 1, status = 1, deleted = 0)
-- intro tối đa 50 ký tự theo schema bảng product_info
-- Chỉ dọn inventory và món cũ của shop_id = 1 (không xóa toàn bảng)
DELETE FROM `lsc_product`.`r_product_inventoty` WHERE `product_id` IN (3, 4, 6, 7, 8);

-- Kho mẫu cho món 1 (Phở Bò Tái Nạm), món 2 (Phở Gà Ta Thảo Mộc) và món 5 (Bánh Mì Thịt Nướng Giòn) - Q8
INSERT INTO `lsc_product`.`product_inventory` (`id`, `name`, `threshold`, `num`, `unit`, `shop_id`, `create_time`, `update_time`, `create_by`, `update_by`, `deleted`)
VALUES
  (13, 'Bò tái nạm (phần)', 1, 5, 'phần', 1, NOW(), NOW(), 1, 1, 0),
  (14, 'Gà ta thảo mộc (phần)', 2, 10, 'phần', 1, NOW(), NOW(), 1, 1, 0),
  (15, 'Bánh mì vỏ giòn (ổ)', 1, 5, 'ổ', 1, NOW(), NOW(), 1, 1, 0)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `threshold` = VALUES(`threshold`),
  `num` = VALUES(`num`),
  `unit` = VALUES(`unit`),
  `shop_id` = VALUES(`shop_id`),
  `deleted` = 0;

INSERT INTO `lsc_product`.`r_product_inventoty` (`id`, `product_id`, `inventory_id`, `num`)
VALUES
  (11, 1, 13, 1),
  (12, 2, 14, 1),
  (13, 5, 15, 1)
ON DUPLICATE KEY UPDATE
  `product_id` = VALUES(`product_id`),
  `inventory_id` = VALUES(`inventory_id`),
  `num` = VALUES(`num`);
DELETE FROM `lsc_product`.`product_info` WHERE `shop_id` = 1 AND `id` NOT IN (1, 2, 3, 4, 5, 6, 7, 8);

INSERT INTO `lsc_product`.`product_info` (
  `id`, `name`, `shop_id`, `intro`, `status`, `sort_id`,
  `picture`, `price`, `create_time`, `update_time`, `deleted`, `create_by`, `update_by`
) VALUES
  (1, 'Phở Bò Tái Nạm', 1, 'Bánh phở tươi, nạm bò mềm, nước dùng ninh xương', 1, 1, 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500&auto=format&fit=crop&q=60', 55000.00, '2024-01-01 08:00:00', NOW(), 0, 1, 1),
  (2, 'Phở Gà Ta Thảo Mộc', 1, 'Gà ta da giòn thịt ngọt, nước thanh ngọt thảo mộc', 1, 1, 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=500&auto=format&fit=crop&q=60', 45000.00, '2024-01-01 08:00:00', NOW(), 0, 1, 1),
  (3, 'Bún Chả Hà Nội', 1, 'Chả nướng than hoa, mắm đu đủ chua ngọt đậm đà', 1, 1, 'https://images.unsplash.com/photo-1594998893017-36147cbcae05?w=500&auto=format&fit=crop&q=60', 50000.00, '2024-01-01 08:00:00', NOW(), 0, 1, 1),
  (4, 'Cơm Tấm Sườn Bì Chả', 1, 'Gạo tấm sườn nướng mật ong thơm ngon kèm chả trứng', 1, 2, 'https://images.unsplash.com/photo-1505253758473-96b3015f21c9?w=500&auto=format&fit=crop&q=60', 45000.00, '2024-01-01 08:00:00', NOW(), 0, 1, 1),
  (5, 'Bánh Mì Thịt Nướng Giòn', 1, 'Vỏ giòn rụm, thịt nướng thơm, pa-tê béo và đồ chua', 1, 3, 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?w=500&auto=format&fit=crop&q=60', 25000.00, '2024-01-01 08:00:00', NOW(), 0, 1, 1),
  (6, 'Cà Phê Sữa Đá Sài Gòn', 1, 'Cà phê Robusta Đắk Lắk pha phin cùng sữa đặc ngọt', 1, 4, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&auto=format&fit=crop&q=60', 25000.00, '2024-01-01 08:00:00', NOW(), 0, 1, 1),
  (7, 'Cà Phê Muối Cố Đô', 1, 'Kem béo mặn nhẹ hòa quyện cà phê đậm đà', 1, 4, 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=500&auto=format&fit=crop&q=60', 30000.00, '2024-01-01 08:00:00', NOW(), 0, 1, 1),
  (8, 'Trà Đào Cam Sả', 1, 'Trà thanh mát, đào giòn ngọt và hương sả dịu thơm', 1, 4, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&auto=format&fit=crop&q=60', 35000.00, '2024-01-01 08:00:00', NOW(), 0, 1, 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `shop_id` = VALUES(`shop_id`),
  `intro` = VALUES(`intro`),
  `status` = VALUES(`status`),
  `sort_id` = VALUES(`sort_id`),
  `picture` = VALUES(`picture`),
  `price` = VALUES(`price`),
  `update_time` = NOW(),
  `deleted` = 0;

-- Nhóm tuỳ chọn (product_spec_sort) & Tuỳ chọn chi tiết (product_spec_option)
-- Chỉ xóa trong phạm vi các món 1..8 của Shop 1
DELETE FROM `lsc_product`.`product_spec_option`
WHERE `spec_sort_id` IN (
  SELECT `id` FROM (SELECT `id` FROM `lsc_product`.`product_spec_sort` WHERE `product_id` IN (1, 2, 3, 4, 5, 6, 7, 8)) AS tmp
) AND `id` NOT IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

DELETE FROM `lsc_product`.`product_spec_sort` WHERE `product_id` IN (1, 2, 3, 4, 5, 6, 7, 8) AND `id` NOT IN (1, 2, 3, 4, 5);

-- 1) Phở Bò Tái Nạm (product_id = 1) -> Size tô
-- 2) Cà Phê Sữa Đá (product_id = 6) -> Mức đá, Độ ngọt
-- 3) Trà Đào Cam Sả (product_id = 8) -> Mức đá, Độ ngọt
INSERT INTO `lsc_product`.`product_spec_sort` (`id`, `name`, `product_id`, `deleted`, `select_type`, `required`)
VALUES
  (1, 'Size tô', 1, 0, 'single', 1),
  (2, 'Mức đá', 6, 0, 'single', 0),
  (3, 'Độ ngọt', 6, 0, 'single', 0),
  (4, 'Mức đá', 8, 0, 'single', 0),
  (5, 'Độ ngọt', 8, 0, 'single', 0),
  (6, 'Topping', 1, 0, 'multi', 0)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `product_id` = VALUES(`product_id`),
  `select_type` = VALUES(`select_type`),
  `required` = VALUES(`required`),
  `deleted` = 0;

INSERT INTO `lsc_product`.`product_spec_option` (`id`, `name`, `price`, `spec_sort_id`, `deleted`)
VALUES
  -- Size tô cho Phở Bò
  (1, 'Tô vừa', 0.00, 1, 0),
  (2, 'Tô lớn', 10000.00, 1, 0),
  -- Mức đá cho Cà phê sữa đá
  (3, 'Bình thường (100% đá)', 0.00, 2, 0),
  (4, 'Ít đá (50% đá)', 0.00, 2, 0),
  (5, 'Không đá', 0.00, 2, 0),
  -- Độ ngọt cho Cà phê sữa đá
  (6, 'Ngọt chuẩn (100% sữa)', 0.00, 3, 0),
  (7, 'Ít ngọt (50% sữa)', 0.00, 3, 0),
  (8, 'Không đường/sữa', 0.00, 3, 0),
  -- Mức đá cho Trà đào cam sả
  (9, 'Bình thường', 0.00, 4, 0),
  (10, 'Ít đá', 0.00, 4, 0),
  -- Độ ngọt cho Trà đào cam sả
  (11, '100% đường (chuẩn)', 0.00, 5, 0),
  (12, '50% đường', 0.00, 5, 0),
  -- Topping cho Phở Bò
  (13, 'Trứng chần', 5000.00, 6, 0),
  (14, 'Quẩy giòn (2 cái)', 5000.00, 6, 0),
  (15, 'Thịt bò thêm', 15000.00, 6, 0)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `price` = VALUES(`price`),
  `spec_sort_id` = VALUES(`spec_sort_id`),
  `deleted` = 0;


-- ------------------------------------------------------------------------------
-- 3. CSDL lsc_restaurant: Bàn ăn Bàn 01 đến Bàn 08 của Shop 1 (qr_code_url để NULL)
-- ------------------------------------------------------------------------------
USE `lsc_restaurant`;

DELETE FROM `lsc_restaurant`.`restaurant_table` WHERE `shop_id` = 1 AND `id` NOT IN (1, 2, 3, 4, 5, 6, 7, 8);

INSERT INTO `lsc_restaurant`.`restaurant_table` (`id`, `name`, `dishes`, `serving`, `status`, `shop_id`, `qr_code_url`, `deleted`)
VALUES
  (1, 'Bàn 01', 0, 0, 0, 1, NULL, 0),
  (2, 'Bàn 02', 0, 0, 0, 1, NULL, 0),
  (3, 'Bàn 03', 0, 0, 0, 1, NULL, 0),
  (4, 'Bàn 04', 0, 0, 0, 1, NULL, 0),
  (5, 'Bàn 05', 0, 0, 0, 1, NULL, 0),
  (6, 'Bàn 06', 0, 0, 0, 1, NULL, 0),
  (7, 'Bàn 07', 0, 0, 0, 1, NULL, 0),
  (8, 'Bàn 08', 0, 0, 0, 1, NULL, 0)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `dishes` = VALUES(`dishes`),
  `serving` = VALUES(`serving`),
  `status` = VALUES(`status`),
  `shop_id` = VALUES(`shop_id`),
  `qr_code_url` = NULL,
  `deleted` = 0;

-- ------------------------------------------------------------------------------
-- 4. CSDL lsc_data_analy: Khởi tạo số liệu tổng hợp ngày từ đơn hàng có sẵn (B-2)
-- ------------------------------------------------------------------------------
USE `lsc_data_analy`;

INSERT INTO `lsc_data_analy`.`order_summary_day` (`date`, `order_num`, `product_num`, `price`, `avg_price`, `shop_id`, `deleted`)
SELECT 
  o.d, 
  o.order_num, 
  COALESCE(p.product_num, 0) AS product_num, 
  o.total_amount, 
  ROUND(o.total_amount / o.order_num, 2) AS avg_price, 
  o.shop_id, 
  0 AS deleted
FROM (
  SELECT DATE(create_time) AS d, shop_id, COUNT(*) AS order_num, SUM(pay_amount) AS total_amount
  FROM `lsc_order`.`order_info`
  WHERE pay_status = 1 AND shop_id IS NOT NULL
  GROUP BY DATE(create_time), shop_id
) o
LEFT JOIN (
  SELECT DATE(o2.create_time) AS d, o2.shop_id, SUM(oi.quantity) AS product_num
  FROM `lsc_order`.`order_info` o2
  JOIN `lsc_order`.`order_item` oi ON o2.id = oi.order_id
  WHERE o2.pay_status = 1 AND o2.shop_id IS NOT NULL
  GROUP BY DATE(o2.create_time), o2.shop_id
) p ON o.d = p.d AND o.shop_id = p.shop_id
ON DUPLICATE KEY UPDATE
  `order_num` = VALUES(`order_num`),
  `product_num` = VALUES(`product_num`),
  `price` = VALUES(`price`),
  `avg_price` = VALUES(`avg_price`),
  `deleted` = 0;

SET FOREIGN_KEY_CHECKS = 1;
