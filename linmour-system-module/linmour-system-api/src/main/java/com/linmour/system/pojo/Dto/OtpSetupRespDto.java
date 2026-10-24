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
public class OtpSetupRespDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private String otpauthUri;
    private String secretMasked;
    private String secret;
}
