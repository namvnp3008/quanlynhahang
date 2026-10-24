package com.linmour.order.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PayosCreateRespDto implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long orderCode;
    private String checkoutUrl;
    private String qrCode;
    private Long amount;
    private Long expiredAt;
    private String paymentLinkId;
}
