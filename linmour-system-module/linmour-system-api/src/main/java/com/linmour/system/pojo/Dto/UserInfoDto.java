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
public class UserInfoDto implements Serializable {

    private Long id;
    private String realName;
    private String phone;
    private Integer sex;
    private String avatar;
    private String type;

    private String idCard;

    private String idCardUrl;

    private Integer mustChangePassword;

    private Integer otpEnabled;

    @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY)
    @com.alibaba.fastjson.annotation.JSONField(serialize = false)
    private String oldPassword;

    @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY)
    @com.alibaba.fastjson.annotation.JSONField(serialize = false)
    private String password;
}
