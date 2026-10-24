package com.linmour.system.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AppShopInfoDto implements Serializable {
    private Long id;
    private String name;
    private String position;
    private String address;
    private String phone;
    private String businessHours;
    private String openTime;
    private String closeTime;
    private Integer auditStatus;
    private Integer shopStatus;
    private Boolean payosEnabled;
}
