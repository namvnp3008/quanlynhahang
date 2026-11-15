package com.linmour.order.service;

import com.linmour.order.pojo.Dto.TakeawayItemDto;
import com.linmour.order.pojo.Dto.TakeawayReqDto;
import com.linmour.security.dtos.Result;

import java.util.List;

/** AO-2: Đơn mang về – thu tiền trước, rồi báo bếp */
public interface TakeawayService {
    Result quote(List<TakeawayItemDto> items);

    Result create(TakeawayReqDto req);

    /** orderId phải khớp phiếu đang giữ số ticketNo, tránh giao nhầm phiếu cùng số */
    Result handover(Integer ticketNo, String orderId);
}
