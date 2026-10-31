package com.linmour.product.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

/**
 * OE-1: Yêu cầu báo giá một món kèm tuỳ chọn (gọi nội bộ từ linmour-order khi admin thêm món vào đơn)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PriceQuoteDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long shopId;
    private Long productId;
    private List<Long> specOptionIds;
}
