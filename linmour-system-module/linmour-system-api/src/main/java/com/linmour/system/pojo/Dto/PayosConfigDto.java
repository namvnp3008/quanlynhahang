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
public class PayosConfigDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long shopId;
    private String clientId;
    private String apiKey;
    private String checksumKey;
    private Boolean enabled;
}
