package com.linmour.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.linmour.system.pojo.Do.AuditLog;
import org.apache.ibatis.annotations.Mapper;

/**
 * Mapper cho bảng audit_log
 */
@Mapper
public interface AuditLogMapper extends BaseMapper<AuditLog> {
}
