package com.linmour.system.pojo.Dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class MerchantRegisterDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * Tên chủ quán
     */
    private String realName;

    /**
     * Số điện thoại đăng ký (10 chữ số bắt đầu bằng 0)
     */
    private String phone;

    /**
     * Mật khẩu đăng nhập (tối thiểu 6 ký tự)
     */
    private String password;
}
