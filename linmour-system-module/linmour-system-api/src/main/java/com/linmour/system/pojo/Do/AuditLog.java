package com.linmour.system.pojo.Do;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * V12 / S3: Bảng lưu nhật ký thao tác kiểm toán hệ thống (audit_log)
 */
@TableName(value = "audit_log")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLog implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField(value = "shop_id")
    private Long shopId;

    @TableField(value = "merchant_id")
    private Long merchantId;

    @TableField(value = "actor_name")
    private String actorName;

    @TableField(value = "actor_type")
    private Integer actorType;

    @TableField(value = "action")
    private String action;

    @TableField(value = "target_type")
    private String targetType;

    @TableField(value = "target_id")
    private String targetId;

    @TableField(value = "detail")
    private String detail;

    @TableField(value = "ip")
    private String ip;

    @TableField(value = "user_agent")
    private String userAgent;

    @TableField(value = "result")
    private String result;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "create_time")
    private LocalDateTime createTime;

    @TableLogic
    @TableField(value = "deleted")
    private Integer deleted;
}
