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
public class PayosConfigReqDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private String clientId;
    private String apiKey;
    private String checksumKey;
    private Boolean enabled;

    /**
     * K1: Mật khẩu hiện tại của merchant thực hiện thay đổi cấu hình (bắt buộc)
     */
    private String currentPassword;

    /**
     * K1: Mã xác thực 2 lớp OTP (bắt buộc nếu tài khoản đã bật OTP)
     */
    private String otpCode;
}
