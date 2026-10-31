package com.linmour.order.service;

import com.linmour.order.pojo.Dto.OrderEditReqDto;
import com.linmour.security.dtos.Result;

/**
 * OE-2: Chủ quán sửa đơn đang mở của bàn (đơn còn trong Redis)
 */
public interface OrderEditService {

    Result addItem(Long tableId, OrderEditReqDto req);

    Result updateItemQuantity(Long tableId, int index, OrderEditReqDto req);

    Result removeItem(Long tableId, int index, OrderEditReqDto req);
}
