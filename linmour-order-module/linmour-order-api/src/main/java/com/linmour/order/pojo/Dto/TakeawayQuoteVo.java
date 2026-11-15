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
public class TakeawayQuoteVo implements Serializable {
    private static final long serialVersionUID = 1L;
    private List<TakeawayQuoteLineVo> lines;
    private BigDecimal total;
}
