package com.linmour.system.pojo.Do;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
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
@TableName("shop_payment_config")
public class ShopPaymentConfig implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long shopId;
    private String clientIdEnc;
    private String apiKeyEnc;
    private String checksumKeyEnc;
    private Integer enabled;
    private Long updatedBy;
    private String updatedByName;
    private String updatedIp;
    private LocalDateTime validatedAt;
    private String validationResult;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Integer deleted;
}
