package com.linmour.order.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

/**
 * OE-2: Yêu cầu chủ quán sửa đơn đang mở của bàn (thêm món / đổi số lượng / xoá món)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderEditReqDto implements Serializable {
    private static final long serialVersionUID = 1L;

    /** Phiên bản đơn admin đang thấy; lệch thì trả 409 */
    private Long version;
    /** Thêm món */
    private Long productId;
    private List<Long> specOptionIds;
    /** Số lượng khi thêm, hoặc số lượng mới khi sửa */
    private Integer quantity;
    /** Bắt buộc khi giảm / xoá món đang làm hoặc đã lên */
    private String reason;
}
