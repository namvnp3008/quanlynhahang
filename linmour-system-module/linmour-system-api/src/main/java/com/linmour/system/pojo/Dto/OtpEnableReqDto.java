package com.linmour.system.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OtpEnableReqDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private String code;
}
