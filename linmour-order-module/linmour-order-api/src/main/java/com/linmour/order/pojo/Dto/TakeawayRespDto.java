package com.linmour.order.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TakeawayRespDto implements Serializable {
    private static final long serialVersionUID = 1L;
    private Integer ticketNo;
    private String orderId;
    private BigDecimal payAmount;
}
