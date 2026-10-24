package com.linmour.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.linmour.security.dtos.PageResult;
import com.linmour.system.pojo.Do.AuditLog;
import com.linmour.system.pojo.Dto.AuditLogQueryDto;
import com.linmour.system.pojo.Dto.AuditLogReqDto;

public interface AuditService extends IService<AuditLog> {

    /**
     * S3: Ghi nhật ký thao tác bất đồng bộ (không làm ảnh hưởng tiến trình nghiệp vụ)
     */
    void recordAudit(AuditLogReqDto dto);

    /**
     * S3: Truy vấn nhật ký thao tác phân quyền theo role (Admin xem tất cả, Merchant xem quán mình + tài khoản mình)
     */
    PageResult<AuditLog> getAuditLogs(AuditLogQueryDto queryDto);
}
