package com.linmour.order.pojo.Do;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Entity giao dịch thanh toán PayOS
 */
@TableName(value = "payos_transaction")
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PayosTransaction implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField(value = "order_code")
    private Long orderCode;

    @TableField(value = "shop_id")
    private Long shopId;

    @TableField(value = "table_id")
    private Long tableId;

    @TableField(value = "order_id")
    private Long orderId;

    @TableField(value = "amount")
    private BigDecimal amount;

    @TableField(value = "description")
    private String description;

    @TableField(value = "status")
    private String status;

    @TableField(value = "payment_link_id")
    private String paymentLinkId;

    @TableField(value = "checkout_url")
    private String checkoutUrl;

    @TableField(value = "qr_code")
    private String qrCode;

    @TableField(value = "reference")
    private String reference;

    @TableField(value = "paid_at")
    private LocalDateTime paidAt;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableLogic
    @TableField(value = "deleted")
    private Integer deleted;
}
