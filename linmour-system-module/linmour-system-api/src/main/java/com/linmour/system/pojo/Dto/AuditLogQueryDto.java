package com.linmour.system.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * S3: DTO truy vấn nhật ký thao tác
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLogQueryDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private String from;
    private String to;
    private String action;
    private Long shopId;
    private Long merchantId;
    private Long pageNo;
    private Long pageSize;
}
