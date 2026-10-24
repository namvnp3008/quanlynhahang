package com.linmour.dataAnaly.pojo.Dto;

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
public class OrderItemRawDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private String orderId;
    private Long shopId;
    private String name;
    private Integer quantity;
    private BigDecimal price;
}
