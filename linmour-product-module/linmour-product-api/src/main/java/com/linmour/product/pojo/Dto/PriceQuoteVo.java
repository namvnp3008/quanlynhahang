package com.linmour.product.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.List;

/**
 * OE-1: Kết quả báo giá: đơn giá = giá món + Σ giá tuỳ chọn, tính hoàn toàn từ DB
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PriceQuoteVo implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long productId;
    private String name;
    private Long sortId;
    private String picture;
    private BigDecimal price;
    private String propsText;
    private List<Long> specOptionIds;
}
