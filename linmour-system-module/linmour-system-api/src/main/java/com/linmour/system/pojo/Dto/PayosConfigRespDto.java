package com.linmour.system.pojo.Dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PayosConfigRespDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private Boolean configured;
    private Boolean enabled;
    private String clientIdMasked;

    /**
     * K3: Thời điểm thay đổi cấu hình lần cuối
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastChangedAt;

    /**
     * K3: Tên người thực hiện thay đổi cấu hình lần cuối
     */
    private String lastChangedByName;

    /**
     * K3: Địa chỉ IP thực hiện thay đổi lần cuối
     */
    private String lastChangedIp;

    /**
     * K3: Thời điểm kiểm tra kết nối PayOS thành công
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime validatedAt;

    /**
     * K3: Kết quả kiểm tra ("SUCCESS" hoặc "MOCK")
     */
    private String validationResult;
}

