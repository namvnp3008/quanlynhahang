package com.linmour.product.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReduceInventoryDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long productId;
    private Integer quantity;
}
