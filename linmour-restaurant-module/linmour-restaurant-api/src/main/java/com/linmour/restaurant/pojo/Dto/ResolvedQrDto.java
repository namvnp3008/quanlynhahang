package com.linmour.restaurant.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedQrDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long shopId;
    private Long tableId;
    private String tableName;
    private String shopName;
    private Integer shopStatus;
    private Integer auditStatus;
    private String tableAccessToken;
    private String expiresAt;
}
