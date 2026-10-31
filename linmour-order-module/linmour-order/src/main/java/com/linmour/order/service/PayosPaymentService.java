package com.linmour.order.service;

import com.linmour.order.pojo.Do.PayosTransaction;
import com.linmour.order.pojo.Dto.PayosCreateReqDto;
import com.linmour.order.pojo.Dto.PayosCreateRespDto;
import com.linmour.order.pojo.Dto.PayosWebhookReqDto;
import com.linmour.security.dtos.Result;

import java.util.List;

public interface PayosPaymentService {

    /**
     * Tạo link thanh toán PayOS cho bàn ăn đang có đơn mở
     *
     * @param shopId ID quán
     * @param reqDto DTO chứa tableId
     * @return Thông tin link thanh toán và mã QR
     */
    PayosCreateRespDto createPaymentLink(Long shopId, PayosCreateReqDto reqDto);

    /**
     * Xử lý webhook thông báo thanh toán từ PayOS
     *
     * @param webhookDto Dữ liệu webhook nhận được
     * @return Result
     */
    Result handleWebhook(PayosWebhookReqDto webhookDto);

    /**
     * Y5: Lấy danh sách giao dịch PayOS theo quán, ngày và trạng thái
     *
     * @param shopId ID quán
     * @param date   Ngày định dạng yyyy-MM-dd
     * @param status Trạng thái (PENDING, PAID, CANCELLED, EXPIRED)
     * @return Danh sách giao dịch
     */
    List<PayosTransaction> getTransactions(Long shopId, String date, String status);

    /**
     * Y5: Đối soát giao dịch với PayOS
     *
     * @param shopId    ID quán
     * @param orderCode Mã đơn hàng PayOS
     * @return Kết quả đối soát
     */
    Result recheckTransaction(Long shopId, Long orderCode);

    /**
     * OE-2: Huỷ mọi link PayOS PENDING của bàn khi chủ quán sửa đơn (tổng tiền đổi)
     *
     * @return true nếu có ít nhất 1 link được huỷ trên cổng PayOS
     */
    boolean cancelPendingLinksForTable(Long shopId, Long tableId);
}
