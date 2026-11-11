package com.linmour.order.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TakeawayQuoteLineVo implements Serializable {
    private static final long serialVersionUID = 1L;
    private Long productId;
    private String name;
    private Long sortId;
    private String picture;
    private String propsText;
    private List<Long> specOptionIds;
    private BigDecimal price;
    private Integer quantity;
    private BigDecimal lineTotal;
}
