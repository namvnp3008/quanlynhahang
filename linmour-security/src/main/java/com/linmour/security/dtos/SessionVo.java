package com.linmour.security.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * DTO biểu diễn phiên đăng nhập của người dùng (Sprint 9 - S2)
 * Schema: [{ jti4: "…a1b2", createdAt, lastSeenAt, ip, userAgent, current: true|false }]
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionVo implements Serializable {

    private String jti4;
    private String createdAt;
    private String lastSeenAt;
    private String ip;
    private String userAgent;
    private Boolean current;
}
