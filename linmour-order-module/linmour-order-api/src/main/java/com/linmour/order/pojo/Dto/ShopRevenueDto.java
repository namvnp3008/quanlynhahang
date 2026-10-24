package com.linmour.order.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShopRevenueDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long shopId;
    private String shopName;
    private BigDecimal feeRate;
    private BigDecimal totalRevenue;
    private BigDecimal totalCommission;
    private Long orderCount;
}
