package com.linmour.dataAnaly.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderRawDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private String id;
    private Long shopId;
    private BigDecimal payAmount;
    private LocalDateTime createTime;
}
