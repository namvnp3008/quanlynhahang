package com.linmour.order.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Map;

/**
 * Payload webhook từ PayOS
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PayosWebhookReqDto implements Serializable {

    private static final long serialVersionUID = 1L;

    private String code;
    private String desc;
    private Boolean success;
    private Map<String, Object> data;
    private String signature;
}
