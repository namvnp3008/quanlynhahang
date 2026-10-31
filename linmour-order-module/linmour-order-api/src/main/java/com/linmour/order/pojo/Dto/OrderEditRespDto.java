package com.linmour.order.pojo.Dto;

import com.linmour.order.pojo.Do.OrderInfo;
import com.linmour.order.pojo.Do.OrderItem;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

/**
 * OE-2: Đơn đang mở sau khi sửa, kèm cờ đã huỷ link PayOS đang chờ
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrderEditRespDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private OrderInfo orderInfo;
    private List<OrderItem> orderItems;
    private Boolean payosCancelled;
}
