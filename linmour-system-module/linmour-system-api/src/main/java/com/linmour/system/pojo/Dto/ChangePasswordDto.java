package com.linmour.system.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * DTO yêu cầu đổi mật khẩu (Sprint 9 - S2)
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChangePasswordDto implements Serializable {

    private String oldPassword;
    private String newPassword;
}
