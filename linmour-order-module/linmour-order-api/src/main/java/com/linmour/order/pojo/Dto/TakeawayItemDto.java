package com.linmour.order.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TakeawayItemDto implements Serializable {
    private static final long serialVersionUID = 1L;
    private Long productId;
    private List<Long> specOptionIds;
    private Integer quantity;
}
