package com.linmour.system.controller.admin.audit;

import com.linmour.security.dtos.PageResult;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.system.pojo.Do.AuditLog;
import com.linmour.system.pojo.Dto.AuditLogQueryDto;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import com.linmour.system.service.AuditService;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import javax.annotation.PostConstruct;
import javax.annotation.Resource;

@RestController
@RequestMapping("/system")
public class AuditController {

    @Resource
    private AuditService auditService;

    @Value("${security.internal-token:}")
    private String internalToken;

    @PostConstruct
    public void validateInternalToken() {
        if (StringUtils.isBlank(internalToken)) {
            throw new IllegalStateException("Cấu hình 'security.internal-token' không được để trống! Dịch vụ linmour-system không thể khởi động nếu thiếu token nội bộ.");
        }
    }

    /**
     * S3: Lấy danh sách nhật ký thao tác kiểm toán
     */
    @GetMapping("/audit/logs")
    public Result<PageResult<AuditLog>> getAuditLogs(AuditLogQueryDto queryDto) {
        if (queryDto == null) {
            queryDto = new AuditLogQueryDto();
        }
        return Result.success(auditService.getAuditLogs(queryDto));
    }

    /**
     * S3: API Feign nội bộ ghi nhận nhật ký kiểm toán từ các service khác (product, restaurant, order...)
     * Yêu cầu bắt buộc phải có header X-Internal-Token hợp lệ.
     */
    @PostMapping("/internal/audit")
    public Result recordInternalAudit(
            @RequestHeader(value = "X-Internal-Token", required = false) String reqInternalToken,
            @RequestBody AuditLogReqDto reqDto) {
        String configuredToken = internalToken != null ? internalToken.trim() : "";
        if (StringUtils.isBlank(configuredToken) || reqInternalToken == null || !reqInternalToken.trim().equals(configuredToken)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        if (reqDto != null) {
            auditService.recordAudit(reqDto);
        }
        return Result.success();
    }
}
