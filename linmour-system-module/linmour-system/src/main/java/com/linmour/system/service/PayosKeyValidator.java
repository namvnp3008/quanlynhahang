package com.linmour.system.service;

import com.linmour.security.dtos.Result;

public interface PayosKeyValidator {
    /**
     * K2: Kiểm tra tính hợp lệ của bộ key PayOS bằng cách gọi thật:
     * 1. Tạo link thanh toán 2.000đ với description "Kiem tra ket noi"
     * 2. Huỷ ngay lập tức
     * 3. Trả về Result.success("SUCCESS") hoặc Result.success("MOCK") nếu thành công;
     *    trả về Result.error(400, "Key PayOS không hợp lệ: <desc>", data: { payosCode }) nếu thất bại.
     */
    Result validate(String clientId, String apiKey, String checksumKey);
}
