package com.linmour.restaurant.pojo.Dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AppTableInfoDto implements Serializable {
    private Long id;
    private String name;
    private Long shopId;
}
