package com.linmour.order.service;

import com.alibaba.fastjson.JSONObject;
import com.linmour.order.pojo.Dto.PayosCreateRespDto;
import com.linmour.system.pojo.Dto.PayosConfigDto;

public interface PayosClient {

    /**
     * Gửi yêu cầu tạo link thanh toán sang PayOS
     *
     * @param orderCode   Mã đơn hàng PayOS duy nhất
     * @param amount      Số tiền (VNĐ)
     * @param description Mô tả (tối đa 25 ký tự)
     * @param returnUrl   URL chuyển hướng khi thanh toán thành công
     * @param cancelUrl   URL chuyển hướng khi hủy
     * @param expiredAt   Thời điểm hết hạn (Unix timestamp giây)
     * @param config      Cấu hình PayOS của quán (clientId, apiKey, checksumKey)
     * @return PayosCreateRespDto thông tin link và QR
     */
    PayosCreateRespDto createPaymentLink(
            Long orderCode,
            Long amount,
            String description,
            String returnUrl,
            String cancelUrl,
            Long expiredAt,
            PayosConfigDto config
    );

    /**
     * Lấy thông tin thanh toán của đơn hàng từ PayOS
     *
     * @param orderCode Mã đơn hàng PayOS
     * @param config    Cấu hình PayOS của quán
     * @return JSONObject chứa thông tin giao dịch từ PayOS
     */
    JSONObject getPaymentLinkInformation(Long orderCode, PayosConfigDto config);

    /**
     * P-2: Hủy link thanh toán trên cổng PayOS
     *
     * @param orderCode          Mã đơn hàng PayOS
     * @param cancellationReason Lý do hủy
     * @param config             Cấu hình PayOS của quán
     * @return JSONObject kết quả hủy từ PayOS
     */
    JSONObject cancelPaymentLink(Long orderCode, String cancellationReason, PayosConfigDto config);
}
