package com.linmour.product.feign;

import com.linmour.security.dtos.Result;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "linmour-system")
public interface SystemFeign {
    @PostMapping("/system/internal/audit")
    Result recordInternalAudit(@RequestBody AuditLogReqDto reqDto);
}
