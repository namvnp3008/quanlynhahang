package com.linmour.system.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Map;

/**
 * S3: DTO yêu cầu ghi nhật ký thao tác
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLogReqDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long shopId;
    private Long merchantId;
    private String actorName;
    private Integer actorType; // 1: platform admin, 2: merchant
    private String action;     // LOGIN_SUCCESS, PASSWORD_CHANGE, PAYOS_CONFIG_CHANGE, PRODUCT_CREATE, etc.
    private String targetType; // PRODUCT, TABLE, SHOP, PAYOS_CONFIG, ORDER, MERCHANT...
    private String targetId;
    private Map<String, Object> detail;
    private String ip;
    private String userAgent;
    private String result;     // SUCCESS / FAIL
}
