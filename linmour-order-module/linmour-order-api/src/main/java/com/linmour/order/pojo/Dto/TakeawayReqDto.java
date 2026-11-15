package com.linmour.order.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TakeawayReqDto implements Serializable {
    private static final long serialVersionUID = 1L;
    /** UUID do client sinh, gửi lại y nguyên khi thử lại */
    private String requestId;
    private List<TakeawayItemDto> items;
    /** 4 Tiền mặt, 1 Chuyển khoản */
    private Integer payType;
    private String remark;
}
