package com.linmour.system.pojo.Dto;

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
public class AuditShopDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long id;

    /**
     * 0: từ chối duyệt, 1: duyệt thành công, 2: đang duyệt
     */
    private Integer auditStatus;

    /**
     * Tỷ lệ phí hoa hồng nền tảng (%)
     */
    private BigDecimal feeRate;
}
