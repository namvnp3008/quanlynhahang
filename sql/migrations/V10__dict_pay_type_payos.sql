-- V10: Bổ sung loại thanh toán PayOS (pay_type = 5) vào từ điển hệ thống
USE lsc_system;

INSERT INTO system_dict_data (label, value, dict_type, status, creator, updater)
SELECT 'PayOS', '5', 'pay_type', 1, 1, 1
WHERE NOT EXISTS (
    SELECT 1 FROM system_dict_data WHERE dict_type = 'pay_type' AND value = '5'
);
