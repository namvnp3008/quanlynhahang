package com.linmour.order.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlatformRevenueDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private BigDecimal totalRevenue;
    private BigDecimal totalCommission;
    private Long orderCount;
    private List<ShopRevenueDto> shopBreakdown;
}
