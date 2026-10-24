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
public class SecurityNoticeRespDto implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * K3: Có thay đổi cấu hình PayOS trong vòng 24 giờ qua hay không
     */
    private Boolean payosChangedWithin24h;

    /**
     * Thời điểm thay đổi
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime changedAt;

    /**
     * Tên người thực hiện thay đổi
     */
    private String changedByName;

    /**
     * IP thực hiện thay đổi
     */
    private String changedIp;
}
